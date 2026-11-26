import { Page, expect } from '@playwright/test';

/**
 * Autentica l'utente tramite il popup dell'emulatore Firebase Auth.
 * Se viene passata un'email la utilizza, altrimenti genera un'email casuale.
 */
export async function loginViaEmulator(page: Page, customEmail?: string) {
  await page.goto('/login');

  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Accedi con Google' }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState();

  const addAccountBtn = popup.locator('#add-account-button');
  if (await addAccountBtn.isVisible()) {
    await addAccountBtn.click();
  }

  const emailInput = popup.locator('#email-input');

  if (customEmail) {
    await emailInput.fill(customEmail);
  } else {
    const autogenBtn = popup.locator('#autogen-button');
    await expect(async () => {
      await autogenBtn.click();
      await expect(emailInput).not.toHaveValue('', { timeout: 500 });
    }).toPass({ timeout: 5000 });
  }

  const signInBtn = popup.locator('#sign-in');
  await expect(signInBtn).toBeEnabled({ timeout: 5000 });
  await signInBtn.click();

  await popup.waitForEvent('close');
  await expect(page).toHaveURL('/', { timeout: 20000 });

  const uid = await page.evaluate(async () => {
    const utils = (window as any).__FINANCE_UTILS__;
    const auth = utils?.auth;
    if (auth?.currentUser?.uid) return auth.currentUser.uid;
    return new Promise<string>((resolve) => {
      if (!auth) {
        setTimeout(() => resolve(''), 3000);
        return;
      }
      const unsub = auth.onAuthStateChanged((user: any) => {
        if (user?.uid) {
          unsub();
          resolve(user.uid);
        }
      });
    });
  });
  return uid;
}
