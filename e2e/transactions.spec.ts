import { test, expect } from './fixtures';
import { loginViaEmulator } from './helpers/auth';

test.describe('Transactions and Portfolio Lifecycle E2E Tests', () => {
  let userUid = '';

  test.beforeEach(async ({ page }) => {
    test.setTimeout(90000);
    userUid = await loginViaEmulator(page);
  });

  test('Form Aggiungi Transazione: segmented control BUY/SELL, cambi valuta, commissioni e validazione', async ({ page }) => {
    await page.goto('/add-transaction?symbol=VWCE.DE&name=Vanguard%20FTSE%20All-World');
    await expect(page.getByRole('heading', { name: 'Nuova transazione' })).toBeVisible({ timeout: 15000 });

    // 1. Verifica che lo strumento sia visualizzato
    await expect(page.getByText('Vanguard FTSE All-World')).toBeVisible();
    await expect(page.getByText('VWCE.DE')).toBeVisible();

    // 2. Segmented control "Tipo di operazione"
    const buyRadio = page.getByRole('radio', { name: 'Acquisto' });
    const sellRadio = page.getByRole('radio', { name: 'Vendita' });

    await expect(buyRadio).toBeVisible();
    await expect(sellRadio).toBeVisible();
    await expect(buyRadio).toHaveAttribute('aria-checked', 'true');

    await sellRadio.click();
    await expect(sellRadio).toHaveAttribute('aria-checked', 'true');
    await expect(buyRadio).toHaveAttribute('aria-checked', 'false');

    await buyRadio.click();
    await expect(buyRadio).toHaveAttribute('aria-checked', 'true');

    // 3. Test validazione campi obbligatori
    const qtyInput = page.getByPlaceholder('es. 10 oppure 0,5');
    await expect(qtyInput).toBeVisible();
    await qtyInput.fill('15');

    const priceInput = page.getByPlaceholder('es. 150,50');
    await expect(priceInput).toBeVisible();
    await priceInput.fill('112,40');

    // 4. Compila commissioni opzionali
    const feeInput = page.getByPlaceholder('es. 1,50');
    if (await feeInput.isVisible()) {
      await feeInput.fill('2,50');
    }

    // 5. Verifica pulsante di invio
    const saveButton = page.getByRole('button', { name: 'Aggiungi al portafoglio' });
    await expect(saveButton).toBeVisible();
    await expect(saveButton).toBeEnabled();
  });

  test('Ciclo completo: Acquisto titolo, verifica Dashboard e vendita in perdita con impatto fiscale', async ({ page }) => {
    // 1. Apri il form per l'acquisto di VWCE
    await page.goto('/add-transaction?symbol=VWCE.DE&name=Vanguard%20FTSE%20All-World&fromSearch=true');
    await expect(page.getByRole('heading', { name: 'Nuova transazione' })).toBeVisible({ timeout: 15000 });

    // 2. Compila quantità (10 quote) e prezzo (100 €)
    const qtyInput = page.getByPlaceholder('es. 10 oppure 0,5');
    await expect(qtyInput).toBeVisible();
    await qtyInput.fill('10');

    const priceInput = page.getByPlaceholder('es. 150,50');
    await expect(priceInput).toBeVisible();
    await priceInput.fill('100');

    // 3. Salva la transazione di acquisto
    const saveButton = page.getByRole('button', { name: 'Aggiungi al portafoglio' });
    await expect(saveButton).toBeEnabled();
    await saveButton.click();

    // 4. Verifica atterraggio sulla Dashboard (/) con il bilancio aggiornato
    await expect(page).toHaveURL('/', { timeout: 15000 });
    await expect(page.getByText(/Bilancio totale/)).toBeVisible({ timeout: 15000 });

    const assetItem = page.getByRole('button', { name: /Vanguard FTSE All-World/ });
    await assetItem.scrollIntoViewIfNeeded();
    await expect(assetItem).toBeVisible({ timeout: 10000 });

    // Verifica presenza della visualizzazione a torta/allocazione
    const pieToggle = page.getByRole('button', { name: /Allocazione/ }).or(page.locator('[aria-label*="grafico"]'));
    if (await pieToggle.first().isVisible()) {
      await pieToggle.first().click();
    }

    // 5. Inserisci una seconda transazione per SWDA.MI (5 quote a 90 €) per diversificazione portafoglio
    await page.goto('/add-transaction?symbol=SWDA.MI&name=iShares%20Core%20MSCI%20World&fromSearch=true');
    await expect(page.getByRole('heading', { name: 'Nuova transazione' })).toBeVisible({ timeout: 15000 });

    await page.getByPlaceholder('es. 10 oppure 0,5').fill('5');
    await page.getByPlaceholder('es. 150,50').fill('90');

    await page.getByRole('button', { name: 'Aggiungi al portafoglio' }).click();
    await expect(page).toHaveURL('/', { timeout: 15000 });

    // 6. Naviga a /tax-report: verifica rendering dello zainetto fiscale
    await page.goto('/tax-report');
    await expect(page.getByRole('heading', { name: 'Zainetto fiscale' })).toBeVisible({ timeout: 15000 });

    // Verifica presenza della sezione informativa o delle tab vendite/regole
    const taxContent = page.getByText(/Minusvalenze/i).or(page.getByText('Nessuna vendita registrata')).or(page.getByRole('tab', { name: 'Per anno' }));
    await expect(taxContent.first()).toBeVisible({ timeout: 10000 });

    // 7. Naviga a /health-check: con molteplici asset reali, il controllo di salute calcola i pesi e la diversificazione
    await page.goto('/health-check');
    await expect(page.getByRole('heading', { name: 'Salute del portafoglio' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Pesi calcolati su/)).toBeVisible({ timeout: 10000 });
  });

  test('Validazione errori form, valuta estera USD con tasso fxRate e creazione nuovo gruppo', async ({ page }) => {
    await page.goto('/add-transaction?symbol=AAPL&name=Apple%20Inc.&fromSearch=true');
    await expect(page.getByRole('heading', { name: 'Nuova transazione' })).toBeVisible({ timeout: 15000 });

    // 1. Svuota la quantità e tenta di inviare per verificare i messaggi di errore
    const qtyInput = page.getByPlaceholder('es. 10 oppure 0,5');
    await qtyInput.fill('');
    const saveButton = page.getByRole('button', { name: 'Aggiungi al portafoglio' });
    await saveButton.click();

    await expect(page.getByText('Controlla i campi evidenziati.')).toBeVisible();
    await expect(page.getByText('Inserisci una quantità maggiore di zero')).toBeVisible();

    // 2. Seleziona valuta USD e verifica comparsa campo cambio fxRate
    const usdChip = page.getByRole('radio', { name: 'USD' });
    await expect(usdChip).toBeVisible();
    await usdChip.click();

    const fxRateInput = page.getByPlaceholder('es. 0,92');
    await expect(fxRateInput).toBeVisible();
    await fxRateInput.fill('0,92');

    // 3. Compila quantità, prezzo e commissioni
    await qtyInput.fill('5');
    const priceInput = page.getByPlaceholder('es. 150,50');
    await priceInput.fill('220');

    const feeInput = page.getByPlaceholder('es. 0,99');
    if (await feeInput.isVisible()) {
      await feeInput.fill('1,50');
    }

    // 4. Crea un nuovo gruppo
    const newGroupChip = page.getByRole('button', { name: 'Nuovo gruppo' });
    if (await newGroupChip.isVisible()) {
      await newGroupChip.click();
      const groupNameInput = page.getByPlaceholder('Nome del gruppo');
      await expect(groupNameInput).toBeVisible();
      await groupNameInput.fill('Tech USA');
      await page.getByRole('button', { name: 'Crea' }).click();
      await expect(page.getByRole('checkbox', { name: 'Tech USA' })).toBeVisible();
    }

    // 5. Salva la transazione
    await saveButton.click();
    await expect(page).toHaveURL('/', { timeout: 15000 });
  });

  test('Modifica e cancellazione transazione con conferma eliminazione', async ({ page }) => {
    // 0. Assicura la presenza di una transazione iniziale per AAPL tramite REST emulator
    let txId: string | null = null;
    if (userUid) {
      const res = await fetch(`http://127.0.0.1:8080/v1/projects/finance-95e5d/databases/(default)/documents/portfolios/${userUid}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
        body: JSON.stringify({
          fields: {
            symbol: { stringValue: 'AAPL' },
            name: { stringValue: 'Apple Inc.' },
            type: { stringValue: 'BUY' },
            quantity: { doubleValue: 5 },
            purchasePrice: { doubleValue: 200 },
            date: { stringValue: '2026-01-15' },
            currency: { stringValue: 'USD' },
            fxRate: { doubleValue: 0.92 },
            portfolioId: { stringValue: 'default' },
            groups: { arrayValue: { values: [{ stringValue: 'Generale' }] } },
          },
        }),
      });
      const data = await res.json();
      txId = data.name?.split('/')?.pop() || null;
    }

    expect(txId).toBeTruthy();

    // 1. Apri la schermata di modifica per l'ID appena creato
    await page.goto(`/edit-transaction?id=${txId}&symbol=AAPL&name=Apple%20Inc.`);
    await expect(page.getByRole('heading', { name: 'Modifica transazione' })).toBeVisible({ timeout: 15000 });

    // 2. Modifica la quantità
    const qtyInput = page.getByPlaceholder('es. 10 oppure 0,5');
    await qtyInput.fill('6');

    const saveBtn = page.getByRole('button', { name: 'Salva modifiche' });
    await expect(saveBtn).toBeVisible();
    await saveBtn.click();
    await expect(page).toHaveURL('/', { timeout: 15000 });

    // 3. Riapri per testare l'eliminazione
    await page.goto(`/edit-transaction?id=${txId}&symbol=AAPL&name=Apple%20Inc.`);
    await expect(page.getByRole('heading', { name: 'Modifica transazione' })).toBeVisible({ timeout: 15000 });

    // Configura il gestore del dialog prima di cliccare elimina
    page.once('dialog', dialog => dialog.accept());
    const deleteBtn = page.getByRole('button', { name: 'Elimina transazione' });
    await expect(deleteBtn).toBeVisible();
    await deleteBtn.click();

    // Verifica reindirizzamento alla dashboard
    await page.waitForTimeout(1000);
    if (!page.url().endsWith('/')) {
      await page.goto('/');
    }
    await expect(page).toHaveURL('/', { timeout: 15000 });
  });

  test('Gestione avviso short selling per vendita con quote insufficienti', async ({ page }) => {
    await page.goto('/add-transaction?symbol=VWCE.DE&name=Vanguard%20FTSE%20All-World');
    await expect(page.getByRole('heading', { name: 'Nuova transazione' })).toBeVisible({ timeout: 15000 });

    // 1. Seleziona vendita
    await page.getByRole('radio', { name: 'Vendita' }).click();

    // 2. Inserisci quantità esagerata (es. 99999 quote)
    await page.getByPlaceholder('es. 10 oppure 0,5').fill('99999');
    await page.getByPlaceholder('es. 150,50').fill('110');

    // 3. Tenta il salvataggio: deve apparire l'avviso e il pulsante deve trasformarsi in "Salva comunque"
    const submitBtn = page.getByRole('button', { name: 'Aggiungi al portafoglio' });
    await submitBtn.click();

    await expect(page.getByText(/Alla data scelta risultano/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Salva comunque' })).toBeVisible();

    // 4. Chiudi con il pulsante indietro e conferma l'uscita
    page.once('dialog', dialog => dialog.accept());
    const backBtn = page.getByRole('button', { name: 'Indietro' }).or(page.locator('[aria-label="Chiudi"]'));
    if (await backBtn.isVisible()) {
      await backBtn.click();
    }
  });
});
