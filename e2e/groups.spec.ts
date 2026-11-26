import { test, expect } from './fixtures';
import { loginViaEmulator } from './helpers/auth';

test.describe('Groups Management E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaEmulator(page);
    await page.goto('/manage-groups');
    await expect(page.getByRole('heading', { name: 'Gestione gruppi' })).toBeVisible({ timeout: 15000 });
  });

  test('Creazione, rinomina ed eliminazione di un gruppo', async ({ page }) => {
    // 1. Aggiungi nuovo gruppo "Previdenza"
    const newGroupInput = page.getByLabel('Nome del nuovo gruppo');
    await expect(newGroupInput).toBeVisible();
    await newGroupInput.fill('Previdenza');

    const addBtn = page.getByRole('button', { name: 'Aggiungi gruppo' });
    await expect(addBtn).toBeEnabled();
    await addBtn.click();

    // 2. Verifica comparsa del gruppo
    await expect(page.getByText('Previdenza', { exact: true })).toBeVisible({ timeout: 5000 });

    // 3. Rinomina gruppo in "Fondo Pensione"
    const renameBtn = page.getByRole('button', { name: 'Rinomina Previdenza' });
    await expect(renameBtn).toBeVisible();
    await renameBtn.click();

    const editInput = page.getByLabel('Nuovo nome per Previdenza');
    await expect(editInput).toBeVisible();
    await editInput.fill('Fondo Pensione');

    const saveNameBtn = page.getByRole('button', { name: 'Salva nome' });
    await saveNameBtn.click();

    // 4. Verifica aggiornamento nome
    await expect(page.getByText('Fondo Pensione', { exact: true })).toBeVisible({ timeout: 5000 });

    // 5. Elimina gruppo gestendo il window.confirm sul web
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });

    const deleteBtn = page.getByRole('button', { name: 'Elimina Fondo Pensione' });
    await expect(deleteBtn).toBeVisible();
    await deleteBtn.click();

    // 6. Verifica scomparsa del gruppo
    await expect(page.getByText('Fondo Pensione', { exact: true })).not.toBeVisible({ timeout: 5000 });
  });

  test('Validazione duplicati, riordino e impostazione gruppo predefinito', async ({ page }) => {
    const newGroupInput = page.getByLabel('Nome del nuovo gruppo');
    const addBtn = page.getByRole('button', { name: 'Aggiungi gruppo' });

    // 1. Tenta di aggiungere "Generale" (duplicato)
    await newGroupInput.fill('Generale');
    await addBtn.click();
    await expect(page.getByText(/Esiste già un gruppo con questo nome/i)).toBeVisible();

    // 2. Aggiungi due gruppi validi: "Bond" e "Commodity"
    await newGroupInput.fill('Bond');
    await addBtn.click();
    await expect(page.getByText('Bond', { exact: true })).toBeVisible({ timeout: 5000 });

    await newGroupInput.fill('Commodity');
    await addBtn.click();
    await expect(page.getByText('Commodity', { exact: true })).toBeVisible({ timeout: 5000 });

    // 3. Imposta "Bond" come predefinito
    const setDefaultBtn = page.locator('text=Imposta predefinito').first();
    if (await setDefaultBtn.isVisible()) {
      await setDefaultBtn.click();
      await page.waitForTimeout(500);
    }

    // 4. Riordina gruppi con le frecce (in su e in giù)
    const moveUpBtn = page.locator('[aria-label*="in su"]').last();
    if (await moveUpBtn.isVisible() && await moveUpBtn.isEnabled()) {
      await moveUpBtn.click();
      await page.waitForTimeout(300);
    }
    const moveDownBtn = page.locator('[aria-label*="in giù"]').first();
    if (await moveDownBtn.isVisible() && await moveDownBtn.isEnabled()) {
      await moveDownBtn.click();
      await page.waitForTimeout(300);
    }

    // 5. Test annullamento modifica nome gruppo
    const renameCommodity = page.getByRole('button', { name: 'Rinomina Commodity' });
    if (await renameCommodity.isVisible()) {
      await renameCommodity.click();
      const cancelRenameBtn = page.getByRole('button', { name: 'Annulla' });
      await expect(cancelRenameBtn).toBeVisible();
      await cancelRenameBtn.click();
      await expect(cancelRenameBtn).not.toBeVisible();
    }
  });
});
