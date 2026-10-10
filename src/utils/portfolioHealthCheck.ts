import { formatDecimal } from './formatters';
import { AggregatedAsset, ScalableSavingsPlan } from '../types';
import { ScalableInterestPlanId, calculateCashYield, interestCapFor } from './cashInterest';

/** 'incomplete' = troppi indicatori senza dati per dare un giudizio complessivo */
export type HealthCheckLevel = 'excellent' | 'good' | 'warning' | 'critical' | 'incomplete';
export type RuleStatus = 'PASS' | 'INFO' | 'WARNING' | 'ALERT';

export interface HealthCheckRuleResult {
  id: string;
  title: string;
  category: 'concentration' | 'liquidity' | 'diversification' | 'rebalancing' | 'costs';
  status: RuleStatus;
  score: number; // 0 - 100
  summary: string;
  details: string;
  recommendation?: string;
  metricLabel: string;
  metricValue: string;
  actionRoute?: string;
  actionLabel?: string;
  /** false = mancano i dati per valutare l'indicatore: non entra nel punteggio */
  hasData: boolean;
}

export interface PortfolioHealthCheckResult {
  overallScore: number; // 0 - 100
  overallLevel: HealthCheckLevel;
  overallSummary: string;
  /** Indicatori con dati sufficienti, su quanti in totale */
  coverage: { withData: number; total: number };
  /** Base su cui sono calcolati i pesi (investito, più la liquidità se inclusa) */
  weightBase: number;
  /** Titoli senza prezzo o cambio aggiornato: i pesi sono calcolati senza di loro (o al costo) */
  incompleteAssets: number;
  /** true = i pesi includono la liquidità (stessa base della quota di liquidità) */
  weightsIncludeCash: boolean;
  rules: HealthCheckRuleResult[];
  hhiIndex: number; // Herfindahl-Hirschman Index (0 - 1)
  topAsset: {
    symbol: string;
    name: string;
    percentage: number;
    value: number;
  } | null;
  cashAllocationPercent: number;
  cashYieldAnnualNet: number;
  weightedTerPercent: number;
  annualEstimatedCosts: number;
}

/**
 * Returns an estimated TER (Total Expense Ratio) for common asset types or ETF tickers.
 * Broad market passive ETFs typically range 0.05% - 0.22%.
 * Individual equities have 0.00% ongoing TER.
 */
export function estimateAssetTer(symbol: string, category?: string): number {
  const sym = symbol.toUpperCase();
  const cat = (category || '').toLowerCase();

  // Known ultra-low cost passive ETFs
  if (sym.includes('SWDA') || sym.includes('VWCE') || sym.includes('IWDA')) return 0.20;
  if (sym.includes('CSSPX') || sym.includes('VUAA') || sym.includes('SXR8') || sym.includes('SPY')) return 0.07;
  if (sym.includes('XEON') || sym.includes('C3M') || sym.includes('SMART')) return 0.10;
  if (sym.includes('EMIM') || sym.includes('EIMI')) return 0.18;
  if (sym.includes('VAGF') || sym.includes('AGGH') || sym.includes('XG7S')) return 0.10;

  // By category
  if (cat.includes('liquidit')) return 0.05;
  if (cat.includes('obbligaz')) return 0.15;
  if (cat.includes('crypto')) return 0.95;
  if (cat.includes('commodit') || cat.includes('materie')) return 0.40;

  // Typical ETF fallback if ticker contains .MI, .DE, UCITS
  if (sym.includes('.MI') || sym.includes('.DE') || sym.includes('UCITS') || cat.includes('etf')) {
    return 0.22;
  }

  // Individual stock
  return 0.00;
}

/**
 * Deterministically analyzes the health, diversification, cash efficiency, and cost drag of a portfolio.
 * 100% mathematical and rule-based - ZERO LLM hallucinations.
 */
