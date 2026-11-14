import { initializeApp } from 'firebase/app';
import {
  initializeAuth,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
} from 'firebase/auth';
import {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  getDoc,
  setDoc,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  DEFAULT_PORTFOLIO,
  DEFAULT_PORTFOLIO_ID,
  createNewPortfolio,
  updateExistingPortfolio,
  setAsDefaultPortfolio,
  reorderPortfoliosList,
  validatePortfolioDeletion,
} from '../src/utils/portfolioManager';
import { Portfolio, UserSettings } from '../src/types';

let failures = 0;

const assert = (label: string, condition: boolean, extraInfo?: unknown) => {
  if (condition) {
    console.log(`✅ PASS: ${label}`);
  } else {
    failures++;
    console.error(`❌ FAIL: ${label}`, extraInfo ? extraInfo : '');
  }
};

const runE2ETests = async () => {
  console.log('--- STARTING E2E PORTFOLIOS TEST SUITE ---');

  const app = initializeApp({
    projectId: 'demo-finance-test',
    apiKey: 'fake-test-key',
  });

  const auth = initializeAuth(app);
  const authEmulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
  connectAuthEmulator(auth, `http://${authEmulatorHost}`);

  const db = getFirestore(app);
  const firestoreEmulatorHost = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
  const [fHost, fPort] = firestoreEmulatorHost.split(':');
  connectFirestoreEmulator(db, fHost, parseInt(fPort, 10));

  // Authenticate user to satisfy Firestore security rules (isOwner(userId))
  const testEmail = `user_${Date.now()}@example.com`;
  const cred = await createUserWithEmailAndPassword(auth, testEmail, 'testPassword123');
  const testUserId = cred.user.uid;
  console.log(`Authenticated test user: ${testUserId} (${testEmail})`);

  const prefRef = doc(db, 'portfolios', testUserId, 'settings', 'preferences');

  // -------------------------------------------------------------
  // SCENARIO 0: Reproduce the exact bug that caused:
  // "Portafoglio non aggiunto. Riprova."
  // -------------------------------------------------------------
  console.log('\n[Scenario 0] Verifying bug reproduction with undefined description');
  const buggyNewPortfolio = {
    id: 'port_buggy',
    name: 'Fondo Pensione',
    description: undefined, // Leaving description empty resulted in undefined
    createdAt: new Date().toISOString(),
  };

  let threwExpectedError = false;
  try {
    await setDoc(prefRef, {
      portfolios: [DEFAULT_PORTFOLIO, buggyNewPortfolio],
    }, { merge: true });
  } catch (err: unknown) {
    const errorMsg = (err as Error)?.message || String(err);
    if (errorMsg.includes('Unsupported field value: undefined')) {
      threwExpectedError = true;
      console.log('  -> Bug reproduced: Firestore rejected undefined description:', errorMsg);
    }
  }
  assert('Firestore rejects array with undefined field value', threwExpectedError);

  // -------------------------------------------------------------
  // SCENARIO 1: Adding a new portfolio WITHOUT description
  // (The exact user scenario that failed)
  // -------------------------------------------------------------
  console.log('\n[Scenario 1] Add new portfolio without description (Fixed)');
  const initialPortfolios: Portfolio[] = [DEFAULT_PORTFOLIO];

  const addResult1 = createNewPortfolio(initialPortfolios, 'Fondo Pensione', '');
  assert('createNewPortfolio succeeds for empty description', addResult1.ok === true && !!addResult1.portfolios);
  assert('New portfolio does not contain undefined properties', addResult1.newPortfolio ? !('description' in addResult1.newPortfolio) : false);

  // Save to Firestore via setDoc with merge: true
  let saveSuccess1 = false;
  try {
    await setDoc(prefRef, {
      groups: ['Generale'],
      defaultGroup: 'Generale',
      portfolios: addResult1.portfolios!,
      defaultPortfolioId: DEFAULT_PORTFOLIO_ID,
    }, { merge: true });
    saveSuccess1 = true;
  } catch (err) {
    console.error('Save failed:', err);
  }
  assert('setDoc succeeds without throwing "Unsupported field value: undefined"', saveSuccess1);

  // Read back and verify persistence
  const snap1 = await getDoc(prefRef);
  const data1 = snap1.data() as UserSettings;
  assert('Document contains 2 portfolios', data1.portfolios?.length === 2);
  assert('First is default Principale', data1.portfolios?.[0]?.name === 'Principale');
  assert('Second is Fondo Pensione', data1.portfolios?.[1]?.name === 'Fondo Pensione');
  assert('Second has no undefined description', data1.portfolios?.[1]?.description === undefined);

  // -------------------------------------------------------------
  // SCENARIO 2: Add portfolio WITH description
  // -------------------------------------------------------------
  console.log('\n[Scenario 2] Add portfolio with description');
  const addResult2 = createNewPortfolio(addResult1.portfolios!, 'Trading', 'Azioni e opzioni ad alto rischio');
  assert('createNewPortfolio succeeds with description', addResult2.ok === true && !!addResult2.portfolios);
  assert('New portfolio has trimmed description', addResult2.newPortfolio?.description === 'Azioni e opzioni ad alto rischio');

  let saveSuccess2 = false;
  try {
    await setDoc(prefRef, { portfolios: addResult2.portfolios }, { merge: true });
    saveSuccess2 = true;
  } catch (err) {
    console.error('Save failed:', err);
  }
  assert('setDoc succeeds when adding with description', saveSuccess2);

  const snap2 = await getDoc(prefRef);
  const data2 = snap2.data() as UserSettings;
  assert('Document contains 3 portfolios', data2.portfolios?.length === 3);
  const tradingPersisted = data2.portfolios?.find(p => p.name === 'Trading');
  assert('Trading portfolio persisted with description', tradingPersisted?.description === 'Azioni e opzioni ad alto rischio');

  // -------------------------------------------------------------
  // SCENARIO 3: Editing / Renaming and clearing description
  // -------------------------------------------------------------
  console.log('\n[Scenario 3] Edit and clear description (must not introduce undefined)');
  const tradingId = addResult2.newPortfolio!.id;
  const updateResult = updateExistingPortfolio(addResult2.portfolios!, tradingId, 'Trading Aggressivo', '   ');
  assert('updateExistingPortfolio succeeds', updateResult.ok === true && !!updateResult.portfolios);

  const updatedTrading = updateResult.portfolios!.find(p => p.id === tradingId);
  assert('Name updated correctly', updatedTrading?.name === 'Trading Aggressivo');
  assert('Cleared description is removed from object (not undefined)', !('description' in (updatedTrading || {})));

  let saveSuccess3 = false;
  try {
    await setDoc(prefRef, { portfolios: updateResult.portfolios }, { merge: true });
    saveSuccess3 = true;
  } catch (err) {
    console.error('Save failed on update:', err);
  }
  assert('setDoc succeeds on update with cleared description', saveSuccess3);

  const snap3 = await getDoc(prefRef);
  const data3 = snap3.data() as UserSettings;
  const reloadedTrading = data3.portfolios?.find(p => p.id === tradingId);
  assert('Name is Trading Aggressivo in Firestore', reloadedTrading?.name === 'Trading Aggressivo');
  assert('Description field is absent in Firestore doc', reloadedTrading?.description === undefined);

  // -------------------------------------------------------------
  // SCENARIO 4: Setting Default Portfolio
  // -------------------------------------------------------------
  console.log('\n[Scenario 4] Set default portfolio');
  const pensionId = addResult1.newPortfolio!.id;
  const { portfolios: defaultUpdated, defaultPortfolioId } = setAsDefaultPortfolio(updateResult.portfolios!, pensionId);
  assert('defaultPortfolioId is updated', defaultPortfolioId === pensionId);
  assert('Pension isDefault is true', defaultUpdated.find(p => p.id === pensionId)?.isDefault === true);
  assert('Principale isDefault is false', defaultUpdated.find(p => p.id === DEFAULT_PORTFOLIO_ID)?.isDefault === false);

  let saveSuccess4 = false;
  try {
    await setDoc(prefRef, { portfolios: defaultUpdated, defaultPortfolioId }, { merge: true });
    saveSuccess4 = true;
  } catch (err) {
    console.error('Save failed on setDefault:', err);
  }
  assert('setDoc succeeds on setDefault', saveSuccess4);

  const snap4 = await getDoc(prefRef);
  const data4 = snap4.data() as UserSettings;
  assert('defaultPortfolioId is stored in Firestore', data4.defaultPortfolioId === pensionId);

  // -------------------------------------------------------------
  // SCENARIO 5: Transaction assignment and deletion with migration
  // -------------------------------------------------------------
  console.log('\n[Scenario 5] Transaction assignment and safe portfolio deletion');
  const txCollection = collection(db, 'portfolios', testUserId, 'transactions');
  const newTxDoc = await addDoc(txCollection, {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    quantity: 10,
    purchasePrice: 150,
    date: '2026-01-15',
    portfolioId: tradingId, // assigned to Trading Aggressivo
    groups: ['Generale'],
  });
  const txRefId = newTxDoc.id;
  assert('Transaction created in trading portfolio', !!txRefId);

  // Attempt to delete default portfolio (Pension) -> must be prevented
  const delValidation1 = validatePortfolioDeletion(defaultUpdated, pensionId, defaultPortfolioId);
  assert('Deleting default portfolio is prevented', delValidation1.canDelete === false);

  // Attempt to delete Trading Aggressivo -> allowed
  const delValidation2 = validatePortfolioDeletion(defaultUpdated, tradingId, defaultPortfolioId);
  assert('Deleting non-default portfolio is allowed', delValidation2.canDelete === true);

  // Migrate transactions from tradingId to pensionId (default)
  const q = query(txCollection, where('portfolioId', '==', tradingId));
  const snap = await getDocs(q);
  assert('Found 1 transaction to migrate', snap.docs.length === 1);

  const batch = writeBatch(db);
  snap.forEach(d => {
    batch.update(d.ref, { portfolioId: defaultPortfolioId });
  });
  await batch.commit();

  // Verify transaction was migrated
  const qAfter = query(txCollection, where('portfolioId', '==', defaultPortfolioId));
  const snapAfter = await getDocs(qAfter);
  assert('Transaction successfully migrated to default portfolio', snapAfter.docs.some(d => d.id === txRefId));

  // Remove trading from portfolios
  const remainingPortfolios = defaultUpdated.filter(p => p.id !== tradingId);
  let saveSuccess5 = false;
  try {
    await setDoc(prefRef, { portfolios: remainingPortfolios }, { merge: true });
    saveSuccess5 = true;
  } catch (err) {
    console.error('Save failed on deletion:', err);
  }
  assert('setDoc succeeds on portfolio deletion', saveSuccess5);

  const snap5 = await getDoc(prefRef);
  const data5 = snap5.data() as UserSettings;
  assert('Remaining portfolios length in Firestore is 2', data5.portfolios?.length === 2);
  assert('Trading Aggressivo no longer exists in Firestore', !data5.portfolios?.some(p => p.id === tradingId));

  // -------------------------------------------------------------
  // SCENARIO 6: Validation rules
  // -------------------------------------------------------------
  console.log('\n[Scenario 6] Validation edge cases');
  const dupResult = createNewPortfolio(remainingPortfolios, 'Fondo Pensione');
  assert('Duplicate portfolio name is rejected', dupResult.ok === false);

  const emptyResult = createNewPortfolio(remainingPortfolios, '   ');
  assert('Empty portfolio name is rejected', emptyResult.ok === false);

  const reordered = reorderPortfoliosList(remainingPortfolios, 0, 1);
  assert('Reorder moves item', reordered[0].id === remainingPortfolios[1].id);

  console.log('\n=========================================');
  if (failures === 0) {
    console.log('🎉 ALL E2E PORTFOLIO TESTS PASSED SUCCESSFULLY!');
  } else {
    console.error(`💥 ${failures} TEST(S) FAILED!`);
    process.exit(1);
  }
};

runE2ETests().catch(err => {
  console.error('FATAL ERROR IN E2E TESTS:', err);
  process.exit(1);
});
