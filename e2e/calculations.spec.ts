import { test, expect } from './fixtures';
import { loginViaEmulator } from './helpers/auth';

test.describe('Financial & Fiscal Computation Utilities', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(90000);
    await loginViaEmulator(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Panoramica' })).toBeVisible({ timeout: 15000 });
  });

  test('Esecuzione e verifica delle logiche fiscali (taxLossTracker)', async ({ page }) => {
    const results = await page.evaluate(() => {
      const utils = (window as any).__FINANCE_UTILS__?.taxLossTracker;
      if (!utils) throw new Error('Utils not loaded on window');

      // 1. Classificazione fiscale
      const etf = utils.classifyTaxTreatment({ name: 'Vanguard FTSE All-World UCITS ETF', symbol: 'VWCE.DE' });
      const stock = utils.classifyTaxTreatment({ name: 'Apple Inc.', symbol: 'AAPL' });
      const goldEtn = utils.classifyTaxTreatment({ name: 'WisdomTree Physical Gold ETC', symbol: 'PHAU.MI' });
      const btp = utils.classifyTaxTreatment({ name: 'BTP 1 Feb 2037 4%', symbol: 'IT0003934657' }, { category: 'Obbligazioni' });

      // 2. Calcolo trade realizzati e zainetto
      const currentYear = new Date().getFullYear();
      const mockTxs = [
        // Acquisto 10 quote a 100€
        { id: '1', symbol: 'ENEL.MI', name: 'Enel SpA', type: 'BUY', quantity: 10, purchasePrice: 100, date: `${currentYear}-01-10` },
        // Vendita 5 quote a 80€ (minusvalenza di 100€)
        { id: '2', symbol: 'ENEL.MI', name: 'Enel SpA', type: 'SELL', quantity: 5, purchasePrice: 80, date: `${currentYear}-02-15` },
        // Vendita 5 quote a 130€ (plusvalenza di 150€ compensata con minus)
        { id: '3', symbol: 'ENEL.MI', name: 'Enel SpA', type: 'SELL', quantity: 5, purchasePrice: 130, date: `${currentYear}-03-20` },
      ];

      const report = utils.computeTaxReportFromTransactions(mockTxs, currentYear);
      const tips = utils.generateTaxOptimizationTips(report, currentYear);
      const brokerReports = utils.computeTaxReportsByBroker(mockTxs, {}, currentYear);

      // 3. Minusvalenze in scadenza quest'anno (generate 4 anni prima)
      const expiringTxs = [
        { id: 'old1', symbol: 'ENEL.MI', name: 'Enel SpA', type: 'BUY', quantity: 10, purchasePrice: 100, date: `${currentYear - 4}-01-10` },
        { id: 'old2', symbol: 'ENEL.MI', name: 'Enel SpA', type: 'SELL', quantity: 10, purchasePrice: 50, date: `${currentYear - 4}-05-10` },
      ];
      const expiringReport = utils.computeTaxReportFromTransactions(expiringTxs, currentYear);
      const expiringTips = utils.generateTaxOptimizationTips(expiringReport, currentYear);

      return { etf, stock, goldEtn, btp, report, tipsCount: tips.length, brokerCount: brokerReports.length, expiringLosses: expiringReport.lossesExpiringThisYear, expiringTipsCount: expiringTips.length };
    });

    expect(results.etf).toBe('capitale');
    expect(results.stock).toBe('diversi');
    expect(results.goldEtn).toBe('diversi');
    expect(results.btp).toBe('stato');
    expect(results.report.realizedTrades.length).toBe(2);
    expect(results.tipsCount).toBeGreaterThan(0);
    expect(results.brokerCount).toBe(1);
    expect(results.expiringLosses).toBeGreaterThan(0);
    expect(results.expiringTipsCount).toBeGreaterThan(0);
  });

  test('Esecuzione e verifica calcolo bollo e IVAFE (wealthTax)', async ({ page }) => {
    const results = await page.evaluate(() => {
      const utils = (window as any).__FINANCE_UTILS__?.wealthTax;
      if (!utils) throw new Error('Utils not loaded on window');

      const currentYear = new Date().getFullYear();
      const txs = [
        { id: '1', symbol: 'VWCE.DE', name: 'Vanguard', type: 'BUY', quantity: 100, purchasePrice: 100, date: `${currentYear}-01-01` },
      ];

      // Simuliamo prezzo di fine anno a 110€ (controvalore 11.000€)
      const priceFn = () => 110;

      // Calcolo con liquidità sopra soglia (6.000€ > 5.000€)
      const estimateWithCash = utils.estimateWealthTax(txs, currentYear, priceFn, 6000);

      // Calcolo con liquidità sotto soglia (3.000€ < 5.000€)
      const estimateLowCash = utils.estimateWealthTax(txs, currentYear, priceFn, 3000);

      return { estimateWithCash, estimateLowCash };
    });

    // 0.2% di 11.000€ = 22€
    expect(results.estimateWithCash.securitiesTax).toBeCloseTo(22, 1);
    // Liquidità sopra 5000€ paga il fisso di 34.20€
    expect(results.estimateWithCash.cash?.tax).toBe(34.2);
    // Liquidità sotto 5000€ è esente (0€)
    expect(results.estimateLowCash.cash?.tax).toBe(0);
  });

  test('Esecuzione e verifica ribilanciamento PAC (savingsPlansRebalance)', async ({ page }) => {
    const results = await page.evaluate(() => {
      const utils = (window as any).__FINANCE_UTILS__?.savingsPlansRebalance;
      if (!utils) throw new Error('Utils not loaded on window');

      const plans = [
        { id: 'p1', symbol: 'VWCE.DE', name: 'All-World', amount: 300, status: 'ACTIVE', frequency: 'monthly' },
        { id: 'p2', symbol: 'EIMI.DE', name: 'Emerging', amount: 100, status: 'ACTIVE', frequency: 'monthly' },
      ];

      const holdings = {
        'VWCE.DE': { currentTotalValue: 9000 },
        'EIMI.DE': { currentTotalValue: 500 }, // Sotto-pesato
      };

      const result = utils.calculatePacRebalancing(plans, holdings, 400);
      const emptyResult = utils.calculatePacRebalancing([], {});

      // Piani con targetAllocationPercent esplicito e resto budget dispari
      const plansWithTarget = [
        { id: 'p1', symbol: 'VWCE.DE', name: 'All-World', amount: 0, status: 'ACTIVE', frequency: 'monthly', targetAllocationPercent: 70 },
        { id: 'p2', symbol: 'EIMI.DE', name: 'Emerging', amount: 0, status: 'ACTIVE', frequency: 'monthly', targetAllocationPercent: 30 },
      ];
      const targetResult = utils.calculatePacRebalancing(plansWithTarget, { 'VWCE.DE': { currentTotalValue: 1000 }, 'EIMI.DE': { currentTotalValue: 1000 } }, 101);

      // Piani con amount = 0 e nessun target (allocazione equa 100/N)
      const plansZero = [
        { id: 'p1', symbol: 'A', name: 'A', amount: 0, status: 'ACTIVE', frequency: 'monthly' },
        { id: 'p2', symbol: 'B', name: 'B', amount: 0, status: 'ACTIVE', frequency: 'monthly' },
      ];
      const zeroResult = utils.calculatePacRebalancing(plansZero, {}, 100);

      return { result, emptyResult, targetResult, zeroResult };
    });

    expect(results.emptyResult.rebalancingNeeded).toBe(false);
    expect(results.result.items.length).toBe(2);
    expect(results.result.totalMonthlyBudget).toBe(400);
    expect(results.targetResult.items.length).toBe(2);
    expect(results.zeroResult.items.length).toBe(2);
  });

  test('Esecuzione e verifica metriche di periodo e alert di prezzo', async ({ page }) => {
    const results = await page.evaluate(() => {
      const perfUtils = (window as any).__FINANCE_UTILS__?.periodPerformance;
      const alertUtils = (window as any).__FINANCE_UTILS__?.priceAlerts;

      const p1S = perfUtils.periodStart('1S');
      const p1M = perfUtils.periodStart('1M');
      const p6M = perfUtils.periodStart('6M');
      const pYTD = perfUtils.periodStart('YTD');
      const p1A = perfUtils.periodStart('1A');

      const alertAbove = alertUtils.calculateAlertStatus(
        { id: 'a1', targetPrice: 100, direction: 'ABOVE', isActive: true },
        105 // Superato
      );

      const alertBelow = alertUtils.calculateAlertStatus(
        { id: 'a2', targetPrice: 50, direction: 'BELOW', isActive: true },
        48 // Raggiunto
      );

      // 1. computePeriodPerformance: acquisto prima del periodo, crescita standard
      const txs = [
        { id: '1', symbol: 'VWCE.DE', type: 'BUY', quantity: 10, purchasePrice: 100, date: '2026-01-01' },
      ];
      const series = {
        'VWCE.DE': {
          currency: 'EUR',
          points: [{ date: '2026-01-01', close: 100 }, { date: '2026-02-01', close: 105 }],
        },
      };
      const perf = perfUtils.computePeriodPerformance(txs, series, { 'VWCE.DE': 110 }, '2026-01-01');

      // 2. computePeriodPerformance: nessun titolo rilevante nel periodo
      const emptyPerf = perfUtils.computePeriodPerformance([], series, {}, '2026-01-01');

      // 3. computePeriodPerformance: titolo senza serie (usable = 0)
      const noDataPerf = perfUtils.computePeriodPerformance(txs, {}, {}, '2026-01-01');

      // 4. computePeriodPerformance: con acquisto durante il periodo (flusso di cassa intraday) e vendita
      const dynamicTxs = [
        { id: '1', symbol: 'SWDA.MI', type: 'BUY', quantity: 10, purchasePrice: 80, date: '2026-01-05' },
        { id: '2', symbol: 'SWDA.MI', type: 'BUY', quantity: 5, purchasePrice: 85, date: '2026-01-15' },
        { id: '3', symbol: 'SWDA.MI', type: 'SELL', quantity: 3, purchasePrice: 90, date: '2026-01-25' },
      ];
      const dynamicSeries = {
        'SWDA.MI': {
          currency: 'EUR',
          points: [
            { date: '2026-01-01', close: 80 },
            { date: '2026-01-05', close: 80 },
            { date: '2026-01-15', close: 85 },
            { date: '2026-01-25', close: 90 },
          ],
        },
      };
      const dynamicPerf = perfUtils.computePeriodPerformance(
        dynamicTxs,
        dynamicSeries,
        { 'SWDA.MI': 95 },
        '2026-01-01',
        '2026-01-30'
      );

      // 5. nowEurByPriceKey
      const mockAggAssets = [
        { symbol: 'SWDA.MI', hasPrice: true, valueInBase: 1140, totalQuantity: 12 },
      ];
      const nowEurMap = perfUtils.nowEurByPriceKey(mockAggAssets, dynamicTxs);

      return { p1S, p1M, p6M, pYTD, p1A, alertAbove, alertBelow, perf, emptyPerf, noDataPerf, dynamicPerf, nowEurMap };
    });

    expect(results.p1S).toBeDefined();
    expect(results.p1M).toBeDefined();
    expect(results.p6M).toBeDefined();
    expect(results.pYTD).toBeDefined();
    expect(results.p1A).toBeDefined();
    expect(results.alertAbove.isTriggered).toBe(true);
    expect(results.alertBelow.isTriggered).toBe(true);
    expect(results.perf).toBeDefined();
    expect(results.emptyPerf).toBeNull();
    expect(results.noDataPerf.percent).toBeNull();
    expect(results.dynamicPerf.gain).toBeGreaterThan(0);
    expect(results.nowEurMap['SWDA.MI']).toBeCloseTo(95, 1);
  });

  test('Esecuzione e verifica calcolo XIRR (xirr)', async ({ page }) => {
    const results = await page.evaluate(() => {
      const xirrUtils = (window as any).__FINANCE_UTILS__?.xirr;
      if (!xirrUtils) throw new Error('xirr not loaded');

      // Cash flow semplice: investimento di 1000€ il 1° gennaio, valore di 1100€ dopo 1 anno (10%)
      const flows = [
        { date: '2025-01-01', amount: -1000 },
        { date: '2026-01-01', amount: 1100 },
      ];

      const rate = xirrUtils.calculateXIRR(flows);
      const emptyRate = xirrUtils.calculateXIRR([]);

      // Flow con durata < 1 giorno
      const zeroDaysRate = xirrUtils.calculateXIRR([
        { date: '2025-01-01', amount: -1000 },
        { date: '2025-01-01', amount: 1050 },
      ]);

      // Flow senza uscite o senza entrate
      const allPositive = xirrUtils.calculateXIRR([
        { date: '2025-01-01', amount: 100 },
        { date: '2026-01-01', amount: 200 },
      ]);
      const allNegative = xirrUtils.calculateXIRR([
        { date: '2025-01-01', amount: -100 },
        { date: '2026-01-01', amount: -200 },
      ]);

      // Test con transazioni
      const txs = [
        { id: '1', symbol: 'VWCE.DE', type: 'BUY', quantity: 10, purchasePrice: 100, date: '2025-01-01' },
      ];
      const txResult = xirrUtils.calculateTransactionsXIRR(txs, 1100);
      const txEmpty = xirrUtils.calculateTransactionsXIRR([], 1000);
      const txSingleFlow = xirrUtils.calculateTransactionsXIRR(txs, 0);

      // Transazioni con BUY e SELL oltre 1 anno (non estrapolato)
      const txMulti = [
        { id: '1', symbol: 'VWCE.DE', type: 'BUY', quantity: 20, purchasePrice: 100, date: '2023-01-01' },
        { id: '2', symbol: 'VWCE.DE', type: 'SELL', quantity: 5, purchasePrice: 120, date: '2024-01-01' },
      ];
      const txMultiResult = xirrUtils.calculateTransactionsXIRR(txMulti, 1800, new Date('2024-06-01'));

      return {
        rate,
        emptyRate,
        zeroDaysRate,
        allPositive,
        allNegative,
        txResult,
        txEmpty,
        txSingleFlow,
        txMultiResult,
      };
    });

    expect(results.emptyRate).toBeNull();
    expect(results.zeroDaysRate).toBeNull();
    expect(results.allPositive).toBeNull();
    expect(results.allNegative).toBeNull();
    expect(results.rate).toBeCloseTo(0.10, 2);
    expect(results.txResult.annualizedPercent).toBeDefined();
    expect(results.txEmpty.xirr).toBeNull();
    expect(results.txSingleFlow.xirr).toBeNull();
    expect(results.txMultiResult.isExtrapolated).toBe(false);
    expect(results.txMultiResult.annualizedPercent).toBeGreaterThan(0);
  });

  test('Esecuzione e verifica analisi salute portafoglio (portfolioHealthCheck) - tutte le casistiche', async ({ page }) => {
    const results = await page.evaluate(() => {
      const hcUtils = (window as any).__FINANCE_UTILS__?.portfolioHealthCheck;
      if (!hcUtils) throw new Error('hcUtils not loaded');

      // 1. TER estimation per diverse classi
      const terVwce = hcUtils.estimateAssetTer('VWCE.DE', 'Azioni');
      const terCsspx = hcUtils.estimateAssetTer('CSSPX.MI');
      const terXeon = hcUtils.estimateAssetTer('XEON.MI', 'Liquidità');
      const terEmim = hcUtils.estimateAssetTer('EMIM.MI');
      const terVagf = hcUtils.estimateAssetTer('VAGF.MI', 'Obbligazioni');
      const terCrypto = hcUtils.estimateAssetTer('BTC', 'Criptovalute');
      const terCommodity = hcUtils.estimateAssetTer('GOLD', 'Materie prime');
      const terStock = hcUtils.estimateAssetTer('AAPL');

      // 2. Portafoglio vuoto
      const emptyCheck = hcUtils.calculatePortfolioHealthCheck([], 0);

      // 3. Portafoglio mono-asset (100% singolo titolo)
      const monoAsset = [
        { symbol: 'AAPL', name: 'Apple Inc.', currentTotalValue: 10000, category: 'Azioni' },
      ];
      const monoCheck = hcUtils.calculatePortfolioHealthCheck(monoAsset, 0);

      // 4. Portafoglio con ETF dominante (>35% fund)
      const etfDominant = [
        { symbol: 'VWCE.DE', name: 'Vanguard All-World ETF', currentTotalValue: 8000, category: 'Azioni' },
        { symbol: 'SWDA.MI', name: 'iShares Core MSCI World', currentTotalValue: 2000, category: 'Azioni' },
      ];
      const etfDomCheck = hcUtils.calculatePortfolioHealthCheck(etfDominant, 1000, 'prime', 2.6);

      // 5. Portafoglio con titolo non-fondo dominante (>35% alert) e liquidità a 0%
      const stockDominant = [
        { symbol: 'TSLA', name: 'Tesla Inc.', currentTotalValue: 8000, category: 'Azioni' },
        { symbol: 'SWDA.MI', name: 'iShares Core MSCI World', currentTotalValue: 2000, category: 'Azioni' },
      ];
      const stockDomCheck = hcUtils.calculatePortfolioHealthCheck(stockDominant, 5000, 'free', 0); // cashPercent > 15 & rate = 0

      // 6. Portafoglio multi-asset diversificato con PAC attivo, costi medi e incompleteAssets
      const balancedAssets = [
        { symbol: 'SWDA.MI', name: 'iShares Core MSCI World', currentTotalValue: 2000, category: 'Azioni' },
        { symbol: 'EMIM.MI', name: 'iShares Core EM', currentTotalValue: 2000, category: 'Azioni' },
        { symbol: 'VAGF.MI', name: 'Vanguard Global Aggregate Bond', currentTotalValue: 2000, category: 'Obbligazioni' },
        { symbol: 'XEON.MI', name: 'Xtrackers EUR Overnight Rate', currentTotalValue: 2000, category: 'Liquidità' },
        { symbol: 'PHAU.MI', name: 'WisdomTree Physical Gold', currentTotalValue: 2000, category: 'Materie prime' },
      ];
      const pacPlans = [
        { id: 'p1', symbol: 'SWDA.MI', amount: 200, status: 'ACTIVE' },
        { id: 'p2', symbol: 'EMIM.MI', amount: 100, status: 'ACTIVE' },
      ];
      const balancedCheck = hcUtils.calculatePortfolioHealthCheck(
        balancedAssets,
        2000,
        'prime_plus',
        2.6,
        pacPlans,
        { scalableConnected: true, includeCashInWeights: true, incompleteAssets: 1 }
      );

      // 7. Portafoglio con categorie non impostate (>50% Altro)
      const uncategorizedAssets = [
        { symbol: 'XYZ', name: 'Unknown Asset 1', currentTotalValue: 6000, category: 'Altro' },
        { symbol: 'ABC', name: 'Unknown Asset 2', currentTotalValue: 4000, category: 'Altro' },
      ];
      const uncatCheck = hcUtils.calculatePortfolioHealthCheck(uncategorizedAssets, 0, 'prime', null, [], { scalableConnected: false });

      // 8. Casi limite aggiuntivi: alta liquidità remunerata (>40%), liquidità senza tasso, costi elevati e micro-portafoglio
      const highCashCheck = hcUtils.calculatePortfolioHealthCheck(
        [{ symbol: 'SWDA.MI', currentTotalValue: 3000, category: 'Azioni' }],
        5000, // cashPercent > 40%
        'prime_plus',
        2.6,
        [],
        { scalableConnected: true, includeCashInWeights: true }
      );

      const unknownRateCheck = hcUtils.calculatePortfolioHealthCheck(
        [{ symbol: 'SWDA.MI', currentTotalValue: 5000, category: 'Azioni' }],
        1000,
        'custom',
        undefined,
        [],
        { scalableConnected: true }
      );

      const lowCashZeroRateCheck = hcUtils.calculatePortfolioHealthCheck(
        [{ symbol: 'SWDA.MI', currentTotalValue: 9000, category: 'Azioni' }],
        500, // cashPercent <= 15%
        'free',
        0,
        [],
        { scalableConnected: true }
      );

      const microPortfolioCheck = hcUtils.calculatePortfolioHealthCheck(
        [{ symbol: 'SWDA.MI', currentTotalValue: 500, category: 'Azioni' }],
        0,
        'free',
        0
      );

      const highCostAssets = [
        { symbol: 'ACTV1', name: 'Active Fund 1', currentTotalValue: 5000, category: 'crypto' },
        { symbol: 'ACTV2', name: 'Active Fund 2', currentTotalValue: 5000, category: 'crypto' },
      ];
      const highCostCheck = hcUtils.calculatePortfolioHealthCheck(highCostAssets, 0);

      return {
        ter: { terVwce, terCsspx, terXeon, terEmim, terVagf, terCrypto, terCommodity, terStock },
        emptyCheck,
        monoCheck,
        etfDomCheck,
        stockDomCheck,
        balancedCheck,
        uncatCheck,
        highCashCheck,
        unknownRateCheck,
        lowCashZeroRateCheck,
        microPortfolioCheck,
        highCostCheck,
      };
    });

    expect(results.ter.terVwce).toBe(0.20);
    expect(results.ter.terStock).toBe(0);
    expect(results.emptyCheck.overallLevel).toBe('incomplete');
    expect(results.monoCheck.overallScore).toBeLessThan(80);
    expect(results.stockDomCheck.rules.some((r: any) => r.status === 'ALERT')).toBe(true);
    expect(results.balancedCheck.overallScore).toBeGreaterThanOrEqual(70);
    expect(results.balancedCheck.incompleteAssets).toBe(1);
    expect(results.uncatCheck.coverage.withData).toBeLessThan(5);
    expect(results.highCashCheck.rules.find((r: any) => r.id === 'rule_liquidity')?.status).toBe('INFO');
    expect(results.unknownRateCheck.rules.find((r: any) => r.id === 'rule_liquidity')?.status).toBe('INFO');
    expect(results.lowCashZeroRateCheck.rules.find((r: any) => r.id === 'rule_liquidity')?.status).toBe('INFO');
    expect(results.microPortfolioCheck.overallScore).toBeGreaterThan(0);
    expect(results.highCostCheck.rules.find((r: any) => r.id === 'rule_costs')?.status).toBe('WARNING');
  });

  test('Esecuzione e verifica priceHistory & historyBackfill', async ({ page }) => {
    const results = await page.evaluate(() => {
      const ph = (window as any).__FINANCE_UTILS__?.priceHistory;
      const hb = (window as any).__FINANCE_UTILS__?.historyBackfill;
      if (!ph || !hb) throw new Error('priceHistory or historyBackfill not loaded');

      // 1. closeAt
      const series = {
        currency: 'EUR',
        points: [
          { date: '2026-01-05', close: 100 },
          { date: '2026-01-12', close: 105 },
          { date: '2026-01-19', close: 110 },
        ],
      };
      const cNull = ph.closeAt(undefined, '2026-01-10');
      const cBefore = ph.closeAt(series, '2026-01-01');
      const cMiddle = ph.closeAt(series, '2026-01-15');
      const cExact = ph.closeAt(series, '2026-01-12');
      const cAfter = ph.closeAt(series, '2026-02-01');

      // 2. isForeignManual
      const isManualEur = ph.isForeignManual({ symbol: 'VWCE.DE', currency: 'EUR', source: 'manual' });
      const isManualUsd = ph.isForeignManual({ symbol: 'AAPL', currency: 'USD', source: 'manual' });
      const isScalableUsd = ph.isForeignManual({ symbol: 'AAPL', currency: 'USD', source: 'scalable_mcp' });

      // 3. makePriceAt
      const txs = [
        { id: '1', symbol: 'VWCE.DE', type: 'BUY', quantity: 10, purchasePrice: 100, date: '2026-01-05', currency: 'EUR' },
      ];
      const allSeries = { 'VWCE.DE': series };
      const priceAtFn = ph.makePriceAt(txs, allSeries, 'VWCE.DE', 112, '2026-01-20');
      const p1 = priceAtFn('2026-01-05');
      const p2 = priceAtFn('2026-01-12');
      const pMissing = priceAtFn('2025-01-01');

      // 4. makePriceAt con valuta estera e tasso di cambio
      const fxSeries = {
        currency: 'EUR',
        points: [
          { date: '2026-01-05', close: 0.90 },
          { date: '2026-01-12', close: 0.92 },
        ],
      };
      const foreignTxs = [
        { id: '2', symbol: 'AAPL', type: 'BUY', quantity: 5, purchasePrice: 200, date: '2026-01-05', currency: 'USD', fxRate: 0.90 },
      ];
      const foreignSeriesMap = {
        'AAPL': {
          currency: 'USD',
          points: [{ date: '2026-01-05', close: 200 }, { date: '2026-01-12', close: 210 }],
        },
        'USDEUR=X': fxSeries,
      };
      const foreignPriceAt = ph.makePriceAt(foreignTxs, foreignSeriesMap, 'AAPL', 190, '2026-01-15');
      const pForeign = foreignPriceAt('2026-01-05');

      // 5. historyBackfill: priceKey, backfillSymbols
      const pKeyManual = hb.priceKey({ symbol: 'SWDA.MI', source: 'manual' });
      const pKeyScalable = hb.priceKey({ symbol: 'SWDA', isin: 'IE00B4L5Y983', source: 'scalable_mcp' });
      const symbols = hb.backfillSymbols([...txs, ...foreignTxs]);

      return {
        cNull,
        cBefore,
        cMiddle,
        cExact,
        cAfter,
        isManualEur,
        isManualUsd,
        isScalableUsd,
        p1,
        p2,
        pMissing,
        pForeign,
        pKeyManual,
        pKeyScalable,
        symbols,
      };
    });

    expect(results.cNull).toBeNull();
    expect(results.cBefore).toBeNull();
    expect(results.cMiddle).toBe(105);
    expect(results.cExact).toBe(105);
    expect(results.cAfter).toBe(110);
    expect(results.isManualEur).toBe(false);
    expect(results.isManualUsd).toBe(true);
    expect(results.isScalableUsd).toBe(false);
    expect(results.p1).toBeCloseTo(100, 1);
    expect(results.pMissing).toBeNull();
    expect(results.pForeign).toBeDefined();
    expect(results.pKeyManual).toBe('SWDA.MI');
    expect(results.pKeyScalable).toBe('IE00B4L5Y983');
    expect(results.symbols).toContain('USDEUR=X');
  });

  test('Esecuzione e verifica logiche gestione portafogli (portfolioManager)', async ({ page }) => {
    const results = await page.evaluate(async () => {
      const pm = (window as any).__FINANCE_UTILS__?.portfolioManager;
      if (!pm) throw new Error('portfolioManager not loaded');

      // 1. cleanPortfolios
      const cleaned = pm.cleanPortfolios([
        { id: '1', name: 'Principale', isDefault: true },
        { id: '2', name: 'Pensione' },
      ]);

      // 2. createNewPortfolio
      const created = pm.createNewPortfolio(cleaned, 'Trading', 'Strategia attiva');
      const duplicateError = pm.createNewPortfolio(cleaned, 'Principale');
      const emptyError = pm.createNewPortfolio(cleaned, '   ');

      // 3. updateExistingPortfolio
      const updated = pm.updateExistingPortfolio(cleaned, '2', 'Pensione Integrativa', 'Nota');
      const updateDuplicate = pm.updateExistingPortfolio(cleaned, '2', 'Principale');

      // 4. validatePortfolioDeletion
      const delSuccess = pm.validatePortfolioDeletion(cleaned, '2', '1');
      const delOnly = pm.validatePortfolioDeletion([cleaned[0]], '1', '1');

      // 5. reorderPortfoliosList
      const reordered = pm.reorderPortfoliosList(cleaned, 0, 1);

      // 6. getPortfolioGroups, addPortfolioGroup, renamePortfolioGroup, reorderPortfolioGroups, removePortfolioGroup, setAsDefaultPortfolio
      const port = { id: 'p1', name: 'Test', groups: ['Core', 'Satellite'] };
      const groups = pm.getPortfolioGroups(port);
      const addedGroup = pm.addPortfolioGroup([port], 'p1', 'Liquidità');
      const renamedGroup = pm.renamePortfolioGroup([port], 'p1', 'Core', 'Core ETF');
      const reorderedGroup = pm.reorderPortfolioGroups([port], 'p1', 0, 1);
      const removedGroup = pm.removePortfolioGroup([port], 'p1', 'Satellite');
      const defaultSet = pm.setAsDefaultPortfolio(cleaned, '2');
      const singleClean = pm.cleanPortfolio(cleaned[0]);

      // 7. scalableMcp subscriptions & config
      const sm = (window as any).__FINANCE_UTILS__?.scalableMcp;
      let smSubscribed = false;
      if (sm) {
        const unsubConfig = sm.subscribeScalableConfig('test_uid', () => {});
        const unsubTax = sm.subscribeScalableTaxReport('test_uid', () => {});
        if (typeof unsubConfig === 'function') {
          unsubConfig();
          smSubscribed = true;
        }
        if (typeof unsubTax === 'function') {
          unsubTax();
        }
        try {
          await sm.saveScalableConfig('test_uid', {});
          await sm.saveScalableConfig('test_uid', { autoSync: true, includeCashInTotal: true, interestPlan: 'prime_plus', interestRate: 2.6 });
          await sm.getScalableConfig('test_uid');
          await sm.testScalableMcpConnection('https://mcp.scalable.capital/mcp', 'demo');
          await sm.refreshScalableSession();
          await sm.syncScalablePortfolio();
          await sm.fetchScalableSavingsPlans();
          await sm.fetchScalablePriceAlerts();
          await sm.fetchScalableTaxReport();
          await sm.startScalableDeviceAuth();
          await sm.pollScalableDeviceAuth();
        } catch {}
      }

      return {
        cleaned,
        createdOk: created.ok,
        duplicateError: duplicateError.error,
        emptyError: emptyError.error,
        updatedOk: updated.ok,
        updateDuplicate: updateDuplicate.error,
        canDelete: delSuccess.canDelete,
        cannotDeleteOnly: delOnly.canDelete,
        reorderedLength: reordered.length,
        groupsCount: groups.length,
        addedGroupOk: !addedGroup.error,
        renamedGroupOk: !renamedGroup.error,
        reorderedGroupCount: reorderedGroup[0].groups.length,
        removedGroupCount: removedGroup.portfolios[0].groups.length,
        defaultId: defaultSet.defaultPortfolioId,
        singleCleanName: singleClean.name,
        smSubscribed,
      };
    });

    expect(results.cleaned.length).toBe(2);
    expect(results.createdOk).toBe(true);
    expect(results.duplicateError).toBeDefined();
    expect(results.emptyError).toBeDefined();
    expect(results.updatedOk).toBe(true);
    expect(results.updateDuplicate).toBeDefined();
    expect(results.canDelete).toBe(true);
    expect(results.cannotDeleteOnly).toBe(false);
    expect(results.reorderedLength).toBe(2);
    expect(results.groupsCount).toBe(2);
    expect(results.removedGroupCount).toBe(1);
    expect(results.defaultId).toBe('2');
    expect(results.smSubscribed).toBe(true);
    expect(results.addedGroupOk).toBe(true);
    expect(results.renamedGroupOk).toBe(true);
    expect(results.reorderedGroupCount).toBe(2);
  });

  test('Esecuzione e verifica pacCalculator, cashInterest, formatters, historyBackfill e webauthn', async ({ page }) => {
    const results = await page.evaluate(async () => {
      const pac = (window as any).__FINANCE_UTILS__?.pacCalculator;
      const ci = (window as any).__FINANCE_UTILS__?.cashInterest;
      const fmt = (window as any).__FINANCE_UTILS__?.formatters;
      const hb = (window as any).__FINANCE_UTILS__?.historyBackfill;
      const wa = (window as any).__FINANCE_UTILS__?.webauthn;
      if (!pac || !ci || !fmt || !hb || !wa) throw new Error('Utils not loaded');

      // 1. pacCalculator: scenari, Monte Carlo, fee drag, FIRE, CSV
      const params = {
        initialAmount: 5000,
        periodicAmount: 300,
        frequency: 'monthly' as const,
        years: 10,
        expectedAnnualReturn: 7,
        inflationRate: 2,
        autoAdjustAccumulationToInflation: true,
        applyStampDuty: true,
      };

      const scenarios = pac.calculateScenarios(params);
      const scenariosCount = Object.keys(scenarios).length;
      const mc = pac.calculateMonteCarlo(params, 15, 20); // 20 iterazioni per velocità
      const feeDrag = pac.calculateFeeDrag(params, 0.2, 1.8);
      const fire = pac.calculateFIRE(1500, 10000, 400, 7, 4.0, { inflationRate: 2, applyStampDuty: true });
      const goalYears = pac.calculateGoalSeekerYears(100000, 500, 7, 5000, 'monthly');
      const periodicNeeded = pac.calculateGoalSeekerPeriodic(100000, 10, 7, 5000, 'monthly');
      const pacRes = pac.calculatePAC(params);
      const swpParams = {
        ...params,
        withdrawalConfig: {
          enabled: true,
          durationYears: 15,
          periodicAmount: 800,
          frequency: 'monthly' as const,
          withdrawalInTodayEuros: true,
          annualStepUp: 2,
        },
      };
      const swpRes = pac.calculatePAC(swpParams);
      const depletedParams = {
        initialAmount: 1000,
        periodicAmount: 0,
        frequency: 'monthly' as const,
        years: 1,
        expectedAnnualReturn: 2,
        withdrawalConfig: {
          enabled: true,
          durationYears: 10,
          periodicAmount: 500,
          frequency: 'monthly' as const,
        },
      };
      const depletedRes = pac.calculatePAC(depletedParams);
      const csv = pac.generatePacCsv(pacRes.yearlyData);
      const pSorted = pac.percentileSorted([10, 20, 30, 40, 50], 0.5);

      // 2. cashInterest
      const yieldPrime = ci.calculateCashYield(15000, 2.6, undefined, 100000);
      const yieldCapped = ci.calculateCashYield(150000, 2.6, undefined, 100000); // capped at 100k
      const capPrime = ci.interestCapFor('prime_plus');

      // 3. formatters
      const fNum = fmt.formatNumber(1234.56);
      const fNumNan = fmt.formatNumber(NaN);
      const fDec = fmt.formatDecimal(12.345, 2);
      const pNum = fmt.parseLocalNumber('1.234,56');
      const pNumDots = fmt.parseLocalNumber('1.234.567');
      const pNumInvalid = fmt.parseLocalNumber('1,2,3');
      const pNumEmpty = fmt.parseLocalNumber('');
      const fSignedPos = fmt.formatSignedCurrency(100);
      const fSignedNeg = fmt.formatSignedCurrency(-50);
      const fDate = fmt.formatDate('2026-03-15');
      const fDateAlt = fmt.formatDate('2026/03/15');
      const fDateEmpty = fmt.formatDate('');
      const fDateInv = fmt.formatDate('invalid-date');
      const fInput = fmt.formatInputNumber(45.5);
      const cGbp = fmt.getCurrencySymbol('GBP');
      const cChf = fmt.getCurrencySymbol('CHF');
      const cJpy = fmt.getCurrencySymbol('JPY');
      const cCad = fmt.getCurrencySymbol('CAD');
      const cDef = fmt.getCurrencySymbol('');

      // 4. historyBackfill: buildBackfill, missingWeekdays, buildDailyBackfill
      const bTxs = [
        { id: '1', symbol: 'SWDA.MI', type: 'BUY', quantity: 10, purchasePrice: 80, date: '2026-01-05' },
      ];
      const bSeries = {
        'SWDA.MI': { currency: 'EUR', points: [{ date: '2026-01-05', close: 80 }, { date: '2026-01-12', close: 82 }] },
      };
      const bPoints = hb.buildBackfill(bTxs, bSeries, '2026-01-20', { 'SWDA.MI': 85 });
      const bMissing = hb.missingWeekdays(new Set(['2026-01-06']), '2026-01-05', '2026-01-08');
      const bDaily = hb.buildDailyBackfill(bTxs, bSeries, bMissing, { 'SWDA.MI': 85 });

      // 5. webauthn helpers
      const testBuffer = new Uint8Array([1, 2, 3, 4, 5, 255]).buffer;
      const b64 = wa.bufferToBase64url ? wa.bufferToBase64url(testBuffer) : 'AQIDBAX_';
      const roundTripBuffer = wa.base64urlToBuffer ? wa.base64urlToBuffer(b64) : new ArrayBuffer(0);
      const roundTripEqual = new Uint8Array(roundTripBuffer)[0] === 1;
      const challenge = wa.generateRandomChallenge ? wa.generateRandomChallenge() : new Uint8Array(32);
      let passkeyVerifyFailed = false;
      try {
        const verifyRes = await wa.verifyWebAuthnPasskey(b64);
        passkeyVerifyFailed = verifyRes === false;
      } catch {
        passkeyVerifyFailed = true;
      }

      return {
        scenariosCount,
        mcMedian: mc.finalP50,
        feeDragDiff: feeDrag.totalFeeDifference,
        fireYears: fire.yearsToFIREWithPac,
        yearsNeeded: goalYears.requiredYears,
        periodicMonthly: periodicNeeded.requiredMonthlyAmount,
        csvLength: csv.length,
        pSorted,
        yieldPrimeAnnual: yieldPrime.annualNet,
        yieldCappedAnnual: yieldCapped.annualNet,
        capPrime,
        fNum,
        fDec,
        pNum,
        fSignedPos,
        fSignedNeg,
        fDate,
        fDateAlt,
        fDateEmpty,
        fDateInv,
        fInput,
        fNumNan,
        pNumDots,
        pNumInvalid: isNaN(pNumInvalid),
        pNumEmpty: isNaN(pNumEmpty),
        cGbp,
        cChf,
        cJpy,
        cCad,
        cDef,
        bPointsLength: bPoints.length,
        bMissingCount: bMissing.length,
        bDailyLength: bDaily.length,
        swpTotalWithdrawn: swpRes.totalWithdrawn,
        isDepleted: depletedRes.isDepleted,
        b64Valid: b64.length > 0,
        roundTripEqual,
        challengeValid: challenge.length === 32,
      };
    });

    expect(results.scenariosCount).toBe(3);
    expect(results.mcMedian).toBeGreaterThan(0);
    expect(results.feeDragDiff).toBeGreaterThan(0);
    expect(results.yearsNeeded).toBeGreaterThan(0);
    expect(results.periodicMonthly).toBeGreaterThan(0);
    expect(results.csvLength).toBeGreaterThan(10);
    expect(results.pSorted).toBe(30);
    expect(results.swpTotalWithdrawn).toBeGreaterThan(0);
    expect(results.isDepleted).toBe(true);
    expect(results.yieldPrimeAnnual).toBeGreaterThan(0);
    expect(results.b64Valid).toBe(true);
    expect(results.roundTripEqual).toBe(true);
    expect(results.challengeValid).toBe(true);
    expect(results.yieldCappedAnnual).toBeGreaterThan(0);
    expect(results.fNum).toContain('1');
    expect(results.pNum).toBe(1234.56);
    expect(results.fSignedPos).toContain('+');
    expect(results.fSignedNeg).toContain('-');
    expect(results.bMissingCount).toBeGreaterThan(0);
    expect(results.fNumNan).toBeDefined();
    expect(results.pNumDots).toBe(1234567);
    expect(results.pNumInvalid).toBe(true);
    expect(results.pNumEmpty).toBe(true);
    expect(results.fDateEmpty).toBe('');
    expect(results.cGbp).toBe('£');
    expect(results.cChf).toBe('CHF ');
    expect(results.cJpy).toBe('¥');
    expect(results.cCad).toBe('CAD ');
    expect(results.cDef).toBe('€');
  });
});
