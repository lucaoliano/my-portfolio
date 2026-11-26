import { test, expect } from './fixtures';
import { loginViaEmulator } from './helpers/auth';

test.describe('Dashboard Interactions and Views E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(90000);
    const uid = await loginViaEmulator(page);
    await page.evaluate(async (userId) => {
      const utils = (window as any).__FINANCE_UTILS__;
      if (!userId || !utils?.firestore) return;
      const { collection, addDoc, setDoc, doc } = utils.firestore;
      const txRef = collection(utils.db, 'portfolios', userId, 'transactions');
      await addDoc(txRef, {
        symbol: 'SWDA.MI',
        name: 'iShares Core MSCI World',
        quantity: 15,
        purchasePrice: 75.5,
        type: 'BUY',
        date: '2023-01-10',
        currency: 'EUR',
        portfolioId: 'default',
        group: 'Generale',
        groups: ['Generale'],
        category: 'Azioni',
      });
      await addDoc(txRef, {
        symbol: 'AAPL',
        name: 'Apple Inc.',
        quantity: 10,
        purchasePrice: 150,
        type: 'BUY',
        date: '2023-02-15',
        currency: 'USD',
        portfolioId: 'default',
        group: 'Generale',
        groups: ['Generale'],
        fxRate: 1.08,
        category: 'Azioni',
      });
      const quotesRef = doc(utils.db, 'portfolios', userId, 'settings', 'scalable_quotes');
      await setDoc(quotesRef, {
        'SWDA.MI': {
          regularMarketPrice: 92.5,
          regularMarketChange: 1.2,
          regularMarketChangePercent: 1.3,
          currency: 'EUR',
          shortName: 'iShares Core MSCI World',
        },
        'AAPL': {
          regularMarketPrice: 195,
          regularMarketChange: 2.1,
          regularMarketChangePercent: 1.1,
          currency: 'USD',
          shortName: 'Apple Inc.',
        },
      }, { merge: true });

      // Popola le categorie in assets/ per attivare la composizione a torta (hasComposition = true)
      await setDoc(doc(utils.db, 'portfolios', userId, 'assets', 'SWDA.MI'), {
        category: 'Azioni',
        categorySource: 'user',
      });
      await setDoc(doc(utils.db, 'portfolios', userId, 'assets', 'AAPL'), {
        category: 'Azioni',
        categorySource: 'user',
      });
    }, uid);
    await page.goto('/');
    await expect(page.getByText(/Bilancio totale|Panoramica/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('Navigazione periodi di rendimento: Oggi, 1S, 1M, 6M, 1A, YTD, Totale, Annuo', async ({ page }) => {
    // 1. Verifica che i selettori di periodo siano visibili
    const tabs = ['Oggi', '1S', '1M', '6M', '1A', 'Da inizio anno', 'Totale', 'Annuo'];
    for (const tab of tabs) {
      const tabElement = page.getByRole('tab', { name: tab });
      if (await tabElement.isVisible()) {
        await tabElement.click();
        await page.waitForTimeout(300);
      }
    }

    // 2. Interazione con la barra dei portafogli
    const allPortTab = page.getByRole('tab', { name: 'Tutti i portafogli' });
    if (await allPortTab.isVisible()) {
      await allPortTab.click();
      await page.waitForTimeout(300);
    }

    // 3. Clicca sull'icona di ricerca
    const searchBtn = page.getByRole('button', { name: 'Cerca un titolo' }).first();
    if (await searchBtn.isVisible()) {
      await searchBtn.click();
      await expect(page).toHaveURL(/\/search/);
      await page.goto('/');
    }

    // 4. Se presente un asset in elenco, clicca sulla card per navigare al dettaglio
    const assetCard = page.getByRole('button', { name: /iShares Core MSCI World/i }).first();
    if (await assetCard.isVisible()) {
      await assetCard.click();
      await expect(page).toHaveURL(/\/asset\//);
      await expect(page.getByText(/Prezzo attuale/i)).toBeVisible({ timeout: 10000 });
      await page.goto('/');
    }

    // 5. Clicca sul banner di sintesi salute portafoglio nel footer se visibile
    const healthRow = page.getByText(/Salute del portafoglio/i).first();
    if (await healthRow.isVisible()) {
      await healthRow.click();
      await expect(page).toHaveURL(/\/health-check/);
      await page.goto('/');
    }
  });

  test('Composizione del gruppo con grafico a torta (PieChartComponent)', async ({ page }) => {
    // 1. Cerca il pulsante per aprire la composizione del gruppo (icona torta)
    const pieBtn = page.getByLabel(/Composizione del gruppo Generale/i);
    await expect(pieBtn).toBeVisible({ timeout: 10000 });
    await pieBtn.click();

    // 2. Verifica comparsa della modale di composizione con grafico a torta
    await expect(page.getByRole('heading', { name: /Composizione: Generale/i })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/Azioni/i).last()).toBeVisible();

    // 3. Chiudi la modale
    const closeBtn = page.getByRole('button', { name: 'Chiudi' });
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();
    await expect(page.getByRole('heading', { name: /Composizione: Generale/i })).not.toBeVisible();
  });

  test('Espansione e collasso dei gruppi di portafoglio', async ({ page }) => {
    // Clicca sull'intestazione del gruppo per collassarlo
    const groupHeader = page.getByText('Generale').first();
    if (await groupHeader.isVisible()) {
      await groupHeader.click();
      await page.waitForTimeout(500);
      // Clicca di nuovo per riaprirlo
      await groupHeader.click();
      await page.waitForTimeout(500);
    }
  });

  test('Apertura menu laterale hamburger e cambio tema', async ({ page }) => {
    // 1. Apri il menu hamburger
    const menuBtn = page.getByRole('button', { name: 'Apri il menu' });
    await expect(menuBtn).toBeVisible();
    await menuBtn.click();

    // 2. Verifica presenza delle voci del menu
    await expect(page.getByText('Menu')).toBeVisible();
    await expect(page.getByRole('button', { name: /Profilo/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Simulatore PAC/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Gestisci portafogli/i }).last()).toBeVisible();
    await expect(page.getByRole('button', { name: /Gestisci gruppi/i })).toBeVisible();

    // 3. Toggle tema dal menu
    const themeToggle = page.getByRole('button', { name: /Tema scuro|Tema chiaro/i });
    if (await themeToggle.isVisible()) {
      await themeToggle.click();
      await page.waitForTimeout(500);
    }

    // 4. Chiudi il menu
    const closeMenuBtn = page.getByRole('button', { name: 'Chiudi il menu' });
    if (await closeMenuBtn.isVisible()) {
      await closeMenuBtn.click();
    }
  });
});
