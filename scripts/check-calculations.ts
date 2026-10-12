// Verifiche del calcolo fiscale e dei numeri: npm run test:calc
import { parseLocalNumber, formatInputNumber, formatNumber } from '../src/utils/formatters';
import { computeTaxReportFromTransactions as c, classifyTaxTreatment as k, computeTaxReportsByBroker as b } from '../src/utils/taxLossTracker';
import { Transaction, ScalablePriceAlert } from '../src/types';
import { calculateAlertStatus } from '../src/utils/priceAlerts';
import { activeMonthlyTotal, monthlyEquivalent } from '../src/utils/savingsPlans';
import { calculateCashYield } from '../src/utils/cashInterest';
import { calculatePosition, calculatePortfolioAggregation } from '../src/utils/portfolioAggregator';
import { calculateTransactionsXIRR, calculateXIRR } from '../src/utils/xirr';
import { YahooQuote } from '../src/services/yahooFinance';
import { buildBackfill, backfillSymbols, buildDailyBackfill, missingWeekdays } from '../src/utils/historyBackfill';
import { computePeriodPerformance, periodStart } from '../src/utils/periodPerformance';
import { estimateWealthTax } from '../src/utils/wealthTax';
let fails = 0;
const eq = (label: string, got: unknown, exp: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(exp); if (!ok) fails++; console.log(ok ? 'OK  ' : 'FAIL', label, ok ? '' : `got ${JSON.stringify(got)} exp ${JSON.stringify(exp)}`); };
const tx = (o: Partial<Transaction>): Transaction => ({ symbol: 'X', name: 'Acme SpA', quantity: 1, purchasePrice: 1, date: '2025-01-01', type: 'BUY', ...o });
// PMC
let r = c([tx({quantity:10,purchasePrice:100,date:'2025-01-01'}),tx({quantity:10,purchasePrice:200,date:'2025-02-01'}),tx({type:'SELL',quantity:10,purchasePrice:150,date:'2025-03-01'})], 2026);
eq('PMC gain 0', r.realizedTrades[0].realizedGainOrLoss, 0);
// fees
r = c([tx({quantity:10,purchasePrice:100,fee:5}),tx({type:'SELL',quantity:10,purchasePrice:100,fee:5,date:'2025-06-01'})], 2026);
eq('fees loss -10', r.realizedTrades[0].realizedGainOrLoss, -10);
// FX
r = c([tx({symbol:'AAPL',name:'Apple',currency:'USD',fxRate:1/1.1,quantity:10,purchasePrice:150}),tx({symbol:'AAPL',name:'Apple',currency:'USD',fxRate:1,type:'SELL',quantity:10,purchasePrice:150,date:'2025-05-01'})], 2026);
eq('FX gain 136.36', r.realizedTrades[0].realizedGainOrLoss, 136.36);
r = c([tx({currency:'USD',quantity:1,purchasePrice:10}),tx({currency:'USD',type:'SELL',quantity:1,purchasePrice:12,date:'2025-05-01'})], 2026);
eq('FX missing excluded', r.excludedTrades!.map(e=>e.reason), ['fx']);
// uncovered
r = c([tx({type:'SELL',quantity:10,purchasePrice:100})], 2026);
eq('uncovered excluded', [r.realizedTrades.length, r.excludedTrades![0].reason], [0,'uncovered']);
// same-day buy then sell
r = c([tx({type:'SELL',quantity:1,purchasePrice:12,date:'2025-05-01T15:00:00Z'}),tx({quantity:1,purchasePrice:10,date:'2025-05-01T09:00:00Z'})], 2026);
eq('same day order', r.realizedTrades[0]?.realizedGainOrLoss, 2);
// ETF classification
eq('Netflix not ETF', k({name:'Netflix, Inc.',symbol:'NFLX'}), 'diversi');
eq('iShares Core MSCI World IE -> capitale', k({name:'iShares Core MSCI World',symbol:'IE00B4L5Y983',isin:'IE00B4L5Y983'}), 'capitale');
eq('Physical Gold ETC -> diversi', k({name:'iShares Physical Gold ETC',symbol:'IE00B4ND3602',isin:'IE00B4ND3602'}), 'diversi');
eq('Gold by class -> diversi', k({name:'Amundi Physical Gold',symbol:'FR0013416716',isin:'FR0013416716'},{category:'Materie prime'}), 'diversi');
eq('Scalable type ETF', k({name:'Invesco Global Active ESG Equity (Acc)',symbol:'IE00BJQRDN15'},{instrumentType:'ETF'}), 'capitale');
eq('BTP -> stato', k({name:'BTP Italia 2030',symbol:'IT0005'},{category:'Obbligazioni'}), 'stato');
// expiry + compensation, used expired bucket
r = c([tx({quantity:1,purchasePrice:2000,date:'2020-01-01'}),tx({type:'SELL',quantity:1,purchasePrice:1000,date:'2020-06-01'}),
       tx({symbol:'Y',quantity:1,purchasePrice:1000,date:'2021-01-01'}),tx({symbol:'Y',type:'SELL',quantity:1,purchasePrice:2000,date:'2021-06-01'})], 2026);
