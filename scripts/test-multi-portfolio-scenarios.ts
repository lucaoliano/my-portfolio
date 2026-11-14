import { calculatePortfolioAggregation } from '../src/utils/portfolioAggregator';
import { Transaction, UserSettings, Portfolio } from '../src/types';
import { YahooQuote } from '../src/services/yahooFinance';

const PORTFOLIOS: Portfolio[] = [
  { id: 'default', name: 'Principale', isDefault: true },
  { id: 'pensione', name: 'Fondo Pensione', description: 'Orizzonte 20 anni' },
];

const SETTINGS: UserSettings = {
  portfolios: PORTFOLIOS,
  defaultPortfolioId: 'default',
  defaultGroup: 'ETF Core',
  groups: ['ETF Core', 'Growth Tech', 'Previdenza ETF', 'Obbligazionario'],
};

const QUOTES: Record<string, YahooQuote> = {
  'SWDA.MI': {
    symbol: 'SWDA.MI',
    shortName: 'iShares Core MSCI World',
    longName: 'iShares Core MSCI World UCITS ETF',
    regularMarketPrice: 100,
    regularMarketChange: 1,
    regularMarketChangePercent: 1.01,
    currency: 'EUR',
    hasDailyChange: true,
  },
  'AAPL': {
    symbol: 'AAPL',
    shortName: 'Apple',
    longName: 'Apple Inc.',
    regularMarketPrice: 200,
    regularMarketChange: 2,
    regularMarketChangePercent: 1.01,
    currency: 'USD',
    hasDailyChange: true,
  },
  'BTP-2037': {
    symbol: 'BTP-2037',
    shortName: 'BTP 2037',
    longName: 'BTP 2037 4%',
    regularMarketPrice: 95,
    regularMarketChange: 0.5,
    regularMarketChangePercent: 0.52,
    currency: 'EUR',
    hasDailyChange: true,
  },
};

const FX_RATES = { USD: 0.92 };

// Scenario:
// 1. Portafoglio Principale:
//    - "ETF Core": SWDA.MI (10 quote @ €80, costo 800)
//    - "Growth Tech": AAPL (5 quote @ $150, cambio 0.90 -> costo 675 EUR)
// 2. Portafoglio Fondo Pensione:
//    - "Previdenza ETF": SWDA.MI (20 quote @ €90, costo 1800) -> TICKER COMUNE
//    - "Obbligazionario": BTP-2037 (1000 quote @ €90, costo 90000) -> TICKER DISTINTO
const TRANSACTIONS: Transaction[] = [
  // Principale
  {
    id: 'tx1',
    symbol: 'SWDA.MI',
    name: 'iShares Core MSCI World',
    quantity: 10,
    purchasePrice: 80,
    type: 'BUY',
    date: '2023-01-15',
    currency: 'EUR',
    portfolioId: 'default',
    groups: ['ETF Core'],
  },
  {
    id: 'tx2',
    symbol: 'AAPL',
    name: 'Apple Inc.',
    quantity: 5,
    purchasePrice: 150,
    type: 'BUY',
    date: '2023-03-10',
    currency: 'USD',
    fxRate: 0.90,
    portfolioId: 'default',
    groups: ['Growth Tech'],
  },
  // Fondo Pensione
  {
    id: 'tx3',
    symbol: 'SWDA.MI',
    name: 'iShares Core MSCI World',
    quantity: 20,
    purchasePrice: 90,
    type: 'BUY',
    date: '2023-06-20',
    currency: 'EUR',
    portfolioId: 'pensione',
    groups: ['Previdenza ETF'],
  },
  {
    id: 'tx4',
    symbol: 'BTP-2037',
    name: 'BTP 2037 4%',
    quantity: 1000,
    purchasePrice: 90,
    type: 'BUY',
    date: '2023-09-01',
    currency: 'EUR',
    portfolioId: 'pensione',
    groups: ['Obbligazionario'],
  },
];

console.log('=== ANALISI SCENARI MULTI-PORTAFOGLIO ===\n');

