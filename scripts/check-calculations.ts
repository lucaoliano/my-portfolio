// Verifiche del calcolo fiscale e dei numeri: npm run test:calc
import { parseLocalNumber, formatInputNumber } from '../src/utils/formatters';
import { computeTaxReportFromTransactions as c, classifyTaxTreatment as k, computeTaxReportsByBroker as b } from '../src/utils/taxLossTracker';
import { Transaction } from '../src/types';
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
console.log(fails ? `${fails} FAIL` : 'ALL OK');
if (fails) process.exit(1);