eq('expired but used -> COMPENSATED', r.buckets.map(x=>x.status), ['COMPENSATED']);
// date-based: gain before loss same year
r = c([tx({symbol:'G',quantity:1,purchasePrice:100,date:'2024-01-01'}),tx({symbol:'G',type:'SELL',quantity:1,purchasePrice:600,date:'2025-02-01'}),
       tx({symbol:'L',quantity:1,purchasePrice:600,date:'2024-01-01'}),tx({symbol:'L',type:'SELL',quantity:1,purchasePrice:100,date:'2025-11-01'})], 2026);
eq('gain before loss not compensated', [r.buckets[0].remainingAmount, r.totalActiveLosses], [500,500]);
// ETF gain does not compensate
r = c([tx({symbol:'L',quantity:1,purchasePrice:600}),tx({symbol:'L',type:'SELL',quantity:1,purchasePrice:100,date:'2025-02-01'}),
       tx({symbol:'IE00B4L5Y983',isin:'IE00B4L5Y983',name:'iShares Core MSCI World',quantity:1,purchasePrice:100}),tx({symbol:'IE00B4L5Y983',isin:'IE00B4L5Y983',name:'iShares Core MSCI World',type:'SELL',quantity:1,purchasePrice:400,date:'2025-06-01'})], 2025);
eq('ETF gain no compensation', [r.totalActiveLosses, r.fundGainsCurrentYear, r.realizedGainsCurrentYear], [500,300,0]);
// expiring this year
r = c([tx({quantity:1,purchasePrice:600,date:'2022-01-01'}),tx({type:'SELL',quantity:1,purchasePrice:100,date:'2022-02-01'})], 2026);
eq('expiring 2026', [r.lossesExpiringThisYear, r.buckets[0].isExpiringThisYear], [500,true]);
r = c([tx({quantity:1,purchasePrice:600,date:'2019-01-01'}),tx({type:'SELL',quantity:1,purchasePrice:100,date:'2019-02-01'})], 2026);
eq('expired excluded from total', [r.totalActiveLosses, r.buckets[0].status], [0,'EXPIRED']);
// broker split
const br = b([tx({source:'scalable_mcp',quantity:1,purchasePrice:600}),tx({source:'scalable_mcp',type:'SELL',quantity:1,purchasePrice:100,date:'2025-02-01'}),
  tx({symbol:'M',quantity:1,purchasePrice:100}),tx({symbol:'M',type:'SELL',quantity:1,purchasePrice:600,date:'2025-03-01'})], {}, 2026);