export function calculatePortfolioHealthCheck(
  assets: AggregatedAsset[],
  cashBalance: number = 0,
  interestPlan: ScalableInterestPlanId = 'prime',
  /** null = tasso mai impostato: l'analisi lo dichiara invece di assumerne uno */
  interestRate: number | null = null,
  savingsPlans: ScalableSavingsPlan[] = [],
  options: {
    /** false = Scalable non collegato: liquidità e PAC non sono noti */
    scalableConnected?: boolean;
    /** Stessa scelta della dashboard: la liquidità entra nel denominatore dei pesi? */
    includeCashInWeights?: boolean;
    /** Titoli senza prezzo o cambio aggiornato (es. servizio prezzi non raggiungibile) */
    incompleteAssets?: number;
  } = {}
): PortfolioHealthCheckResult {
  const scalableConnected = options.scalableConnected ?? true;
  const includeCashInWeights = options.includeCashInWeights ?? true;
  const incompleteAssets = options.incompleteAssets ?? 0;
  const validAssets = assets.filter((a) => a.currentTotalValue > 0);
  const totalInvestedValue = validAssets.reduce((sum, a) => sum + a.currentTotalValue, 0);
  const totalNetWorth = totalInvestedValue + Math.max(0, cashBalance);
  // Stesso denominatore della dashboard: i pesi devono coincidere tra le schermate
  const weightBase = includeCashInWeights ? totalNetWorth : totalInvestedValue;

  // Niente da analizzare: nessun punteggio, non un 100 regalato
  if (totalNetWorth <= 0) {
    return {
      overallScore: 0,
      overallLevel: 'incomplete',
      overallSummary: 'Il portafoglio non ha posizioni aperte o liquidità.',
      coverage: { withData: 0, total: 5 },
      weightBase: 0,
      incompleteAssets,
      weightsIncludeCash: includeCashInWeights,
      rules: [],
      hhiIndex: 0,
      topAsset: null,
      cashAllocationPercent: 0,
      cashYieldAnnualNet: 0,
      weightedTerPercent: 0,
      annualEstimatedCosts: 0,
    };
  }

  const rules: HealthCheckRuleResult[] = [];

  // ==========================================
  // 1. Concentrazione Singolo Titolo & HHI
  // ==========================================
  let maxWeight = 0;
  let topAssetObj: { symbol: string; name: string; percentage: number; value: number } | null = null;
  let hhi = 0;

  for (const a of validAssets) {
    const weight = weightBase > 0 ? a.currentTotalValue / weightBase : 0;
    hhi += weight * weight;
    if (weight > maxWeight) {
      maxWeight = weight;
      topAssetObj = {
        symbol: a.symbol,
        name: a.name,
        percentage: Number((weight * 100).toFixed(1)),
        value: a.currentTotalValue,
      };
    }
  }

  // Include cash as an asset in HHI
  if (cashBalance > 0 && includeCashInWeights) {
    const cashWeight = cashBalance / totalNetWorth;
    hhi += cashWeight * cashWeight;
  }

  const topPercent = maxWeight * 100;
  const topAssetSource = validAssets.find(a => a.symbol === topAssetObj?.symbol);
  const topAssetIsFund = !!topAssetSource && (
    /etf|fond/i.test(topAssetSource.category || '') || /\b(ETF|ETC|UCITS)\b/i.test(topAssetSource.name)
  );
  let concentrationScore = 100;
  let concentrationStatus: RuleStatus = 'PASS';
  let concentrationSummary = '';
  let concentrationDetails = '';
  let concentrationRec: string | undefined = undefined;

  if (validAssets.length === 1 && cashBalance <= 0) {
    concentrationScore = 55;
    concentrationStatus = 'WARNING';
    concentrationSummary = `Portafoglio mono-asset: ${topAssetObj?.name || topAssetObj?.symbol} rappresenta il 100%`;
    concentrationDetails = 'Tutto il capitale è investito in un unico strumento finanziario.';
    concentrationRec = 'Valuta di aggiungere altre asset class o strumenti complementari per ridurre il rischio specifico.';
  } else if (topPercent > 35 && topAssetIsFund) {
    // Un ETF o fondo è già diversificato al suo interno: il peso sul singolo strumento pesa meno
    concentrationScore = 85;
    concentrationStatus = 'INFO';
    concentrationSummary = `${topAssetObj?.name || topAssetObj?.symbol} pesa il ${formatDecimal(topPercent, 1)}%`;
    concentrationDetails = 'È un ETF o fondo, già diversificato al suo interno: il peso elevato riguarda lo strumento, non un singolo titolo.';
  } else if (topPercent > 35) {
    concentrationScore = 50;
    concentrationStatus = 'ALERT';
    concentrationSummary = `Alta concentrazione: ${topAssetObj?.name || topAssetObj?.symbol} pesa il ${formatDecimal(topPercent, 1)}%`;
    concentrationDetails = `Il titolo principale eccede la soglia prudenziale del 35% del patrimonio (€${formatDecimal(topAssetObj?.value ?? 0, 0)} su €${formatDecimal(weightBase, 0)}).`;
    concentrationRec = 'Per ridurre il peso, i prossimi versamenti possono andare su strumenti meno presenti in portafoglio.';
  } else if (topPercent > 25) {
    concentrationScore = 75;
    concentrationStatus = 'WARNING';
    concentrationSummary = `Concentrazione moderata: ${topAssetObj?.name || topAssetObj?.symbol} pesa il ${formatDecimal(topPercent, 1)}%`;
    concentrationDetails = `Il titolo principale supera il 25% del totale, livello di attenzione moderato.`;
    concentrationRec = 'Mantieni monitorato il peso relativo del titolo durante le fasi di crescita del mercato.';
  } else {
    concentrationScore = 95;
    concentrationStatus = 'PASS';
    concentrationSummary = topAssetObj
      ? `Buona ripartizione: primo titolo (${topAssetObj.name || topAssetObj.symbol}) limitato al ${formatDecimal(topPercent, 1)}%`
      : 'Ripartizione equilibrata dei titoli';
    concentrationDetails = `Nessun singolo titolo supera la soglia di rischio del 25%. HHI: ${formatDecimal(hhi, 2)}.`;
  }

  rules.push({
    id: 'rule_concentration',
    hasData: true,
    title: 'Concentrazione su un titolo',
    category: 'concentration',
    status: concentrationStatus,
    score: concentrationScore,
    summary: concentrationSummary,
    details: concentrationDetails,
    recommendation: concentrationRec,
    metricLabel: 'Asset Principale',
    metricValue: topAssetObj ? `${topAssetObj.name || topAssetObj.symbol} (${formatDecimal(topPercent, 1)}%)` : 'N/D',
  });

  // ==========================================
  // 2. Efficienza della Liquidità & Cash Drag
  // ==========================================
  const cashRatio = cashBalance / totalNetWorth;
  const cashPercent = cashRatio * 100;
  const rateKnown = interestRate !== null;
  const yieldEst = calculateCashYield(cashBalance, interestRate ?? 0, undefined, interestCapFor(interestPlan));

  let cashScore = 100;
  let cashStatus: RuleStatus = 'PASS';
  let cashSummary = '';
  let cashDetails = '';
  let cashRec: string | undefined = undefined;
  let cashActionRoute: string | undefined = undefined;
  let cashActionLabel: string | undefined = undefined;

  if (!scalableConnected) {
    cashScore = 0;
    cashStatus = 'INFO';
    cashSummary = 'Liquidità non collegata';
    cashDetails = 'Collega Scalable per includere nell\'analisi la liquidità e il suo rendimento.';
    cashActionRoute = '/integrations/scalable';
    cashActionLabel = 'Collega Scalable';
  } else if (cashBalance > 0 && !rateKnown) {
    cashScore = 80;
    cashStatus = 'INFO';
    cashSummary = `Liquidità di €${formatDecimal(cashBalance, 0)}, tasso non impostato`;
    cashDetails = `La liquidità è il ${formatDecimal(cashPercent, 1)}% del patrimonio. Imposta il tasso del tuo piano Scalable per stimarne il rendimento.`;
    cashActionRoute = '/integrations/scalable';
    cashActionLabel = 'Imposta il tasso';
  } else if (cashBalance > 0 && interestRate === 0) {
    if (cashPercent > 15) {
      cashScore = 40;
      cashStatus = 'ALERT';
      cashSummary = `Liquidità ferma: €${formatDecimal(cashBalance, 0)} a rendimento 0%`;
      cashDetails = `Il ${formatDecimal(cashPercent, 1)}% del tuo patrimonio è in contanti non remunerati, subendo l'erosione dell'inflazione.`;
      cashRec = 'Attiva un piano remunerato (Prime) o alloca la liquidità su strumenti monetari (es. XEON).';
      cashActionRoute = '/integrations/scalable';
      cashActionLabel = 'Ottimizza Liquidità';
    } else {
      cashScore = 70;
      cashStatus = 'INFO';
      cashSummary = `Liquidità libera non remunerata (€${formatDecimal(cashBalance, 0)})`;
      cashDetails = `La liquidità corrisponde al ${formatDecimal(cashPercent, 1)}% del patrimonio ed è attualmente priva di interessi.`;
    }
  } else if (cashBalance > 0 && (interestRate ?? 0) > 0) {
    if (cashPercent > 40) {
      cashScore = 75;
      cashStatus = 'INFO';
      cashSummary = `Elevata quota di liquidità remunerata (${formatDecimal(cashPercent, 1)}%)`;
      cashDetails = `Rendimento attivo al ${formatDecimal(interestRate ?? 0, 2)}% annuo (+€${formatDecimal(yieldEst.annualNet, 0)} netti/anno), ma quota cash elevata rispetto all'investito.`;
      cashRec = 'Se l\'orizzonte è lungo termine, valuta di programmare un PAC graduale per entrare sul mercato.';
    } else {
      cashScore = 98;
      cashStatus = 'PASS';
      cashSummary = `Liquidità remunerata ottimizzata (${formatDecimal(interestRate ?? 0, 2)}% annuo)`;
      cashDetails = `Genera un rendimento netto stimato di +€${formatDecimal(yieldEst.annualNet, 0)}/anno (€${formatDecimal(yieldEst.monthlyNet, 1)}/mese).`;
    }
  } else {
    // Zero or near zero cash
    if (totalInvestedValue > 1000) {
      cashScore = 80;
      cashStatus = 'INFO';
      cashSummary = 'Nessuna riserva di liquidità monitorata';
      cashDetails = 'Il 100% del capitale monitorato è investito su titoli azionari/obbligazionari.';
      cashRec = 'Mantenere un cuscinetto di liquidità consente di alimentare i PAC ed evitare vendite forzate.';
    } else {
      cashScore = 90;
      cashStatus = 'PASS';
      cashSummary = 'Rapporto di liquidità nella norma';
      cashDetails = 'Patrimonio iniziale in fase di costruzione.';
    }
  }

  rules.push({
    id: 'rule_liquidity',
    hasData: scalableConnected && rateKnown,
    title: 'Liquidità e rendimento',
    category: 'liquidity',
    status: cashStatus,
    score: cashScore,
    summary: cashSummary,
    details: cashDetails,
    recommendation: cashRec,
    metricLabel: 'Rendimento Cash',
    metricValue: (interestRate ?? 0) > 0 ? `${formatDecimal(interestRate ?? 0, 2)}% (+€${formatDecimal(yieldEst.annualNet, 0)}/a)` : '0%',
    actionRoute: cashActionRoute,
    actionLabel: cashActionLabel,
  });

  // ==========================================
  // 3. Diversificazione Macro Categorie
  // ==========================================
  const categoryTotals: Record<string, number> = {};
  validAssets.forEach((a) => {
    const cat = a.category || 'Azioni';
    categoryTotals[cat] = (categoryTotals[cat] || 0) + a.currentTotalValue;
  });
  if (cashBalance > 0) {
    categoryTotals['Liquidità'] = (categoryTotals['Liquidità'] || 0) + cashBalance;
  }

  const categoryEntries = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);
  const numCategories = categoryEntries.length;
  const dominantCategory = categoryEntries[0] || ['Azioni', totalNetWorth];
  const domPercent = (dominantCategory[1] / totalNetWorth) * 100;

  let divScore = 90;
  let divStatus: RuleStatus = 'PASS';
  let divSummary = '';
  let divDetails = '';
  let divRec: string | undefined = undefined;

  const uncategorizedValue = categoryTotals['Altro'] || 0;
  const uncategorizedPercent = (uncategorizedValue / totalNetWorth) * 100;

  if (uncategorizedPercent > 50) {
    // "Altro" vuol dire categoria non impostata: non è un dato sulla diversificazione
    const uncategorizedCount = validAssets.filter(a => (a.category || 'Altro') === 'Altro').length;
    divScore = 85;
    divStatus = 'INFO';
    divSummary = `Categorie da impostare per ${uncategorizedCount} ${uncategorizedCount === 1 ? 'titolo' : 'titoli'}`;
    divDetails = `Il ${formatDecimal(uncategorizedPercent, 0)}% del patrimonio non ha una categoria (azioni, obbligazioni, materie prime…): impostala dal dettaglio del titolo per un'analisi affidabile.`;
  } else if (numCategories === 1) {
    divScore = 70;
    divStatus = 'INFO';
    divSummary = `Portafoglio mono-classe: 100% ${dominantCategory[0]}`;
    divDetails = `Tutti gli strumenti appartengono alla categoria ${dominantCategory[0]}.`;
    divRec = 'Classi poco correlate tra loro (es. obbligazioni, liquidità) tendono a ridurre le oscillazioni complessive.';
  } else if (domPercent > 80 && numCategories > 1) {
    divScore = 80;
    divStatus = 'INFO';
    divSummary = `Predominanza categoria ${dominantCategory[0]} (${formatDecimal(domPercent, 1)}%)`;
    divDetails = `Ripartito su ${numCategories} categorie, con forte esposizione verso ${dominantCategory[0]}.`;
  } else {
    divScore = 95;
    divStatus = 'PASS';
    divSummary = `Ottima diversificazione multi-asset su ${numCategories} classi`;
    divDetails = `Ben distribuito: ${categoryEntries.map(([c, v]) => `${c} ${formatDecimal(((v / totalNetWorth) * 100), 0)}%`).join(', ')}.`;
  }

  rules.push({
    id: 'rule_diversification',
    hasData: uncategorizedPercent <= 50,
    title: 'Diversificazione per categoria',
    category: 'diversification',
    status: divStatus,
    score: divScore,
    summary: divSummary,
    details: divDetails,
    recommendation: divRec,
    metricLabel: 'Ripartizione Classi',
    metricValue: `${numCategories} ${numCategories === 1 ? 'classe' : 'classi'}`,
  });

  // ==========================================
  // 4. Piani di Accumulo & Ribilanciamento DCA
  // ==========================================
  const activePlans = savingsPlans.filter((p) => p.status === 'ACTIVE');
  const monthlyPacTotal = activePlans.reduce((sum, p) => sum + p.amount, 0);

  let pacScore = 90;
  let pacStatus: RuleStatus = 'PASS';
  let pacSummary = '';
  let pacDetails = '';
  let pacRec: string | undefined = undefined;

  if (!scalableConnected && activePlans.length === 0) {
    pacScore = 0;
    pacStatus = 'INFO';
    pacSummary = 'Piani di accumulo non noti';
    pacDetails = 'I PAC si leggono da Scalable: collegalo per includerli nell\'analisi.';
  } else if (activePlans.length > 0) {
    pacScore = 100;
    pacStatus = 'PASS';
    pacSummary = `PAC Scalable attivo (€${formatDecimal(monthlyPacTotal, 0)}/mese su ${activePlans.length} ETF)`;
    pacDetails = `Ribilanciamento automatico dei flussi di cassa: acquisti periodici che contrastano la volatilità senza innescare tasse capital gain.`;
  } else {
    pacScore = 75;
    pacStatus = 'INFO';
    pacSummary = 'Nessun piano PAC automatico rilevato';
    pacDetails = 'Un piano di accumulo periodico riduce il rischio di market timing con acquisti a prezzo medio (DCA).';
    pacRec = 'Attiva un PAC su ETF per sfruttare il ribilanciamento automatico dei nuovi flussi di cassa.';
  }

  rules.push({
    id: 'rule_rebalancing',
    hasData: scalableConnected || activePlans.length > 0,
    title: 'Piani di accumulo (PAC)',
    category: 'rebalancing',
    status: pacStatus,
    score: pacScore,
    summary: pacSummary,
    details: pacDetails,
    recommendation: pacRec,
    metricLabel: 'Piani di Accumulo',
    metricValue: activePlans.length > 0 ? `€${formatDecimal(monthlyPacTotal, 0)}/mese` : 'Disattivo',
    actionRoute: '/pac-calculator',
    actionLabel: 'Apri il simulatore PAC',
  });

  // ==========================================
  // 5. Costi Ponderati (TER & Fee Drag)
  // ==========================================
  let totalWeightedTer = 0;
  validAssets.forEach((a) => {
    const ter = estimateAssetTer(a.symbol, a.category);
    totalWeightedTer += (a.currentTotalValue / totalInvestedValue) * ter;
  });

  const annualEstimatedCost = (totalInvestedValue * totalWeightedTer) / 100;
  let costScore = 95;
  let costStatus: RuleStatus = 'PASS';
  let costSummary = '';
  let costDetails = '';
  let costRec: string | undefined = undefined;

  if (totalWeightedTer === 0) {
    // Nessun costo stimabile (titoli singoli o categorie non impostate): non è un "costo zero"
    costScore = 90;
    costStatus = 'INFO';
    costSummary = 'Costi non stimabili';
    costDetails = 'Per i titoli in portafoglio non è possibile stimare il TER: imposta le categorie (es. ETF) dal dettaglio del titolo.';
  } else if (totalWeightedTer <= 0.22) {
    costScore = 100;
    costStatus = 'PASS';
    costSummary = `Costi molto contenuti (TER medio ${formatDecimal(totalWeightedTer, 2)}%)`;
    costDetails = `Impatto commissionale stimato molto contenuto: circa €${formatDecimal(annualEstimatedCost, 0)} all'anno su €${formatDecimal(totalInvestedValue, 0)} investiti.`;
  } else if (totalWeightedTer <= 0.45) {
    costScore = 85;
    costStatus = 'INFO';
    costSummary = `Costi medi contenuti (TER medio ${formatDecimal(totalWeightedTer, 2)}%)`;
    costDetails = `Spesa stimata di gestione: ~€${formatDecimal(annualEstimatedCost, 0)}/anno.`;
  } else {
    costScore = 60;
    costStatus = 'WARNING';
    costSummary = `Costi elevati (TER medio ${formatDecimal(totalWeightedTer, 2)}%)`;
    costDetails = `I costi di gestione incidono per ~€${formatDecimal(annualEstimatedCost, 0)}/anno, riducendo l'effetto dell'interesse composto.`;
    costRec = 'Confronta i fondi attivi con ETF passivi equivalenti a basso costo per massimizzare il rendimento netto.';
  }

  rules.push({
    id: 'rule_costs',
    hasData: totalWeightedTer > 0,
    title: 'Costi dei fondi (TER)',
    category: 'costs',
    status: costStatus,
    score: costScore,
    summary: costSummary,
    details: costDetails,
    recommendation: costRec,
    metricLabel: 'TER Ponderato',
    metricValue: `${formatDecimal(totalWeightedTer, 2)}% (~€${formatDecimal(annualEstimatedCost, 0)}/a)`,
  });

  // ==========================================
  // Composite Score (0 - 100)
  // Weights: Concentration 30%, Liquidity 25%, Diversification 20%, PAC 15%, Costs 10%
  // ==========================================
  const WEIGHTS: Record<HealthCheckRuleResult['category'], number> = {
    concentration: 0.30,
    liquidity: 0.25,
    diversification: 0.20,
    rebalancing: 0.15,
    costs: 0.10,
  };
  // Solo gli indicatori con dati entrano nel punteggio: un indicatore sconosciuto non è un "quasi promosso"
  const scoredRules = rules.filter(rule => rule.hasData);
  const weightSum = scoredRules.reduce((sum, rule) => sum + WEIGHTS[rule.category], 0);
  const compositeScore = weightSum > 0
    ? Math.round(scoredRules.reduce((sum, rule) => sum + rule.score * WEIGHTS[rule.category], 0) / weightSum)
    : 0;
  const clampedScore = Math.max(0, Math.min(100, compositeScore));
  const coverage = { withData: scoredRules.length, total: rules.length };

  let overallLevel: HealthCheckLevel;
  if (coverage.withData < 3) overallLevel = 'incomplete';
  // Con titoli senza prezzo aggiornato i pesi sono provvisori: "Eccellente" sarebbe una rassicurazione falsa
  else if (clampedScore >= 85 && incompleteAssets === 0) overallLevel = 'excellent';
  else if (clampedScore >= 70) overallLevel = 'good';
  else if (clampedScore >= 50) overallLevel = 'warning';
  else overallLevel = 'critical';

  // Il riassunto descrive cosa hanno trovato gli indicatori, non la fascia del punteggio
  const inSentence = (title: string) => title.charAt(0).toLowerCase() + title.slice(1);
  const titlesWith = (status: RuleStatus) => scoredRules.filter(rule => rule.status === status).map(rule => inSentence(rule.title));
  const alerts = titlesWith('ALERT');
  const warnings = titlesWith('WARNING');
  const missing = rules.filter(rule => !rule.hasData).map(rule => inSentence(rule.title));
  const parts: string[] = [];
  if (incompleteAssets > 0) {
    parts.push(`${incompleteAssets === 1 ? '1 titolo è' : `${incompleteAssets} titoli sono`} senza prezzo o cambio aggiornato: pesi provvisori.`);
  }
  if (alerts.length > 0) parts.push(`Da rivedere: ${alerts.join(', ')}.`);
  if (warnings.length > 0) parts.push(`Da valutare: ${warnings.join(', ')}.`);
  if (alerts.length === 0 && warnings.length === 0 && scoredRules.length > 0) {
    parts.push('Gli indicatori calcolati sono in linea.');
  }
  if (missing.length > 0) parts.push(`Senza dati sufficienti: ${missing.join(', ')}.`);
  const overallSummary = parts.join(' ');

  return {
    overallScore: clampedScore,
    overallLevel,
    overallSummary,
    coverage,
    weightBase,
    incompleteAssets,
    weightsIncludeCash: includeCashInWeights,
    rules,
    hhiIndex: Number(hhi.toFixed(3)),
    topAsset: topAssetObj,
    cashAllocationPercent: Number(cashPercent.toFixed(1)),
    cashYieldAnnualNet: Number(yieldEst.annualNet.toFixed(1)),
    weightedTerPercent: Number(totalWeightedTer.toFixed(2)),
    annualEstimatedCosts: Number(annualEstimatedCost.toFixed(1)),
  };
}
