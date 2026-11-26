import { test, expect } from './fixtures';
import { loginViaEmulator } from './helpers/auth';

test.describe('Health Check E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaEmulator(page);
    await page.goto('/health-check');
    await expect(page.getByRole('heading', { name: 'Salute del portafoglio' })).toBeVisible({ timeout: 15000 });
  });

  test('Visualizzazione analisi salute o stato vuoto iniziale', async ({ page }) => {
    // In assenza di asset viene mostrato il testo esplicativo, altrimenti la card di analisi
    const emptyState = page.getByText("Aggiungi almeno un titolo per vedere l'analisi.");
    const healthCard = page.getByText(/Pesi calcolati su/);

    await expect(emptyState.or(healthCard).first()).toBeVisible({ timeout: 5000 });
  });
});