eq('broker split: manual gain does not use scalable losses', br.map(x=>[x.brokerId,x.report.totalActiveLosses]), [['scalable',500],['manual',0]]);
// govt bond weights
r = c([tx({name:'BTP 2030',quantity:1,purchasePrice:1000}),tx({name:'BTP 2030',type:'SELL',quantity:1,purchasePrice:900,date:'2025-02-01'})], 2026, {X:{category:'Obbligazioni'}});
eq('BTP loss at 48.08%', r.totalActiveLosses, 48.08);
const numberCases: [string, number][] = [["1.234,56",1234.56],["150,5",150.5],["150.50",150.5],["1 234,56",1234.56],["1.234.567",1234567],["12abc",NaN],["1,2,3",NaN],["0,4567",0.4567],["",NaN]];
for (const [i, e] of numberCases) { const r = parseLocalNumber(i); eq(`parse ${JSON.stringify(i)}`, Number.isNaN(e) ? Number.isNaN(r) : r === e, true); }
eq('formatInputNumber keeps decimals', [formatInputNumber(0.4567), formatInputNumber(10), formatInputNumber(0.0049)], ['0,4567', '10', '0,0049']);

// Avvisi di prezzo
const alert = (o: Partial<ScalablePriceAlert>): ScalablePriceAlert => ({ id: 'a', symbol: 'X', name: 'X', targetPrice: 95, direction: 'BELOW', status: 'ACTIVE', ...o });
eq('alert BELOW distance', calculateAlertStatus(alert({}), 100).distanceDescription, `Serve un calo del ${formatNumber(5)}%`);
eq('alert ABOVE distance', calculateAlertStatus(alert({ direction: 'ABOVE', targetPrice: 105 }), 100).distanceDescription, `Serve un rialzo del ${formatNumber(5)}%`);
eq('alert disabled never triggered', calculateAlertStatus(alert({ status: 'DISABLED', direction: 'ABOVE', targetPrice: 100 }), 120).isTriggered, false);
eq('alert triggered below', calculateAlertStatus(alert({}), 90).isTriggered, true);
eq('alert price formatting', calculateAlertStatus(alert({ targetPrice: 115 }), 100).targetPriceFormatted, `€${formatNumber(115)}`);
// Piani di accumulo
eq('quarterly monthly equivalent', monthlyEquivalent({ amount: 300, frequency: 'quarterly' }), 100);
eq('active total skips paused', activeMonthlyTotal([
  { id: '1', symbol: 'A', name: 'A', amount: 100, frequency: 'monthly', dayOfMonth: 1, nextExecutionDate: '', status: 'ACTIVE' },
  { id: '2', symbol: 'B', name: 'B', amount: 300, frequency: 'quarterly', dayOfMonth: 1, nextExecutionDate: '', status: 'ACTIVE' },
  { id: '3', symbol: 'C', name: 'C', amount: 50, frequency: 'monthly', dayOfMonth: 1, nextExecutionDate: '', status: 'PAUSED' },
]), 200);
// Liquidità con tetto Prime+
eq('cash cap applied', Math.round(calculateCashYield(150000, 4, 0.26, 100000).annualGross), 4000);

// Posizione a costo medio ponderato
let pos = calculatePosition([tx({quantity:10,purchasePrice:100,date:'2025-01-01'}),tx({quantity:10,purchasePrice:200,date:'2025-02-01'}),tx({type:'SELL',quantity:10,purchasePrice:150,date:'2025-03-01'})]);
eq('position avg price after partial sell', [pos.totalQuantity, pos.averagePrice, pos.totalInvested], [10, 150, 1500]);
pos = calculatePosition([tx({quantity:5,purchasePrice:10}),tx({type:'SELL',quantity:5,purchasePrice:12,date:'2025-02-01'})]);
eq('position closed', [pos.totalQuantity, pos.totalInvested], [0, 0]);
pos = calculatePosition([tx({currency:'USD',fxRate:0.9,quantity:10,purchasePrice:100})]);
eq('position cost in EUR with fx', pos.totalInvestedEur, 900);
eq('position cost in EUR unknown without fx', calculatePosition([tx({currency:'USD',quantity:1,purchasePrice:100})]).totalInvestedEur, null);

