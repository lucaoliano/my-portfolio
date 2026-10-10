import {
  Transaction,
  TaxLossBucket,
  RealizedTrade,
  ScalableTaxReport,
  TaxOptimizationTip,
  TaxTreatment,
  ExcludedTrade,
  BrokerTaxReport,
} from '../types';

export const ITALIAN_CAPITAL_GAINS_TAX_RATE = 0.26; // 26% aliquota standard
/** Titoli di Stato: plusvalenze e minusvalenze contano per il 48,08% (12,5% / 26%) */
export const GOVERNMENT_BOND_WEIGHT = 0.4808;

const EPS = 0.000001;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Informazioni sul titolo dal documento `assets` (tipo di strumento Scalable, classe di attivo) */
export interface TaxAssetMeta {
  instrumentType?: string;
  category?: string;
}

const yearOf = (date: string) => Number(date.slice(0, 4));

/**
 * Natura fiscale del titolo. Prima il tipo di strumento (dato del broker), poi la classe di attivo,
 * poi il nome come ultima risorsa e solo per parole intere ("Netflix" non è un ETF).
 */
export function classifyTaxTreatment(
  tx: Pick<Transaction, 'name' | 'symbol' | 'isin'>,
  meta: TaxAssetMeta = {}
): TaxTreatment {
  const name = (tx.name || '').toUpperCase();
  const type = (meta.instrumentType || '').toUpperCase();
  const isin = (tx.isin || tx.symbol || '').toUpperCase();
  const category = meta.category || '';

  // ETC/ETN (es. oro fisico): redditi diversi, anche se quotati come fondi
  if (/\bET[CN]\b/.test(type) || /\bET[CN]S?\b/.test(name)) return 'diversi';
  if (type.includes('ETF') || type.includes('FUND') || /\b(ETF|UCITS|SICAV|OICR)\b/.test(name)) return 'capitale';
  // ISIN irlandesi e lussemburghesi senza altre indicazioni: quasi sempre fondi, salvo le materie prime
  if (/^(IE|LU)[A-Z0-9]{10}$/.test(isin) && category !== 'Materie prime') return 'capitale';
  if (
    category === 'Obbligazioni' &&
    /\b(BTP|BOT|CCT|CTZ|BUND|OAT|BONOS|TREASURY|GOVT|GOVERNMENT|REPUBBLICA|REPUBLIC)\b/.test(name)
  ) {
    return 'stato';
  }
  return 'diversi';
}

const brokerOf = (tx: Transaction): BrokerTaxReport['brokerId'] =>
  tx.source === 'scalable_mcp' ? 'scalable' : 'manual';

const securityKey = (tx: Transaction) => (tx.isin || tx.symbol).toUpperCase();

/**
 * Vendite realizzate con il **costo medio ponderato** (art. 68 TUIR), in euro.
 * Commissioni: aumentano il costo di acquisto e riducono l'incasso di vendita.
 * Una vendita in valuta estera senza cambio, o senza acquisti sufficienti, resta fuori dal calcolo
 * ed è elencata: meglio un buco dichiarato che una plusvalenza inventata.
 */
export function calculateRealizedTrades(
  transactions: Transaction[],
  assetMeta: Record<string, TaxAssetMeta> = {}
): { trades: RealizedTrade[]; excluded: ExcludedTrade[] } {
  // Ordine cronologico; nello stesso giorno gli acquisti prima delle vendite
  const sorted = [...transactions].sort((a, b) => {
    const byDate = a.date.slice(0, 10).localeCompare(b.date.slice(0, 10));
    if (byDate !== 0) return byDate;
    const rank = (t: Transaction) => ((t.type || 'BUY').toUpperCase() === 'SELL' ? 1 : 0);
    return rank(a) - rank(b) || a.date.localeCompare(b.date);
  });

  const positions = new Map<string, { quantity: number; costEur: number; costUnknown: boolean }>();
  const trades: RealizedTrade[] = [];
  const excluded: ExcludedTrade[] = [];

  for (const tx of sorted) {
    const key = securityKey(tx);
    const qty = Number(tx.quantity) || 0;
    const price = Number(tx.purchasePrice) || 0;
    if (qty <= 0) continue;
    const isForeign = !!tx.currency && tx.currency.toUpperCase() !== 'EUR';
    const fx = isForeign ? (tx.fxRate && tx.fxRate > 0 ? tx.fxRate : null) : 1;
    const fee = Number(tx.fee) || 0;
    const pos = positions.get(key) ?? { quantity: 0, costEur: 0, costUnknown: false };
    positions.set(key, pos);

    if ((tx.type || 'BUY').toUpperCase() !== 'SELL') {
      pos.quantity += qty;
      if (fx === null) pos.costUnknown = true;
      else pos.costEur += qty * price * fx + fee;
      continue;
    }

    const base = { id: tx.id || `${key}_${tx.date}`, symbol: tx.symbol, name: tx.name || tx.symbol, date: tx.date, quantity: qty };
    if (qty > pos.quantity + EPS) {
      excluded.push({ ...base, reason: 'uncovered' });
      positions.set(key, { quantity: 0, costEur: 0, costUnknown: false });
      continue;
    }
    const avgCost = pos.quantity > 0 ? pos.costEur / pos.quantity : 0;
    const costBasis = avgCost * qty;
    const unknownCost = pos.costUnknown;
    pos.quantity -= qty;
    pos.costEur -= costBasis;
    if (pos.quantity <= EPS) positions.set(key, { quantity: 0, costEur: 0, costUnknown: false });

    if (fx === null || unknownCost) {
      excluded.push({ ...base, reason: 'fx' });
      continue;
    }
    const proceeds = qty * price * fx - fee;
    const gain = round2(proceeds - costBasis);
    const meta = assetMeta[tx.symbol] || (tx.isin ? assetMeta[tx.isin] : undefined) || {};
    trades.push({
      ...base,
      salePrice: price,
      costBasis: round2(costBasis),
      proceeds: round2(proceeds),
      realizedGainOrLoss: gain,
      isLoss: gain < 0,
      category: meta.category,
      treatment: classifyTaxTreatment(tx, meta),
      currency: tx.currency || 'EUR',
    });
  }

  return { trades, excluded };
}

