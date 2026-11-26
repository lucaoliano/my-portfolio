import { test, expect } from './fixtures';
import { loginViaEmulator } from './helpers/auth';

test.describe('Profile Screen E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaEmulator(page);
    await page.goto('/profile');
    await expect(page.getByRole('heading', { name: 'Profilo' })).toBeVisible({ timeout: 15000 });
  });

  test('Visualizzazione profilo, link di navigazione e pulsante logout', async ({ page }) => {
    // 1. Verifica email utente presente
    await expect(page.getByText(/@/)).toBeVisible();

    // 2. Verifica link rapidi a Simulatore PAC e Impostazioni
    const pacLink = page.getByRole('button', { name: /Simulatore PAC/ });
    const settingsLink = page.getByRole('button', { name: /Impostazioni/ });
    await expect(pacLink).toBeVisible();
    await expect(settingsLink).toBeVisible();

    // 3. Verifica pulsante di disconnessione
    const logoutBtn = page.getByRole('button', { name: "Esci dall'account" });
    await expect(logoutBtn).toBeVisible();
    await expect(logoutBtn).toBeEnabled();
  });
});