// XIRR: +10% in esattamente un anno
const x = calculateXIRR([{ date: '2024-01-01', amount: -1000 }, { date: '2024-12-31', amount: 1100 }]);
eq('xirr 10% one year', x !== null ? Math.round(x * 1000) / 10 : null, 10);
const xt = calculateTransactionsXIRR([tx({quantity:10,purchasePrice:100,date:'2024-01-01'})], 1100, new Date('2024-12-31T00:00:00Z'));
eq('transactions xirr', xt.annualizedPercent !== null ? Math.round(xt.annualizedPercent) : null, 10);
eq('xirr no transactions', calculateTransactionsXIRR([], 0).annualizedPercent, null);

// Valutazione del portafoglio: cambio, prezzo mancante, effetto cambio
const q = (symbol: string, price: number, currency = 'EUR'): YahooQuote => ({ symbol, shortName: symbol, longName: symbol, regularMarketPrice: price, regularMarketChange: 0, regularMarketChangePercent: 0, currency, source: 'yahoo', hasDailyChange: false });
const agg = calculatePortfolioAggregation(
  [
    tx({symbol:'AAPL',name:'Apple',currency:'USD',fxRate:0.9,quantity:10,purchasePrice:100,groups:['G']}),
    tx({symbol:'ENI',name:'Eni',quantity:100,purchasePrice:10,groups:['G']}),
    tx({symbol:'NOP',name:'Senza prezzo',quantity:1,purchasePrice:50,groups:['G']}),
  ],
  { AAPL: q('AAPL', 120, 'USD'), ENI: q('ENI', 12) },
  {},
  { groups: ['G'], defaultGroup: 'G' } as never,
  { USD: 0.8 }
);
const apple = agg.globalAssets.find(a => a.symbol === 'AAPL')!;
eq('foreign value in EUR', apple.valueInBase, 960);
eq('foreign P/L in EUR and FX effect', [Math.round(apple.profitOrLossEur! * 100) / 100, Math.round(apple.fxEffectEur! * 100) / 100], [60, -120]);
eq('missing price flagged', agg.missingPriceSymbols, ['NOP']);
eq('global total in EUR', Math.round(agg.globalTotalValue * 100) / 100, 960 + 1200 + 50);

// Ricostruzione dello storico
const bfTx = [tx({symbol:'ENI',quantity:10,purchasePrice:10,date:'2025-01-02'}), tx({symbol:'AAPL',currency:'USD',fxRate:0.9,quantity:1,purchasePrice:100,date:'2025-01-02'})];
eq('backfill symbols include fx', backfillSymbols(bfTx).sort(), ['AAPL','ENI','USDEUR=X']);
const bf = buildBackfill(bfTx, {
  ENI: { currency: 'EUR', points: [{ date: '2025-01-06', close: 11 }, { date: '2025-01-13', close: 12 }] },
  AAPL: { currency: 'USD', points: [{ date: '2025-01-06', close: 110 }] },
  'USDEUR=X': { currency: 'EUR', points: [{ date: '2025-01-06', close: 0.8 }] },
}, '2025-01-20');
eq('backfill weekly dates (no point before the first close)', bf.map(p => p.date), ['2025-01-10', '2025-01-17']);
const lastBf = bf[bf.length - 1];
eq('backfill last point value', lastBf ? [lastBf.invested, lastBf.costBasis, lastBf.complete] : null, [10 * 12 + 110 * 0.8, 100 + 90, true]);