/**
 * Zainetto per anno secondo le regole italiane, elaborato in ordine di data:
 * - una minusvalenza dell'anno N è utilizzabile fino al 31 dicembre di N+4;
 * - una plusvalenza compensa solo minusvalenze già realizzate, partendo dalle più vecchie;
 * - i guadagni da ETF/fondi (redditi di capitale) non compensano;
 * - titoli di Stato al 48,08%.
 */
export function buildTaxBuckets(
  trades: RealizedTrade[],
  currentYear = new Date().getFullYear()
): TaxLossBucket[] {
  const buckets = new Map<number, TaxLossBucket>();
  const ordered = [...trades].sort((a, b) => a.date.localeCompare(b.date));

  for (const trade of ordered) {
    const year = yearOf(trade.date);
    const weight = trade.treatment === 'stato' ? GOVERNMENT_BOND_WEIGHT : 1;

    if (trade.isLoss) {
      const bucket = buckets.get(year) ?? {
        yearCreated: year,
        yearExpires: year + 4,
        initialAmount: 0,
        remainingAmount: 0,
        compensatedAmount: 0,
        isExpiringThisYear: false,
        status: 'ACTIVE' as const,
      };
      const amount = Math.abs(trade.realizedGainOrLoss) * weight;
      bucket.initialAmount = round2(bucket.initialAmount + amount);
      bucket.remainingAmount = round2(bucket.remainingAmount + amount);
      buckets.set(year, bucket);
      continue;
    }

    if (trade.treatment === 'capitale' || trade.realizedGainOrLoss <= 0) continue;
    let gainLeft = trade.realizedGainOrLoss * weight;
    const usable = Array.from(buckets.values())
      .filter(b => b.yearCreated <= year && b.yearExpires >= year && b.remainingAmount > 0.005)
      .sort((a, b) => a.yearCreated - b.yearCreated);
    for (const bucket of usable) {
      if (gainLeft <= 0.005) break;
      const used = Math.min(bucket.remainingAmount, gainLeft);
      bucket.remainingAmount = round2(bucket.remainingAmount - used);
      bucket.compensatedAmount = round2(bucket.compensatedAmount + used);
      gainLeft -= used;
    }
  }

  // Lo stato si decide alla fine: un anno scaduto ma usato per intero è "compensato", non "scaduto"
  return Array.from(buckets.values())
    .filter(b => b.initialAmount > 0)
    .map(b => {
      const status: TaxLossBucket['status'] = b.remainingAmount <= 0.005
        ? 'COMPENSATED'
        : b.yearExpires < currentYear ? 'EXPIRED' : 'ACTIVE';
      return {
        ...b,
        remainingAmount: b.remainingAmount <= 0.005 ? 0 : b.remainingAmount,
        status,
        isExpiringThisYear: status === 'ACTIVE' && b.yearExpires === currentYear,
      };
    })
    .sort((a, b) => a.yearCreated - b.yearCreated);
}

