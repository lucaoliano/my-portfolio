import { AggregatedAsset, ScalableSavingsPlan } from '../types';
import { ScalableInterestPlanId, calculateCashYield } from './cashInterest';

export type HealthCheckLevel = 'excellent' | 'good' | 'warning' | 'critical';
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
}

export interface PortfolioHealthCheckResult {
  overallScore: number; // 0 - 100
  overallLevel: HealthCheckLevel;
  overallSummary: string;
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
  interestRate: number = 2.6,
  savingsPlans: ScalableSavingsPlan[] = []
): PortfolioHealthCheckResult {
  const validAssets = assets.filter((a) => a.currentTotalValue > 0);
  const totalInvestedValue = validAssets.reduce((sum, a) => sum + a.currentTotalValue, 0);
  const totalNetWorth = totalInvestedValue + Math.max(0, cashBalance);

  if (totalNetWorth <= 0) {
    return {
      overallScore: 100,
      overallLevel: 'excellent',
      overallSummary: 'Il portafoglio non ha posizioni aperte o liquidità.',
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
    const weight = a.currentTotalValue / totalNetWorth;
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
  if (cashBalance > 0) {
    const cashWeight = cashBalance / totalNetWorth;
    hhi += cashWeight * cashWeight;
  }

  const topPercent = maxWeight * 100;
  let concentrationScore = 100;
  let concentrationStatus: RuleStatus = 'PASS';
  let concentrationSummary = '';
  let concentrationDetails = '';
  let concentrationRec: string | undefined = undefined;

  if (validAssets.length === 1 && cashBalance <= 0) {
    concentrationScore = 55;
    concentrationStatus = 'WARNING';
    concentrationSummary = `Portafoglio mono-asset: ${topAssetObj?.symbol} rappresenta il 100%`;
    concentrationDetails = 'Tutto il capitale è investito in un unico strumento finanziario.';
    concentrationRec = 'Valuta di aggiungere altre asset class o strumenti complementari per ridurre il rischio specifico.';
  } else if (topPercent > 35) {
    concentrationScore = 50;
    concentrationStatus = 'ALERT';
    concentrationSummary = `Alta concentrazione: ${topAssetObj?.symbol} pesa il ${topPercent.toFixed(1)}%`;
    concentrationDetails = `Il titolo principale eccede la soglia prudenziale del 35% del patrimonio totale (€${topAssetObj?.value.toFixed(0)} su €${totalNetWorth.toFixed(0)}).`;
    concentrationRec = 'Indirizza i prossimi versamenti o rate del PAC verso asset sottopesati per diluire la concentrazione.';
  } else if (topPercent > 25) {
    concentrationScore = 75;
    concentrationStatus = 'WARNING';
    concentrationSummary = `Concentrazione moderata: ${topAssetObj?.symbol} pesa il ${topPercent.toFixed(1)}%`;
    concentrationDetails = `Il titolo principale supera il 25% del totale, livello di attenzione moderato.`;
    concentrationRec = 'Mantieni monitorato il peso relativo del titolo durante le fasi di crescita del mercato.';
  } else {
    concentrationScore = 95;
    concentrationStatus = 'PASS';
    concentrationSummary = topAssetObj
      ? `Buona ripartizione: asset top (${topAssetObj.symbol}) limitato al ${topPercent.toFixed(1)}%`
      : 'Ripartizione equilibrata dei titoli';
    concentrationDetails = `Nessun singolo asset supera la soglia di rischio del 25%. HHI: ${hhi.toFixed(2)}.`;
  }

  rules.push({
    id: 'rule_concentration',
    title: 'Concentrazione Singolo Titolo',
    category: 'concentration',
    status: concentrationStatus,
    score: concentrationScore,
    summary: concentrationSummary,
    details: concentrationDetails,
    recommendation: concentrationRec,
    metricLabel: 'Asset Principale',
    metricValue: topAssetObj ? `${topAssetObj.symbol} (${topPercent.toFixed(1)}%)` : 'N/D',
  });

  // ==========================================
  // 2. Efficienza della Liquidità & Cash Drag
  // ==========================================
  const cashRatio = cashBalance / totalNetWorth;
  const cashPercent = cashRatio * 100;
  const yieldEst = calculateCashYield(cashBalance, interestRate);

  let cashScore = 100;
  let cashStatus: RuleStatus = 'PASS';
  let cashSummary = '';
  let cashDetails = '';
  let cashRec: string | undefined = undefined;
  let cashActionRoute: string | undefined = undefined;
  let cashActionLabel: string | undefined = undefined;

  if (cashBalance > 0 && interestRate === 0) {
    if (cashPercent > 15) {
      cashScore = 40;
      cashStatus = 'ALERT';
      cashSummary = `Drag da liquidità inoperosa: €${cashBalance.toFixed(0)} a rendimento 0%`;
      cashDetails = `Il ${cashPercent.toFixed(1)}% del tuo patrimonio è in contanti non remunerati, subendo l'erosione dell'inflazione.`;
      cashRec = 'Attiva un piano remunerato (Prime) o alloca la liquidità su strumenti monetari (es. XEON).';
      cashActionRoute = '/integrations/scalable';
      cashActionLabel = 'Ottimizza Liquidità';
    } else {
      cashScore = 70;
      cashStatus = 'INFO';
      cashSummary = `Liquidità libera non remunerata (€${cashBalance.toFixed(0)})`;
      cashDetails = `La liquidità corrisponde al ${cashPercent.toFixed(1)}% del patrimonio ed è attualmente priva di interessi.`;
    }
  } else if (cashBalance > 0 && interestRate > 0) {
    if (cashPercent > 40) {
      cashScore = 75;
      cashStatus = 'INFO';
      cashSummary = `Elevata quota di liquidità remunerata (${cashPercent.toFixed(1)}%)`;
      cashDetails = `Rendimento attivo al ${interestRate.toFixed(2)}% annuo (+€${yieldEst.annualNet.toFixed(0)} netti/anno), ma quota cash elevata rispetto all'investito.`;
      cashRec = 'Se l\'orizzonte è lungo termine, valuta di programmare un PAC graduale per entrare sul mercato.';
    } else {
      cashScore = 98;
      cashStatus = 'PASS';
      cashSummary = `Liquidità remunerata ottimizzata (${interestRate.toFixed(2)}% annuo)`;
      cashDetails = `Genera un rendimento netto stimato di +€${yieldEst.annualNet.toFixed(0)}/anno (€${yieldEst.monthlyNet.toFixed(1)}/mese).`;
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
    title: 'Efficienza Liquidità & Cash Drag',
    category: 'liquidity',
    status: cashStatus,
    score: cashScore,
    summary: cashSummary,
    details: cashDetails,
    recommendation: cashRec,
    metricLabel: 'Rendimento Cash',
    metricValue: interestRate > 0 ? `${interestRate.toFixed(2)}% (+€${yieldEst.annualNet.toFixed(0)}/a)` : '0%',
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

  if (numCategories === 1) {
    divScore = 70;
    divStatus = 'INFO';
    divSummary = `Portafoglio mono-classe: 100% ${dominantCategory[0]}`;
    divDetails = `Tutti gli strumenti appartengono alla categoria ${dominantCategory[0]}.`;
    divRec = 'L\'aggiunta di classi decorrelate (es. bond, liquidità monetaria) riduce il drawdown complessivo.';
  } else if (domPercent > 80 && numCategories > 1) {
    divScore = 80;
    divStatus = 'INFO';
    divSummary = `Predominanza categoria ${dominantCategory[0]} (${domPercent.toFixed(1)}%)`;
    divDetails = `Ripartito su ${numCategories} categorie, con forte esposizione verso ${dominantCategory[0]}.`;
  } else {
    divScore = 95;
    divStatus = 'PASS';
    divSummary = `Ottima diversificazione multi-asset su ${numCategories} classi`;
    divDetails = `Asset ben distribuiti: ${categoryEntries.map(([c, v]) => `${c} ${((v / totalNetWorth) * 100).toFixed(0)}%`).join(', ')}.`;
  }

  rules.push({
    id: 'rule_diversification',
    title: 'Diversificazione Macro Asset Class',
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

  if (activePlans.length > 0) {
    pacScore = 100;
    pacStatus = 'PASS';
    pacSummary = `PAC Scalable attivo (€${monthlyPacTotal.toFixed(0)}/mese su ${activePlans.length} ETF)`;
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
    title: 'Disciplina PAC & Ribilanciamento',
    category: 'rebalancing',
    status: pacStatus,
    score: pacScore,
    summary: pacSummary,
    details: pacDetails,
    recommendation: pacRec,
    metricLabel: 'Piani di Accumulo',
    metricValue: activePlans.length > 0 ? `€${monthlyPacTotal.toFixed(0)}/mese` : 'Disattivo',
    actionRoute: '/pac-calculator',
    actionLabel: 'Apri PAC Calculator',
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

  if (totalWeightedTer <= 0.22) {
    costScore = 100;
    costStatus = 'PASS';
    costSummary = `Strumenti ultra-efficienti (TER medio ${totalWeightedTer.toFixed(2)}%)`;
    costDetails = `Impatto commissionale stimato molto contenuto: circa €${annualEstimatedCost.toFixed(0)} all'anno su €${totalInvestedValue.toFixed(0)} investiti.`;
  } else if (totalWeightedTer <= 0.45) {
    costScore = 85;
    costStatus = 'INFO';
    costSummary = `Costi medi contenuti (TER medio ${totalWeightedTer.toFixed(2)}%)`;
    costDetails = `Spesa stimata di gestione: ~€${annualEstimatedCost.toFixed(0)}/anno.`;
  } else {
    costScore = 60;
    costStatus = 'WARNING';
    costSummary = `Fee drag elevato (TER medio ${totalWeightedTer.toFixed(2)}%)`;
    costDetails = `I costi di gestione incidono per ~€${annualEstimatedCost.toFixed(0)}/anno, riducendo l'effetto dell'interesse composto.`;
    costRec = 'Confronta i fondi attivi con ETF passivi equivalenti a basso costo per massimizzare il rendimento netto.';
  }

  rules.push({
    id: 'rule_costs',
    title: 'Efficienza Costi & Fee Drag',
    category: 'costs',
    status: costStatus,
    score: costScore,
    summary: costSummary,
    details: costDetails,
    recommendation: costRec,
    metricLabel: 'TER Ponderato',
    metricValue: `${totalWeightedTer.toFixed(2)}% (~€${annualEstimatedCost.toFixed(0)}/a)`,
  });

  // ==========================================
  // Composite Score (0 - 100)
  // Weights: Concentration 30%, Liquidity 25%, Diversification 20%, PAC 15%, Costs 10%
  // ==========================================
  const compositeScore = Math.round(
    concentrationScore * 0.30 +
    cashScore * 0.25 +
    divScore * 0.20 +
    pacScore * 0.15 +
    costScore * 0.10
  );

  const clampedScore = Math.max(0, Math.min(100, compositeScore));

  let overallLevel: HealthCheckLevel = 'excellent';
  let overallSummary = 'Portafoglio solido, efficiente e ben strutturato.';

  if (clampedScore >= 85) {
    overallLevel = 'excellent';
    overallSummary = 'Portafoglio eccellente: ottima efficienza dei costi, allocazione equilibrata e gestione dei flussi.';
  } else if (clampedScore >= 70) {
    overallLevel = 'good';
    overallSummary = 'Buona struttura generale: piccoli margini di ottimizzazione su concentrazione o liquidità.';
  } else if (clampedScore >= 50) {
    overallLevel = 'warning';
    overallSummary = 'Attenzione richiesta: riscontrate concentrazioni elevate o liquidità inefficace.';
  } else {
    overallLevel = 'critical';
    overallSummary = 'Rischio elevato: portafoglio sbilanciato con alta esposizione specifica o drag commissionale.';
  }

  return {
    overallScore: clampedScore,
    overallLevel,
    overallSummary,
    rules,
    hhiIndex: Number(hhi.toFixed(3)),
    topAsset: topAssetObj,
    cashAllocationPercent: Number(cashPercent.toFixed(1)),
    cashYieldAnnualNet: Number(yieldEst.annualNet.toFixed(1)),
    weightedTerPercent: Number(totalWeightedTer.toFixed(2)),
    annualEstimatedCosts: Number(annualEstimatedCost.toFixed(1)),
  };
}