// Rendimento per periodo (TWR)
const ser = (pts: [string, number][], currency = 'EUR') => ({ currency, points: pts.map(([date, close]) => ({ date, close })) });
// Posseduto dall'inizio, nessun movimento: +10%
let pp = computePeriodPerformance([tx({symbol:'A',quantity:10,purchasePrice:90,date:'2024-01-01'})], { A: ser([['2025-01-01',100],['2025-02-01',110]]) }, { A: 110 }, '2025-01-01', '2025-02-01');
eq('period simple', pp && [Math.round(pp.gain*100)/100, Math.round(pp.percent!*100)/100], [100, 10]);
// Versamento a metà periodo a prezzo invariato: la % resta del 10%, il guadagno cresce col nuovo capitale
pp = computePeriodPerformance([tx({symbol:'A',quantity:10,purchasePrice:90,date:'2024-01-01'}), tx({symbol:'A',quantity:10,purchasePrice:100,date:'2025-01-15'})],
  { A: ser([['2025-01-01',100],['2025-01-15',100],['2025-02-01',110]]) }, { A: 110 }, '2025-01-01', '2025-02-01');
eq('period TWR ignores deposits', pp && [Math.round(pp.gain*100)/100, Math.round(pp.percent!*100)/100], [200, 10]);
// Calo del 50% poi versamento grosso e risalita del 10%: TWR -45%, guadagno positivo
pp = computePeriodPerformance([tx({symbol:'A',quantity:1,purchasePrice:100,date:'2024-01-01'}), tx({symbol:'A',quantity:20,purchasePrice:50,date:'2025-01-15'})],
  { A: ser([['2025-01-01',100],['2025-01-15',50],['2025-02-01',55]]) }, { A: 55 }, '2025-01-01', '2025-02-01');
eq('period TWR vs money gain', pp && [Math.round(pp.gain*100)/100, Math.round(pp.percent!*100)/100], [55*21 - 100 - 1000, -45]);
// Titolo senza prezzi storici: fuori dal calcolo e contato
pp = computePeriodPerformance([tx({symbol:'A',quantity:1,purchasePrice:100,date:'2024-01-01'}), tx({symbol:'B',quantity:1,purchasePrice:100,date:'2024-01-01'})],
  { A: ser([['2025-01-01',100]]) }, { A: 100, B: 100 }, '2025-01-01', '2025-02-01');
eq('period coverage', pp?.coverage, { withData: 1, total: 2 });
// Prezzo Scalable diverso dalla borsa Yahoo: si usa la variazione, non il livello
pp = computePeriodPerformance([tx({symbol:'IE00X',isin:'IE00X',source:'scalable_mcp',quantity:10,purchasePrice:90,date:'2024-01-01'})],
  { IE00X: ser([['2025-01-01',50],['2025-02-01',55]]) }, { IE00X: 110 }, '2025-01-01', '2025-02-01');
eq('period scales Yahoo venue to Scalable price', pp && Math.round(pp.percent!*100)/100, 10);
// Titolo in dollari: conta anche il cambio (prezzo +10%, dollaro -10% → -1%)
pp = computePeriodPerformance([tx({symbol:'AAPL',currency:'USD',quantity:10,purchasePrice:100,date:'2024-01-01'})],
  { AAPL: ser([['2025-01-01',100],['2025-02-01',110]], 'USD'), 'USDEUR=X': ser([['2025-01-01',1],['2025-02-01',0.9]]) }, { AAPL: 99 }, '2025-01-01', '2025-02-01');
eq('period foreign includes FX', pp && Math.round(pp.percent!*100)/100, -1);

// Giorni mancanti: solo feriali e non già registrati (2025-03-07 è venerdì)
eq('missing weekdays', missingWeekdays(new Set(['2025-03-04']), '2025-03-03', '2025-03-10'), ['2025-03-03', '2025-03-05', '2025-03-06', '2025-03-07', '2025-03-10']);
// Ricostruzione giornaliera: riportata al prezzo attuale (Yahoo 50→55, Scalable ora 110), giorno senza chiusura saltato
const dbf = buildDailyBackfill([tx({symbol:'IE00X',isin:'IE00X',source:'scalable_mcp',quantity:10,purchasePrice:90,date:'2025-01-01'})],
  { IE00X: ser([['2025-03-03',50],['2025-03-05',55]]) }, ['2025-03-03', '2025-03-04', '2025-03-05'], { IE00X: 110 });
