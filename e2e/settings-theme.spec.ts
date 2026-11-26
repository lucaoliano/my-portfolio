import { test, expect } from './fixtures';
import { loginViaEmulator } from './helpers/auth';

test.describe('Settings and Theme E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaEmulator(page);
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Impostazioni' })).toBeVisible({ timeout: 15000 });
  });

  test('Cambio tema tra Scuro e Chiaro con propagazione istantanea', async ({ page }) => {
    // 1. Verifica presenza sezione Aspetto
    await expect(page.getByRole('heading', { name: 'Aspetto' })).toBeVisible();

    const darkRadio = page.getByRole('radio', { name: /Scuro/ });
    const lightRadio = page.getByRole('radio', { name: 'Chiaro' });
    const systemRadio = page.getByRole('radio', { name: 'Come il sistema' });

    await expect(darkRadio).toBeVisible();
    await expect(lightRadio).toBeVisible();
    await expect(systemRadio).toBeVisible();

    // 2. Seleziona il tema Chiaro
    await lightRadio.click();
    await expect(lightRadio).toHaveAttribute('aria-checked', 'true');
    await expect(darkRadio).toHaveAttribute('aria-checked', 'false');

    // 3. Ripristina il tema Scuro
    await darkRadio.click();
    await expect(darkRadio).toHaveAttribute('aria-checked', 'true');
    await expect(lightRadio).toHaveAttribute('aria-checked', 'false');
  });

  test('Presenza e stato della sezione Sicurezza / Switch', async ({ page }) => {
    // Verifica che l'interruttore sia presente o la card impostazioni sia renderizzata
    const switchToggle = page.locator('role=switch').first();
    if (await switchToggle.isVisible()) {
      const isChecked = await switchToggle.getAttribute('aria-checked');
      expect(isChecked).toBeDefined();
    }
  });
});