// 1. Vista Portafoglio 1: Principale
console.log('--- 1. VISTA PORTAFOGLIO: "Principale" ---');
const txsPrincipale = TRANSACTIONS.filter(t => (t.portfolioId || 'default') === 'default');
const aggPrincipale = calculatePortfolioAggregation(txsPrincipale, QUOTES, {}, SETTINGS, FX_RATES);

console.log('Totale investito:', aggPrincipale.globalInvested);
console.log('Valore attuale:', aggPrincipale.globalTotalValue);
console.log('Gruppi restituiti dall\'aggregatore:');
aggPrincipale.groupedData.forEach(g => {
  console.log(`  Gruppo: "${g.groupName}" -> ${g.assets.length} titoli, valore €${g.currentTotalValue}`);
  g.assets.forEach(a => {
    console.log(`    - ${a.symbol} (${a.name}): ${a.totalQuantity} quote, PMC €${a.averagePrice}`);
  });
});

// 2. Vista Portafoglio 2: Fondo Pensione
console.log('\n--- 2. VISTA PORTAFOGLIO: "Fondo Pensione" ---');
const txsPensione = TRANSACTIONS.filter(t => (t.portfolioId || 'default') === 'pensione');
const aggPensione = calculatePortfolioAggregation(txsPensione, QUOTES, {}, SETTINGS, FX_RATES);

console.log('Totale investito:', aggPensione.globalInvested);
console.log('Valore attuale:', aggPensione.globalTotalValue);
console.log('Gruppi restituiti dall\'aggregatore:');
aggPensione.groupedData.forEach(g => {
  console.log(`  Gruppo: "${g.groupName}" -> ${g.assets.length} titoli, valore €${g.currentTotalValue}`);
  g.assets.forEach(a => {
    console.log(`    - ${a.symbol} (${a.name}): ${a.totalQuantity} quote, PMC €${a.averagePrice}`);
  });
});

// 3. Vista Aggregata: "Tutti i portafogli"
console.log('\n--- 3. VISTA AGGREGATA: "Tutti i portafogli" ---');
const aggAll = calculatePortfolioAggregation(TRANSACTIONS, QUOTES, {}, SETTINGS, FX_RATES);

console.log('Totale investito:', aggAll.globalInvested);
console.log('Valore attuale:', aggAll.globalTotalValue);
console.log('Gruppi restituiti dall\'aggregatore:');
aggAll.groupedData.forEach(g => {
  console.log(`  Gruppo: "${g.groupName}" -> ${g.assets.length} titoli, valore €${g.currentTotalValue}`);
  g.assets.forEach(a => {
    console.log(`    - ${a.symbol} (${a.name}): ${a.totalQuantity} quote, PMC €${a.averagePrice}`);
  });
});

console.log('\nTitoli Globali (globalAssets) in "Tutti i portafogli":');
aggAll.globalAssets.forEach(a => {
  console.log(`  - ${a.symbol}: ${a.totalQuantity} quote totali, PMC aggregato €${a.averagePrice}`);
});

// Scenario 4: Che succede se entrambi i portafogli usano lo stesso nome di gruppo "ETF"?
console.log('\n--- 4. SCENARIO CON NOME GRUPPO CONDIVISO "ETF" ---');
const sameGroupTxs: Transaction[] = [
  { ...TRANSACTIONS[0], groups: ['ETF'] }, // Principale: 10 @ 80
  { ...TRANSACTIONS[2], groups: ['ETF'] }, // Pensione: 20 @ 90
];
const aggSameGroup = calculatePortfolioAggregation(sameGroupTxs, QUOTES, {}, { groups: ['ETF'], defaultGroup: 'ETF' }, FX_RATES);
console.log('Gruppo "ETF" in "Tutti i portafogli":');
aggSameGroup.groupedData.forEach(g => {
  console.log(`  Gruppo: "${g.groupName}" -> ${g.assets.length} titoli`);
  g.assets.forEach(a => {
    console.log(`    - ${a.symbol}: ${a.totalQuantity} quote, PMC FUSO INSIEME: €${a.averagePrice}`);
  });
});