eq('daily backfill scaled, holiday skipped', dbf.map(p => [p.date, p.invested, p.costBasis]), [['2025-03-03', 1000, 900], ['2025-03-05', 1100, 900]]);
// Un titolo senza prezzi non cancella il giorno: resta fuori da valore e costo, il punto è incompleto
const dbf2 = buildDailyBackfill([tx({symbol:'A',quantity:10,purchasePrice:90,date:'2025-01-01'}), tx({symbol:'NOPE',quantity:5,purchasePrice:100,date:'2025-01-01'})],
  { A: ser([['2025-03-03',100]]) }, ['2025-03-03']);
eq('daily backfill keeps incomplete day', dbf2.map(p => [p.invested, p.costBasis, p.complete]), [[1000, 900, false]]);
// Ancoraggio: Yahoo quota un'altra borsa (50 il giorno dell'acquisto, 60 oggi) che non segue il prezzo del broker
// (pagato 100, ora 115). Il giorno dell'acquisto il guadagno è zero e oggi coincide con quello reale.
const anc = buildDailyBackfill([tx({symbol:'IE00Y',isin:'IE00Y',source:'scalable_mcp',quantity:10,purchasePrice:100,date:'2026-01-15'})],
  { IE00Y: ser([['2026-01-15',50],['2026-10-12',60]]) }, ['2026-01-15', '2026-10-12'], { IE00Y: 115 });
eq('backfill anchored to purchase and current price', anc.map(p => [p.date, p.invested, p.costBasis]), [['2026-01-15', 1000, 1000], ['2026-10-12', 1150, 1000]]);
eq('YTD start', periodStart('YTD', new Date(2026, 9, 12)), '2025-12-31');
eq('1M start', periodStart('1M', new Date(2026, 9, 12)), '2026-09-12');
// Bollo / IVAFE: 0,2% sul valore al 31/12, in proporzione ai giorni
const r2 = (n: number) => Math.round(n * 100) / 100;
let wt = estimateWealthTax([tx({symbol:'A',quantity:100,purchasePrice:90,date:'2024-05-01'})], 2025, () => 100);
eq('wealth tax full year', [r2(wt.total), wt.lines[0].days], [20, 365]);
// Comprato il 2 luglio 2025: 183 giorni su 365
wt = estimateWealthTax([tx({symbol:'A',quantity:100,purchasePrice:90,date:'2025-07-02'})], 2025, () => 100);
eq('wealth tax pro rata', [wt.lines[0].days, r2(wt.total)], [183, r2(10000 * 0.002 * 183 / 365)]);
// Venduto tutto il 31 marzo 2025 a 120: paga sul controvalore per 90 giorni; nessun prezzo di fine anno richiesto
wt = estimateWealthTax([tx({symbol:'A',quantity:100,purchasePrice:90,date:'2024-05-01'}), tx({symbol:'A',type:'SELL',quantity:100,purchasePrice:120,date:'2025-03-31'})], 2025, () => null);
eq('wealth tax closed position', [wt.lines[0].days, r2(wt.total), wt.missing], [90, r2(12000 * 0.002 * 90 / 365), []]);
// Liquidità: €34,20 solo sopra €5.000; titolo senza prezzo escluso e segnalato
wt = estimateWealthTax([tx({symbol:'B',name:'Beta',quantity:1,purchasePrice:10,date:'2024-01-01'})], 2025, () => null, 6000);
eq('wealth tax cash and missing', [wt.total, wt.missing], [34.2, ['Beta']]);
eq('wealth tax cash under threshold', estimateWealthTax([], 2025, () => null, 4000).total, 0);
console.log(fails ? `${fails} FAIL` : 'ALL OK');
if (fails) process.exit(1);
