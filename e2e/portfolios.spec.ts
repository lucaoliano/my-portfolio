import { test, expect } from './fixtures';
import { loginViaEmulator } from './helpers/auth';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, doc, setDoc } from 'firebase/firestore';
import { initializeAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';

const getTestApp = () => {
  const name = 'test-node-app-' + Date.now();
  const app = initializeApp({
    projectId: 'finance-95e5d',
    apiKey: 'fake-test-key',
  }, name);
  const auth = initializeAuth(app);
  try {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  } catch {}
  const db = getFirestore(app);
  try {
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  } catch {}
  return { app, auth, db };
};

test.describe('Portafogli E2E Browser Test', () => {
  test('Aggiunta di un nuovo portafoglio senza descrizione nella UI del browser', async ({ page }) => {
    // 1. Apri la pagina di login
    await page.goto('/login');

    // 2. Clicca sul pulsante standard "Accedi con Google" aprendo il popup dell'emulatore Firebase Auth
    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Accedi con Google' }).click();
    const popup = await popupPromise;
    await popup.waitForLoadState();

    // Nell'emulatore Firebase Auth usiamo la UI nativa dell'emulatore (senza toccare il codice di login dell'app)
    const addAccountBtn = popup.locator('#add-account-button');
    if (await addAccountBtn.isVisible()) {
      await addAccountBtn.click();
    }

    const autogenBtn = popup.locator('#autogen-button');
    const emailInput = popup.locator('#email-input');

    // Clicca finché l'email non viene popolata (gestisce l'aggancio asincrono del listener nell'emulatore)
    await expect(async () => {
      await autogenBtn.click();
      await expect(emailInput).not.toHaveValue('', { timeout: 500 });
    }).toPass({ timeout: 5000 });

    const signInBtn = popup.locator('#sign-in');
    await expect(signInBtn).toBeEnabled({ timeout: 5000 });
    await signInBtn.click();

    // Attendi la chiusura del popup e l'accesso alla dashboard autenticata
    await popup.waitForEvent('close');
    await expect(page).toHaveURL('/', { timeout: 20000 });
    await expect(page.getByRole('tab', { name: 'Tutti i portafogli' })).toBeVisible({ timeout: 20000 });

    // 4. Clicca su "Gestisci" nella barra dei portafogli per aprire la schermata
    const manageBtn = page.getByRole('button', { name: 'Gestisci portafogli' });
    await expect(manageBtn).toBeVisible();
    await manageBtn.click();

    // 5. Verifica di essere sulla schermata "Gestisci portafogli"
    await expect(page.getByRole('heading', { name: 'Gestisci portafogli' })).toBeVisible();

    // 6. SCENARIO CHIAVE: Inserisci il nome del portafoglio lasciando la descrizione VUOTA
    const nameInput = page.getByLabel('Nome del nuovo portafoglio');
    await expect(nameInput).toBeVisible();
    await nameInput.fill('Fondo Pensione');

    // Lascia la descrizione vuota
    const descInput = page.getByLabel('Descrizione del nuovo portafoglio');
    await expect(descInput).toBeVisible();
    await descInput.fill('');

    // Clicca su "Aggiungi portafoglio"
    const addBtn = page.getByRole('button', { name: 'Aggiungi portafoglio' });
    await expect(addBtn).toBeEnabled();
    await addBtn.click();

    // 7. VERIFICA: Il messaggio di errore "Portafoglio non aggiunto. Riprova." NON compare
    const errorNotice = page.getByText('Portafoglio non aggiunto. Riprova.');
    await expect(errorNotice).not.toBeVisible();

    // 8. VERIFICA: Il nuovo portafoglio appare nell'elenco (verificato sulla card del portafoglio)
    await expect(page.getByTestId('portfolio-name-Fondo Pensione')).toBeVisible();

    // 9. Aggiungi un secondo portafoglio CON descrizione
    await nameInput.fill('Trading');
    await descInput.fill('Operazioni ad alto rischio');
    await addBtn.click();

    await expect(errorNotice).not.toBeVisible();
    await expect(page.getByTestId('portfolio-name-Trading')).toBeVisible();
    await expect(page.getByText('Operazioni ad alto rischio')).toBeVisible();

    // Cattura screenshot della schermata di gestione
    await page.screenshot({ path: 'test-results/screenshots/manage-portfolios.png', fullPage: true });

    // 10. Torna alla dashboard e verifica che le pillole siano presenti nella barra
    const backBtn = page.getByRole('button', { name: 'Torna indietro' });
    await backBtn.click();

    // Cattura screenshot della dashboard con i portafogli
    await page.screenshot({ path: 'test-results/screenshots/dashboard.png', fullPage: true });

    const pensionTab = page.getByRole('tab', { name: 'Portafoglio Fondo Pensione' });
    await expect(pensionTab).toBeVisible();

    const tradingTab = page.getByRole('tab', { name: 'Portafoglio Trading' });
    await expect(tradingTab).toBeVisible();

    // Clicca sulla pillola "Fondo Pensione"
    await pensionTab.click();

    // Verifica il cambio vista sulla dashboard: l'intestazione mostra "Fondo Pensione" e la pillola risulta selezionata
    await expect(page.getByRole('heading', { name: 'Fondo Pensione' })).toBeVisible();
    await expect(pensionTab).toHaveAttribute('aria-selected', 'true');

    // Screenshot della dashboard con tab selezionato
    await page.screenshot({ path: 'test-results/screenshots/dashboard.png' });

    // Screenshot in formato mobile (iPhone 390x844)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'test-results/screenshots/dashboard-mobile.png' });

    await page.goto('/manage-portfolios');
    await page.screenshot({ path: 'test-results/screenshots/manage-portfolios-mobile.png', fullPage: true });
  });

  test('Scenario con due portafogli, gruppi diversi e ticker comuni/distinti', async ({ page }) => {
    const testEmail = `user_multi_${Date.now()}@example.com`;
    const { auth, db } = getTestApp();
    const cred = await createUserWithEmailAndPassword(auth, testEmail, 'testPassword123');
    const uid = cred.user.uid;

    // Popola Firestore con lo scenario dei due portafogli prima dell'accesso
    await setDoc(doc(db, 'portfolios', uid, 'settings', 'preferences'), {
      portfolios: [
        { id: 'default', name: 'Principale', isDefault: true, groups: ['ETF Core', 'Growth Tech'], defaultGroup: 'ETF Core' },
        { id: 'pensione', name: 'Fondo Pensione', description: 'Orizzonte 20 anni', groups: ['Previdenza ETF', 'Obbligazionario'], defaultGroup: 'Previdenza ETF' },
      ],
      defaultPortfolioId: 'default',
      groups: ['ETF Core', 'Growth Tech', 'Previdenza ETF', 'Obbligazionario'],
    });

    await setDoc(doc(db, 'portfolios', uid, 'settings', 'scalable_quotes'), {
      'SWDA.MI': {
        regularMarketPrice: 100,
        regularMarketChange: 1.2,
        regularMarketChangePercent: 1.21,
        currency: 'EUR',
        shortName: 'iShares Core MSCI World',
        longName: 'iShares Core MSCI World UCITS ETF',
      },
      'AAPL': {
        regularMarketPrice: 180,
        regularMarketChange: 2.5,
        regularMarketChangePercent: 1.4,
        currency: 'EUR',
        shortName: 'Apple Inc.',
        longName: 'Apple Inc.',
      },
      'IT0005240830': {
        regularMarketPrice: 95,
        regularMarketChange: 0.3,
        regularMarketChangePercent: 0.31,
        currency: 'EUR',
        shortName: 'BTP 2037 4%',
        longName: 'Buoni Poliennali del Tesoro 2037',
      },
    });

    // Principale: SWDA.MI e AAPL
    await setDoc(doc(db, 'portfolios', uid, 'transactions', 'tx_swda_princ'), {
      symbol: 'SWDA.MI',
      name: 'iShares Core MSCI World',
      quantity: 10,
      purchasePrice: 80,
      type: 'BUY',
      date: '2023-01-15',
      currency: 'EUR',
      portfolioId: 'default',
      groups: ['ETF Core'],
    });

    await setDoc(doc(db, 'portfolios', uid, 'transactions', 'tx_aapl_princ'), {
      symbol: 'AAPL',
      name: 'Apple Inc.',
      quantity: 5,
      purchasePrice: 150,
      type: 'BUY',
      date: '2023-03-10',
      currency: 'EUR',
      portfolioId: 'default',
      groups: ['Growth Tech'],
    });

    // Fondo Pensione: SWDA.MI (comune) e BTP (distinto)
    await setDoc(doc(db, 'portfolios', uid, 'transactions', 'tx_swda_pens'), {
      symbol: 'SWDA.MI',
      name: 'iShares Core MSCI World',
      quantity: 20,
      purchasePrice: 90,
      type: 'BUY',
      date: '2023-06-20',
      currency: 'EUR',
      portfolioId: 'pensione',
      groups: ['Previdenza ETF'],
    });

    await setDoc(doc(db, 'portfolios', uid, 'transactions', 'tx_btp_pens'), {
      symbol: 'IT0005240830',
      name: 'BTP 2037 4%',
      quantity: 1000,
      purchasePrice: 90,
      type: 'BUY',
      date: '2023-09-01',
      currency: 'EUR',
      portfolioId: 'pensione',
      groups: ['Obbligazionario'],
    });

    // 1. Apri la pagina di login
    await page.goto('/login');

    // 2. Accedi con l'utente creato
    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Accedi con Google' }).click();
    const popup = await popupPromise;
    await popup.waitForLoadState();

    const addAccountBtn = popup.locator('#add-account-button');
    if (await addAccountBtn.isVisible()) {
      await addAccountBtn.click();
    }
    const emailInput = popup.locator('#email-input');
    await emailInput.fill(testEmail);
    const signInBtn = popup.locator('#sign-in');
    await expect(signInBtn).toBeEnabled({ timeout: 5000 });
    await signInBtn.click();
    await popup.waitForEvent('close');

    await expect(page).toHaveURL('/', { timeout: 20000 });
    await page.setViewportSize({ width: 390, height: 844 });

    // 1. Screenshot "Tutti i portafogli" (Aggregato)
    await expect(page.getByText('Tutti i portafogli')).toBeVisible();
    // Verifica presenza badge dei portafogli sui titoli nella vista aggregata
    await expect(page.getByTestId('asset-portfolio-badge').first()).toBeVisible();
    await page.screenshot({ path: 'test-results/screenshots/scenario-all-mobile.png', fullPage: true });

    // 2. Seleziona "Principale"
    await page.getByRole('tab', { name: 'Portafoglio Principale' }).click();
    await expect(page.getByText('ETF Core')).toBeVisible();
    await expect(page.getByText('Growth Tech')).toBeVisible();
    // I gruppi dell'altro portafoglio NON devono comparire
    await expect(page.getByText('Previdenza ETF')).not.toBeVisible();
    await expect(page.getByText('Obbligazionario')).not.toBeVisible();
    await page.screenshot({ path: 'test-results/screenshots/scenario-principale-mobile.png', fullPage: true });

    // 3. Seleziona "Fondo Pensione"
    await page.getByRole('tab', { name: 'Portafoglio Fondo Pensione' }).click();
    await expect(page.getByText('Previdenza ETF')).toBeVisible();
    await expect(page.getByText('Obbligazionario')).toBeVisible();
    // I gruppi del Principale NON devono comparire
    await expect(page.getByText('ETF Core')).not.toBeVisible();
    await expect(page.getByText('Growth Tech')).not.toBeVisible();
    await page.screenshot({ path: 'test-results/screenshots/scenario-pensione-mobile.png', fullPage: true });

    // 4. Apri il dettaglio del ticker comune SWDA.MI da Fondo Pensione
    await page.getByText('iShares Core MSCI World').first().click();
    await expect(page).toHaveURL(/\/asset\//);

    // Verifica contestualizzazione su Fondo Pensione:
    // Il badge "Fondo Pensione" è visibile nell'intestazione e nella cronologia transazioni
    await expect(page.getByTestId('asset-header-portfolio-badge')).toHaveText('Fondo Pensione');
    await expect(page.getByTestId('tx-portfolio-badge').first()).toHaveText('Fondo Pensione');
    // La quantità è 20 (specifica di Fondo Pensione, non 30 aggregata)
    await expect(page.getByTestId('metric-quantity')).toHaveText('20');
    // Il prezzo medio è 90 (specifico di Fondo Pensione, non 86.67 fuso)
    await expect(page.getByTestId('metric-average-price')).toHaveText(/90[.,]00/);

    await page.screenshot({ path: 'test-results/screenshots/scenario-asset-detail-mobile.png', fullPage: true });
  });

  test('Gestione completa portafogli: rinomina, modifica note, cambio predefinito ed eliminazione', async ({ page }) => {
    // 1. Accedi e vai a /manage-portfolios
    await loginViaEmulator(page);
    await page.goto('/manage-portfolios');
    await expect(page.getByRole('heading', { name: 'Gestisci portafogli' })).toBeVisible({ timeout: 15000 });

    // 2. Crea un nuovo portafoglio temporaneo
    const nameInput = page.getByLabel('Nome del nuovo portafoglio');
    const descInput = page.getByLabel('Descrizione del nuovo portafoglio');
    const addPortBtn = page.getByRole('button', { name: 'Aggiungi portafoglio' });

    // Tenta di aggiungere portafoglio con nome duplicato o vuoto
    await nameInput.fill('Principale');
    await addPortBtn.click();
    await page.waitForTimeout(500);

    // Crea un nuovo portafoglio valido
    await nameInput.fill('Portafoglio Test CRUD');
    await descInput.fill('Nota iniziale');
    await addPortBtn.click();

    await expect(page.getByText('Portafoglio Test CRUD')).toBeVisible({ timeout: 10000 });

    // Test riordino con freccia su e freccia giù
    const moveUpBtn = page.getByLabel('Sposta Portafoglio Test CRUD in su');
    if (await moveUpBtn.isVisible() && await moveUpBtn.isEnabled()) {
      await moveUpBtn.click();
      await page.waitForTimeout(300);
    }
    const moveDownBtn = page.getByLabel(/Sposta .* in giù/i).first();
    if (await moveDownBtn.isVisible() && await moveDownBtn.isEnabled()) {
      await moveDownBtn.click();
      await page.waitForTimeout(300);
    }

    // 3. Modifica nome e descrizione con test di annullamento
    const editBtn = page.getByLabel('Modifica Portafoglio Test CRUD');
    await expect(editBtn).toBeVisible();
    await editBtn.click();

    // Testa annullamento modifica
    const cancelEditBtn = page.getByRole('button', { name: 'Annulla' });
    await expect(cancelEditBtn).toBeVisible();
    await cancelEditBtn.click();
    await expect(cancelEditBtn).not.toBeVisible();

    // Riapri modifica e compila
    await editBtn.click();
    const editNameInput = page.getByPlaceholder('Nome portafoglio');
    await expect(editNameInput).toBeVisible();
    await editNameInput.fill('Portafoglio Aggiornato');

    const editDescInput = page.getByPlaceholder('Descrizione (facoltativa)');
    await editDescInput.fill('Nota aggiornata con successo');

    await page.getByRole('button', { name: 'Salva' }).click();
    await expect(page.getByText('Portafoglio Aggiornato')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Nota aggiornata con successo')).toBeVisible();

    // 4. Imposta come predefinito
    const setDefaultBtn = page.locator('text=Imposta predefinito').last();
    if (await setDefaultBtn.isVisible()) {
      await setDefaultBtn.click();
      await expect(page.getByText('Predefinito').last()).toBeVisible({ timeout: 5000 });
    }

    // 5. Ripristina il primo portafoglio come predefinito prima di eliminare
    const resetDefaultBtn = page.locator('text=Imposta predefinito').first();
    await expect(resetDefaultBtn).toBeVisible({ timeout: 5000 });
    await resetDefaultBtn.click();
    await page.waitForTimeout(500);

    // 6. Elimina il portafoglio gestendo il dialogo di conferma
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });

    const deleteBtn = page.getByLabel('Elimina Portafoglio Aggiornato');
    await expect(deleteBtn).toBeVisible({ timeout: 5000 });
    await deleteBtn.click();
    await expect(page.getByText('Portafoglio Aggiornato')).not.toBeVisible({ timeout: 10000 });
  });
});
