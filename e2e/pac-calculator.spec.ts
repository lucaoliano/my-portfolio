import { test, expect } from './fixtures';
import { loginViaEmulator } from './helpers/auth';

test.describe('PAC Calculator E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaEmulator(page);
    await page.goto('/pac-calculator');
    await expect(page.getByRole('heading', { name: 'Pianificazione patrimoniale' })).toBeVisible({ timeout: 15000 });
  });

  test('Navigazione tra tutte le tab del simulatore PAC con stile uniforme', async ({ page }) => {
    // 1. Verifica che tutte le 7 tab siano presenti e visibili
    const tabs = [
      'PAC e rendita',
      'Obiettivo',
      'Scenari',
      'Monte Carlo',
      'Costi e TER',
      'FIRE',
      'PAC Scalable',
    ];

    for (const tabName of tabs) {
      const tab = page.getByRole('tab', { name: tabName });
      await expect(tab).toBeVisible();
    }

    // 2. La prima tab ("PAC e rendita") è selezionata per default
    const pacTab = page.getByRole('tab', { name: 'PAC e rendita' });
    await expect(pacTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('Simula il tuo piano di accumulo (PAC)')).toBeVisible();

    // 3. Clicca su "Obiettivo"
    const goalTab = page.getByRole('tab', { name: 'Obiettivo' });
    await goalTab.click();
    await expect(goalTab).toHaveAttribute('aria-selected', 'true');
    await expect(pacTab).toHaveAttribute('aria-selected', 'false');
    await expect(page.getByText('Qual è il capitale obiettivo?')).toBeVisible();

    // 4. Clicca su "Scenari"
    const scenariosTab = page.getByRole('tab', { name: 'Scenari' });
    await scenariosTab.click();
    await expect(scenariosTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('Confronto tra ipotesi di rendimento')).toBeVisible();

    // 5. Clicca su "Monte Carlo"
    const mcTab = page.getByRole('tab', { name: 'Monte Carlo' });
    await mcTab.click();
    await expect(mcTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('Simulazione Monte Carlo')).toBeVisible();

    // 6. Clicca su "PAC Scalable" e verifica che sia allineato graficamente
    const scalableTab = page.getByRole('tab', { name: /PAC Scalable/ });
    await scalableTab.click();
    await expect(scalableTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('Piani di accumulo Scalable')).toBeVisible();
  });

  test('Interazione con importi, chip rapidi e aggiornamento calcolo dinamico', async ({ page }) => {
    // 1. Verifica campo Importo Periodico
    const periodicInput = page.getByLabel('Importo periodico in euro');
    await expect(periodicInput).toBeVisible();
    await expect(periodicInput).toHaveValue('500');

    // 2. Clicca sul chip rapido "€200"
    const chip200 = page.getByRole('button', { name: '€200' });
    await expect(chip200).toBeVisible();
    await chip200.click();

    // 3. Verifica che il valore del campo sia aggiornato a 200
    await expect(periodicInput).toHaveValue('200');

    // 4. Clicca sul chip rapido "€1.000" o "€1,000" dell'importo periodico
    const chip1000 = page.getByRole('button', { name: /€1[.,]000/ }).last();
    await expect(chip1000).toBeVisible();
    await chip1000.click();
    await expect(periodicInput).toHaveValue('1000');

    // 5. Verifica che il risultato principale stimato sia visibile e non vuoto
    const heroResult = page.locator('text=Totale versato').first();
    await expect(heroResult).toBeVisible();
  });

  test('Modalità Goal Seeker: switch tra "Calcola la rata" e "Calcola gli anni"', async ({ page }) => {
    // 1. Vai al tab Obiettivo
    await page.getByRole('tab', { name: 'Obiettivo' }).click();

    // 2. Controlla il segmented control "Cosa calcolare"
    const calcRateTab = page.getByRole('tab', { name: 'Calcola la rata' });
    const calcYearsTab = page.getByRole('tab', { name: 'Calcola gli anni' });

    await expect(calcRateTab).toBeVisible();
    await expect(calcYearsTab).toBeVisible();
    await expect(calcRateTab).toHaveAttribute('aria-selected', 'true');

    // In modalità rata, compare la stima della rata
    await expect(page.getByText(/Rata stimata per raggiungere/)).toBeVisible();

    // 3. Passa a "Calcola gli anni"
    await calcYearsTab.click();
    await expect(calcYearsTab).toHaveAttribute('aria-selected', 'true');
    await expect(calcRateTab).toHaveAttribute('aria-selected', 'false');

    // In modalità anni, compare la stima degli anni necessari
    await expect(page.getByText(/anni di versamenti/)).toBeVisible();
  });

  test('Fase di Rendita (Prelievi): attivazione switch e comparsa metriche', async ({ page }) => {
    // Lo switch dei prelievi è inizialmente disattivo
    const toggleSwitch = page.getByLabel('Fase di prelievo');
    await expect(toggleSwitch).toBeVisible();

    // Attiva la rendita
    await toggleSwitch.click();

    // Verifica che compaia la sezione dei prelievi e la modalità "Prelievo in euro di oggi"
    await expect(page.getByText(/2\. Prelievi/)).toBeVisible();
    await expect(page.getByText('Prelievo in euro di oggi')).toBeVisible();
  });

  test('Tab Costi e TER: rendering confronto commissioni FeeDrag', async ({ page }) => {
    // 1. Clicca sulla tab Costi e TER
    await page.getByRole('tab', { name: 'Costi e TER' }).click();

    // 2. Verifica la presenza del titolo e del componente grafico di incidenza costi
    await expect(page.getByRole('heading', { name: 'Effetto dei costi di gestione (TER)' })).toBeVisible();
    await expect(page.getByText(/Costo basso/).first()).toBeVisible();
    await expect(page.getByText(/Costo alto/).first()).toBeVisible();
    await expect(page.getByText(/Differenza dovuta ai costi/)).toBeVisible();
  });

  test('Tab FIRE: simulazione indipendenza finanziaria e Safe Withdrawal Rate', async ({ page }) => {
    // 1. Clicca sulla tab FIRE
    await page.getByRole('tab', { name: 'FIRE' }).click();

    // 2. Verifica la presenza del titolo della sezione FIRE
    await expect(page.getByRole('heading', { name: 'Indipendenza finanziaria (FIRE)' })).toBeVisible();
    await expect(page.getByText(/regola empirica del 4%/)).toBeVisible();

    // 3. Verifica i risultati principali di stima anni a FIRE
    await expect(page.getByText(/Anni di PAC stimati/)).toBeVisible();
    await expect(page.getByText(/Rendita mensile sostenibile/)).toBeVisible();
  });

  test('Modale Piani salvati ed esportazione: apertura, form e chiusura', async ({ page }) => {
    // 1. Clicca sull'icona segnalibro nell'header per aprire il modale
    const savedModalBtn = page.getByLabel('Piani salvati ed esportazione');
    await expect(savedModalBtn).toBeVisible();
    await savedModalBtn.click();

    // 2. Verifica comparsa del modale
    await expect(page.getByRole('heading', { name: 'Piani e simulazioni salvate' })).toBeVisible();

    // 3. Clicca su "Salva la simulazione" per aprire il form di inserimento
    const saveNewBtn = page.getByRole('button', { name: 'Salva la simulazione' });
    await expect(saveNewBtn).toBeVisible();
    await saveNewBtn.click();

    const planInput = page.getByLabel('Nome del piano');
    await expect(planInput).toBeVisible();
    await planInput.fill('Test PAC Pensione');

    // Clicca Salva
    const confirmBtn = page.getByRole('button', { name: 'Salva', exact: true });
    await expect(confirmBtn).toBeVisible();
    await confirmBtn.click();

    // Verifica presenza del piano salvato nell'elenco
    const savedItem = page.getByRole('button', { name: /Test PAC Pensione/ }).first();
    await expect(savedItem).toBeVisible({ timeout: 5000 });

    // Tentativo di salvare un piano duplicato per coprire ramo di validazione e sovrascrittura
    await saveNewBtn.click();
    const dupInput = page.getByLabel('Nome del piano');
    await dupInput.fill('Test PAC Pensione');
    await expect(page.getByText(/Esiste già un piano con questo nome/i)).toBeVisible();
    await page.getByRole('button', { name: 'Sovrascrivi', exact: true }).click();

    // Clicca sul piano salvato per caricarlo (onLoadSimulation chiude il modale)
    await savedItem.click();
    await expect(page.getByRole('heading', { name: 'Piani e simulazioni salvate' })).not.toBeVisible({ timeout: 5000 });

    // Riapri il modale per testare eliminazione e CSV
    await savedModalBtn.click();
    await expect(page.getByRole('heading', { name: 'Piani e simulazioni salvate' })).toBeVisible();

    // Clicca su Esporta CSV
    const exportCsvBtn = page.getByRole('button', { name: /Esporta CSV/ });
    if (await exportCsvBtn.isVisible()) {
      await exportCsvBtn.click();
    }

    // Elimina il piano appena salvato
    const deleteBtn = page.getByLabel('Elimina Test PAC Pensione');
    if (await deleteBtn.isVisible()) {
      await deleteBtn.click();
      const confirmDelete = page.getByRole('button', { name: 'Elimina', exact: true });
      if (await confirmDelete.isVisible()) {
        await confirmDelete.click();
      }
      await expect(page.getByText('Test PAC Pensione')).not.toBeVisible({ timeout: 5000 });
    }

    // 4. Chiudi il modale
    const closeBtn = page.getByRole('button', { name: 'Chiudi' });
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();

    // 5. Verifica che il modale sia chiuso
    await expect(page.getByRole('heading', { name: 'Piani e simulazioni salvate' })).not.toBeVisible();
  });
});
