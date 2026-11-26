import { test, expect } from './fixtures';
import { loginViaEmulator } from './helpers/auth';

test.describe('Integrations E2E Tests', () => {
  let userUid = '';
  test.beforeEach(async ({ page }) => {
    userUid = await loginViaEmulator(page);
    await page.goto('/integrations');
    await expect(page.getByRole('heading', { name: 'Integrazioni broker' })).toBeVisible({ timeout: 15000 });
  });

  test('Lista integrazioni e navigazione alla configurazione Scalable', async ({ page }) => {
    // 1. Verifica presenza scheda Scalable Capital
    const scalableCard = page.getByText('Scalable Capital');
    await expect(scalableCard).toBeVisible();

    // 2. Naviga alla schermata di dettaglio Scalable
    await scalableCard.click();
    await expect(page.getByRole('heading', { name: 'Scalable Capital' })).toBeVisible({ timeout: 15000 });

    // 3. Verifica presenza istruzioni di collegamento e pulsante Collega
    await expect(page.getByText('Collega il tuo conto Scalable')).toBeVisible();
    const connectBtn = page.getByRole('button', { name: 'Collega', exact: true });
    await expect(connectBtn).toBeVisible();

    // Clicca su collega (mostra avviso di connessione backend o avvia auth)
    await connectBtn.click();
    await page.waitForTimeout(1000);

    // 4. Espandi la sezione Sviluppo (token manuale)
    const devToggle = page.getByRole('button', { name: /Sviluppo: token manuale/ });
    if (await devToggle.isVisible()) {
      await devToggle.click();
      const devInput = page.getByLabel('Token di sviluppo');
      await expect(devInput).toBeVisible();
      await devInput.fill('demo-test-token');
      await expect(devInput).toHaveValue('demo-test-token');

      // Testa la connessione in dev mode
      const testBtn = page.getByRole('button', { name: /Verifica e collega/i });
      if (await testBtn.isVisible()) {
        await testBtn.click();
        await page.waitForTimeout(1000);
      }
    }
  });

  test('Configurazione Scalable in stato connesso: liquidità, tassi e disconnessione', async ({ page }) => {
    // 1. Imposta la configurazione mock connessa in Firestore tramite REST con permessi admin
    const uid = userUid;
    if (uid) {
      await fetch(`http://127.0.0.1:8080/v1/projects/finance-95e5d/databases/(default)/documents/portfolios/${uid}/settings/integration_scalable`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
        body: JSON.stringify({
          fields: {
            enabled: { booleanValue: true },
            status: { stringValue: 'connected' },
            cashBalance: { doubleValue: 12500 },
            interestRate: { doubleValue: 2.6 },
            interestPlan: { stringValue: 'prime_plus' },
            lastSyncedAt: { stringValue: new Date().toISOString() },
            autoSync: { booleanValue: true },
            includeCashInTotal: { booleanValue: true },
          },
        }),
      });

      // Seed an active savings plan
      await fetch(`http://127.0.0.1:8080/v1/projects/finance-95e5d/databases/(default)/documents/portfolios/${uid}/settings/scalable_savings_plans/plans/plan_1`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
        body: JSON.stringify({
          fields: {
            id: { stringValue: 'plan_1' },
            name: { stringValue: 'PAC iShares World' },
            symbol: { stringValue: 'SWDA.MI' },
            amount: { doubleValue: 250 },
            frequency: { stringValue: 'MONTHLY' },
            status: { stringValue: 'ACTIVE' },
            dayOfMonth: { integerValue: '15' },
          },
        }),
      });

      // Seed a price alert
      await fetch(`http://127.0.0.1:8080/v1/projects/finance-95e5d/databases/(default)/documents/portfolios/${uid}/settings/scalable_price_alerts/alerts/alert_1`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
        body: JSON.stringify({
          fields: {
            id: { stringValue: 'alert_1' },
            symbol: { stringValue: 'SWDA.MI' },
            targetPrice: { doubleValue: 100 },
            direction: { stringValue: 'above' },
            createdAt: { stringValue: new Date().toISOString() },
          },
        }),
      });
    }

    // 2. Ricarica la schermata Scalable
    await page.goto('/integrations/scalable');
    await expect(page.getByRole('heading', { name: 'Scalable Capital' })).toBeVisible({ timeout: 15000 });

    // 3. Verifica la presenza della sezione "Stato del conto" o "Liquidità"
    await expect(page.getByText('Conto collegato')).toBeVisible({ timeout: 10000 });

    // 4. Verifica pulsante "Sincronizza ora"
    const syncBtn = page.getByRole('button', { name: /Sincronizza ora/i });
    if (await syncBtn.isVisible()) {
      await syncBtn.click();
      await page.waitForTimeout(500);
    }

    // 5. Interazione con gli switch autoSync e includeCashInTotal
    const autoSyncSwitch = page.getByLabel("Sincronizza all'apertura");
    if (await autoSyncSwitch.isVisible()) {
      await autoSyncSwitch.click();
      await page.waitForTimeout(300);
    }

    const cashSwitch = page.getByLabel("Includi la liquidità nel bilancio");
    if (await cashSwitch.isVisible()) {
      await cashSwitch.click();
      await page.waitForTimeout(300);
    }

    // 6. Interazione con i piani di rendimento della liquidità (Free, Prime+, Custom)
    const freePlanChip = page.getByRole('radio', { name: /Free/i });
    if (await freePlanChip.isVisible()) {
      await freePlanChip.click();
      await page.waitForTimeout(300);
    }

    const primePlanChip = page.getByRole('radio', { name: /Prime\+/i });
    if (await primePlanChip.isVisible()) {
      await primePlanChip.click();
      await page.waitForTimeout(300);
    }

    const otherPlanRadio = page.getByRole('radio', { name: 'Altro' });
    if (await otherPlanRadio.isVisible()) {
      await otherPlanRadio.click();
      await page.waitForTimeout(300);
    }

    const rateInput = page.getByPlaceholder(/es\. 2,6/i);
    if (await rateInput.isVisible()) {
      // Test errore validazione tasso > 20
      await rateInput.fill('25');
      const saveRateBtn = page.getByRole('button', { name: /Salva tasso/i });
      if (await saveRateBtn.isVisible()) {
        await saveRateBtn.click();
        await expect(page.getByText(/Inserisci il tasso annuo in percentuale/i)).toBeVisible();
      }

      // Test inserimento tasso valido
      await rateInput.fill('3,1');
      if (await saveRateBtn.isVisible()) {
        await saveRateBtn.click();
        await expect(page.getByText(/Tasso salvato/i)).toBeVisible({ timeout: 5000 });
      }
    }

    // 7. Zainetto fiscale navigation
    const zainettoLink = page.getByRole('link', { name: /Zainetto fiscale/i });
    if (await zainettoLink.isVisible()) {
      await zainettoLink.click();
      await expect(page.getByRole('heading', { name: 'Zainetto fiscale' })).toBeVisible({ timeout: 10000 });
      await page.goto('/integrations/scalable');
    }

    // 8. Test modale di disconnessione
    const disconnectBtn = page.getByRole('button', { name: /Scollega il conto/i });
    if (await disconnectBtn.isVisible()) {
      await disconnectBtn.click();
      // Verifica apertura modale di conferma
      await expect(page.getByRole('heading', { name: /Scollegare il conto Scalable\?/i })).toBeVisible({ timeout: 5000 });

      // Clicca "Annulla" per chiudere la modale
      const cancelBtn = page.getByRole('button', { name: 'Annulla' });
      await cancelBtn.click();
      await expect(page.getByRole('heading', { name: /Scollegare il conto Scalable\?/i })).not.toBeVisible();

      // Riapri e conferma lo scollegamento
      await page.waitForTimeout(500);
      await disconnectBtn.click();
      const confirmScollegaBtn = page.getByRole('button', { name: 'Scollega', exact: true });
      await expect(confirmScollegaBtn).toBeVisible({ timeout: 5000 });
      await confirmScollegaBtn.click();
      await page.waitForTimeout(1000);
    }
  });
});
