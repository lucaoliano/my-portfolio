import { test, expect } from './fixtures';
import { loginViaEmulator } from './helpers/auth';

test.describe('Fiscal Reports E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaEmulator(page);
  });

  test('Schermata Fiscalità (/tax-report): visualizzazione stato, vendite, zainetto e regole', async ({ page }) => {
    // 1. Inserisce una vendita in perdita per popolare lo zainetto fiscale
    await page.evaluate(async () => {
      const utils = (window as any).__FINANCE_UTILS__;
      const { auth, db, firestore } = utils || {};
      if (auth?.currentUser && firestore) {
        const currentYear = new Date().getFullYear();
        // Acquisto
        await firestore.addDoc(firestore.collection(db, 'portfolios', auth.currentUser.uid, 'transactions'), {
          symbol: 'ENEL.MI',
          name: 'Enel SpA',
          type: 'BUY',
          quantity: 10,
          purchasePrice: 10,
          date: `${currentYear}-01-10`,
          currency: 'EUR',
          portfolioId: 'default',
          groups: ['Generale'],
        });
        // Vendita con minusvalenza
        await firestore.addDoc(firestore.collection(db, 'portfolios', auth.currentUser.uid, 'transactions'), {
          symbol: 'ENEL.MI',
          name: 'Enel SpA',
          type: 'SELL',
          quantity: 5,
          purchasePrice: 7,
          date: `${currentYear}-02-15`,
          currency: 'EUR',
          portfolioId: 'default',
          groups: ['Generale'],
        });
      }
    });

    // 2. Naviga a /tax-report
    await page.goto('/tax-report');
    await expect(page.getByRole('heading', { name: 'Zainetto fiscale' })).toBeVisible({ timeout: 15000 });

    // 3. Verifica presenza delle sezioni principali
    await expect(page.getByText('Minusvalenze disponibili').first()).toBeVisible({ timeout: 10000 });

    // 4. Naviga attraverso le tab: 'Per anno', 'Vendite', 'Regole'
    const perYearTab = page.getByRole('tab', { name: 'Per anno' });
    const salesTab = page.getByRole('tab', { name: 'Vendite' });
    const rulesTab = page.getByRole('tab', { name: 'Regole' });

    if (await perYearTab.isVisible()) {
      await perYearTab.click();
      await page.waitForTimeout(300);
    }

    if (await salesTab.isVisible()) {
      await salesTab.click();
      await expect(salesTab).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByText(/Enel SpA|ENEL.MI/i).first()).toBeVisible();
    }

    if (await rulesTab.isVisible()) {
      await rulesTab.click();
      await expect(rulesTab).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByText('Compensano le minusvalenze')).toBeVisible();
    }
  });

  test('Schermata Imposta di bollo e IVAFE (/wealth-tax): selezione anno e regime fiscale', async ({ page }) => {
    await page.goto('/wealth-tax');
    await expect(page.getByRole('heading', { name: 'Bollo e IVAFE' })).toBeVisible({ timeout: 15000 });

    const currentYear = new Date().getFullYear();
    const prevYear = currentYear - 1;

    // 1. Verifica tab anno in corso
    const currentYearTab = page.getByRole('tab', { name: new RegExp(String(currentYear)) });
    await expect(currentYearTab).toBeVisible();
    await expect(currentYearTab).toHaveAttribute('aria-selected', 'true');

    // 2. Seleziona anno precedente
    const prevYearTab = page.getByRole('tab', { name: String(prevYear) });
    if (await prevYearTab.isVisible()) {
      await prevYearTab.click();
      await expect(prevYearTab).toHaveAttribute('aria-selected', 'true');
      await expect(currentYearTab).toHaveAttribute('aria-selected', 'false');

      // Torna all'anno in corso
      await currentYearTab.click();
      await expect(currentYearTab).toHaveAttribute('aria-selected', 'true');
    }

    // 3. Verifica presenza della stima delle imposte o messaggio informativo
    const contentCheck = page.locator('text=Imposte stimate').or(page.locator('text=Nessun titolo')).or(page.locator('text=Imposta di bollo'));
    await expect(contentCheck.first()).toBeVisible();

    // 4. Se presente il selettore di regime (es. Broker estero / Broker italiano), testiamo il cambio
    const foreignBrokerTab = page.getByRole('tab', { name: 'Broker estero' });
    if (await foreignBrokerTab.isVisible()) {
      await foreignBrokerTab.click();
      await expect(foreignBrokerTab).toHaveAttribute('aria-selected', 'true');
    }
  });
});