/** Zainetto calcolato da un insieme di transazioni (un solo intermediario). */
export function computeTaxReportFromTransactions(
  transactions: Transaction[],
  currentYear = new Date().getFullYear(),
  assetMeta: Record<string, TaxAssetMeta> = {}
): ScalableTaxReport {
  const { trades, excluded } = calculateRealizedTrades(transactions, assetMeta);
  const buckets = buildTaxBuckets(trades, currentYear);
  const active = buckets.filter(b => b.status === 'ACTIVE');
  const totalActiveLosses = round2(active.reduce((sum, b) => sum + b.remainingAmount, 0));
  const lossesExpiringThisYear = round2(active.filter(b => b.isExpiringThisYear).reduce((sum, b) => sum + b.remainingAmount, 0));

  const thisYear = trades.filter(t => yearOf(t.date) === currentYear);
  const realizedGainsCurrentYear = round2(thisYear.filter(t => !t.isLoss && t.treatment !== 'capitale').reduce((s, t) => s + t.realizedGainOrLoss, 0));
  const fundGainsCurrentYear = round2(thisYear.filter(t => !t.isLoss && t.treatment === 'capitale').reduce((s, t) => s + t.realizedGainOrLoss, 0));
  const realizedLossesCurrentYear = round2(thisYear.filter(t => t.isLoss).reduce((s, t) => s + Math.abs(t.realizedGainOrLoss), 0));

  return {
    totalActiveLosses,
    potentialTaxSavings: round2(totalActiveLosses * ITALIAN_CAPITAL_GAINS_TAX_RATE),
    lossesExpiringThisYear,
    realizedGainsCurrentYear,
    realizedLossesCurrentYear,
    netRealizedCurrentYear: round2(realizedGainsCurrentYear - realizedLossesCurrentYear),
    fundGainsCurrentYear,
    buckets,
    realizedTrades: trades,
    excludedTrades: excluded,
    lastCalculatedAt: new Date().toISOString(),
    source: 'calculated',
  };
}

/**
 * Un zainetto per intermediario: le transazioni Scalable da una parte, quelle inserite a mano dall'altra.
 * Nel regime amministrato le minusvalenze non passano da un broker all'altro.
 */
export function computeTaxReportsByBroker(
  transactions: Transaction[],
  assetMeta: Record<string, TaxAssetMeta> = {},
  currentYear = new Date().getFullYear()
): BrokerTaxReport[] {
  const labels: Record<BrokerTaxReport['brokerId'], string> = {
    scalable: 'Scalable Capital',
    manual: 'Transazioni inserite a mano',
  };
  return (['scalable', 'manual'] as const)
    .map(brokerId => {
      const txs = transactions.filter(t => brokerOf(t) === brokerId);
      if (txs.length === 0) return null;
      return { brokerId, label: labels[brokerId], report: computeTaxReportFromTransactions(txs, currentYear, assetMeta) };
    })
    .filter((r): r is BrokerTaxReport => r !== null);
}

/**
 * Regole di riferimento ("cosa compensa cosa") e scadenze: fatti, non inviti a comprare o vendere.
 */
export function generateTaxOptimizationTips(
  report: ScalableTaxReport | null,
  currentYear = new Date().getFullYear()
): TaxOptimizationTip[] {
  const tips: TaxOptimizationTip[] = [];

  if (report && report.lossesExpiringThisYear > 0) {
    tips.push({
      id: 'expiring_losses',
      type: 'EXPIRING_LOSSES',
      title: `Minusvalenze in scadenza il 31 dicembre ${currentYear}`,
      description: `Le minusvalenze del ${currentYear - 4} non ancora compensate (stimate in ${formatEur(report.lossesExpiringThisYear)}) non saranno più utilizzabili dal 1° gennaio ${currentYear + 1}.`,
      impactEur: report.lossesExpiringThisYear,
      priority: 'HIGH',
    });
  }

  tips.push(
    {
      id: 'rule_compensates',
      type: 'COMPENSATION_RULE',
      title: 'Compensano le minusvalenze',
      description: 'Plusvalenze da azioni, ETC/ETN (ad esempio oro fisico), certificati e obbligazioni. Le plusvalenze da titoli di Stato contano per il 48,08%.',
      priority: 'LOW',
    },
    {
      id: 'rule_not_compensates',
      type: 'COMPENSATION_RULE',
      title: 'Non compensano',
      description: 'I guadagni da ETF e fondi (OICR): sono redditi di capitale, tassati senza usare lo zainetto. Le perdite su ETF e fondi invece entrano nello zainetto.',
      priority: 'LOW',
    },
    {
      id: 'rule_expiry',
      type: 'INFO',
      title: 'Scadenza',
      description: "Una minusvalenza si può usare nell'anno in cui nasce e nei quattro successivi, fino al 31 dicembre.",
      priority: 'LOW',
    },
    {
      id: 'rule_broker',
      type: 'INFO',
      title: 'Uno zainetto per intermediario',
      description: "Nel regime amministrato il broker compensa solo le minusvalenze nate presso di lui. Per usarle altrove serve la certificazione del broker e la dichiarazione dei redditi.",
      priority: 'LOW',
    }
  );

  return tips;
}

const formatEur = (value: number) =>
  `€${new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`;
