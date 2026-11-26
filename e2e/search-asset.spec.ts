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

  test('Schermata Modifica Transazione (/edit-transaction): gestione id inesistente', async ({ page }) => {
    await page.goto('/edit-transaction?id=non-existent-id');
    await expect(page.getByText('Transazione non trovata: potrebbe essere stata eliminata.')).toBeVisible({ timeout: 15000 });
  });
});
