import { test, expect } from './fixtures';
import { loginViaEmulator } from './helpers/auth';

test.describe('Search and Asset Details E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaEmulator(page);
  });

  test('Schermata Cerca (/search): input e placeholder', async ({ page }) => {
    await page.goto('/search');

    const searchInput = page.getByLabel('Cerca titoli');
    await expect(searchInput).toBeVisible({ timeout: 15000 });
    await expect(searchInput).toHaveAttribute('placeholder', 'Nome, ticker o ISIN');

    // Scrivi nel campo di ricerca
    await searchInput.fill('VWCE');
    await expect(searchInput).toHaveValue('VWCE');
  });

  test('Schermata Dettaglio Titolo (/asset/[id]): metriche e classe di attivo', async ({ page }) => {
    await page.goto('/asset/VWCE.DE?name=Vanguard%20FTSE%20All-World&currency=EUR&currentPrice=115.5');
    await expect(page.getByText('VWCE.DE').first()).toBeVisible({ timeout: 15000 });

    // 1. Verifica metriche principali
    await expect(page.getByText('Quantità').first()).toBeVisible();
    await expect(page.getByText('Prezzo Medio').first()).toBeVisible();
    await expect(page.getByText('Prezzo Attuale').first()).toBeVisible();

    // 2. Verifica sezione classe di attivo
    const categoryBtn = page.getByRole('button', { name: /Classe di attivo/ });
    await expect(categoryBtn).toBeVisible();
  });

  test('Dettaglio Titolo (/asset/[id]): formatta quote frazionarie senza rumore float', async ({ page }) => {
    const uid = await page.evaluate(() => (window as any).__FINANCE_UTILS__?.auth?.currentUser?.uid || '');
    expect(uid).toBeTruthy();

    const postTx = async (qty: number, price: number, date: string) => {
      await fetch(`http://127.0.0.1:8080/v1/projects/finance-95e5d/databases/(default)/documents/portfolios/${uid}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
        body: JSON.stringify({
          fields: {
            symbol: { stringValue: 'IE00B6R52259' },
            name: { stringValue: 'iShares MSCI ACWI (Acc)' },
            type: { stringValue: 'BUY' },
            quantity: { doubleValue: qty },
            purchasePrice: { doubleValue: price },
            date: { stringValue: date },
            currency: { stringValue: 'EUR' },
            portfolioId: { stringValue: 'default' },
            groups: { arrayValue: { values: [{ stringValue: 'Generale' }] } },
          },
        }),
      });
    };

    await postTx(4.844000000000001, 103.22, '2026-11-25');
    await postTx(4, 106.0, '2026-11-06');

    await page.goto('/asset/IE00B6R52259?name=iShares%20MSCI%20ACWI%20(Acc)&currency=EUR&currentPrice=104.69');
    await expect(page.getByTestId('metric-quantity')).toHaveText(/^8[.,]844$/, { timeout: 15000 });
    await expect(page.getByText(/4[.,]844 quote a €103[.,]22/)).toBeVisible();
    await expect(page.getByText(/4 quote a €106[.,]00/)).toBeVisible();
  });

  test('Schermata Modifica Transazione (/edit-transaction): gestione id inesistente', async ({ page }) => {
    await page.goto('/edit-transaction?id=non-existent-id');
    await expect(page.getByText('Transazione non trovata: potrebbe essere stata eliminata.')).toBeVisible({ timeout: 15000 });
  });
});
