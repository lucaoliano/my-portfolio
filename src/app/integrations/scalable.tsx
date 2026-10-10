import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Switch,
  ActivityIndicator,
  Platform,
  Linking,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, CheckCircle2, AlertCircle, RefreshCw, Copy, ExternalLink, ChevronRight, Lock } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';

import { useAppTheme } from '../../theme/ThemeContext';
import { ThemeColors, withAlpha } from '../../theme/colors';
import { auth } from '../../config/firebase';
import {
  testScalableMcpConnection,
  saveScalableConfig,
  disconnectScalable,
  syncScalablePortfolio,
  refreshScalableSession,
  startScalableDeviceAuth,
  pollScalableDeviceAuth,
  ScalableDeviceAuthSession,
  DEFAULT_SCALABLE_MCP_URL,
} from '../../services/scalableMcp';
import { formatNumber, formatDate, parseLocalNumber, formatInputNumber } from '../../utils/formatters';
import { useScalableConfig } from '../../hooks/useScalableConfig';
import { useScalableSavingsPlans } from '../../hooks/useScalableSavingsPlans';
import { useScalablePriceAlerts } from '../../hooks/useScalablePriceAlerts';
import { usePortfolioOverview } from '../../hooks/usePortfolioOverview';
import { useScalableTaxReport } from '../../hooks/useScalableTaxReport';
import { evaluateAllAlerts } from '../../utils/priceAlerts';
import { calculateCashYield, interestCapFor, SCALABLE_INTEREST_PLANS, ScalableInterestPlanId } from '../../utils/cashInterest';
import { frequencyLabel, monthlyEquivalent } from '../../utils/savingsPlans';

type Notice = { text: string; tone: 'info' | 'success' | 'error' } | null;

const eur = (v: number) => `€${formatNumber(v)}`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Messaggi per l'utente: mai il testo tecnico (spesso in inglese) del backend */
const friendlyError = (err: unknown, fallback: string) => {
  const e = err as { code?: string; message?: string };
  const code = (e?.code || '').replace('functions/', '');
  if (code === 'unauthenticated') return 'Sessione Scalable scaduta: ricollega il conto.';
  if (code === 'unavailable' || code === 'deadline-exceeded') return 'Scalable non risponde in questo momento. Riprova tra qualche minuto.';
  if (code === 'failed-precondition') return 'Il collegamento con Scalable non è attivo: ricollega il conto.';
  const msg = (e?.message || '').toLowerCase();
  if (msg.includes('negata') || msg.includes('denied')) return 'Scalable ha negato l\'accesso: controlla di aver attivato "Scalable CLI" in Profilo > Sicurezza > Agentic Investing.';
  if (msg.includes('network') || msg.includes('fetch')) return 'Connessione assente: controlla la rete e riprova.';
  return fallback;
};

/** Apre un indirizzo esterno senza dare alla pagina aperta accesso a questa */
const openExternal = (url: string) => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
  } else {
    Linking.openURL(url).catch(() => {});
  }
};

const formatWhen = (iso?: string) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const time = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString()
    ? `oggi alle ${time}`
    : `${d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })} alle ${time}`;
};

/**
 * Integrazione Scalable in tre stati: non collegato, in collegamento, collegato.
 * Le credenziali restano sul server; qui si vedono solo stato, dati sincronizzati e preferenze.
 */
export default function ScalableIntegrationScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = getStyles(colors);
  const userId = auth.currentUser?.uid;

  const { config, loading } = useScalableConfig(userId);
  const { plans } = useScalableSavingsPlans(userId);
  const { alerts, refreshing: refreshingAlerts, refreshAlerts } = useScalablePriceAlerts(userId);
  const { transactions, quotesState } = usePortfolioOverview(userId);
  const { taxReport } = useScalableTaxReport(userId, transactions);

  const isConnected = !!config?.enabled && config?.status === 'connected';
  const isExpired = !!config?.enabled && (config?.status === 'expired' || config?.status === 'error');

  // ---- Collegamento (device authorization, RFC 8628) ----
  const [session, setSession] = useState<ScalableDeviceAuthSession | null>(null);
  const [starting, setStarting] = useState(false);
  const [phase, setPhase] = useState<'waiting' | '2fa' | 'expired' | 'syncing'>('waiting');
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [codeCopied, setCodeCopied] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deadline = useRef(0);
  const cancelled = useRef(false);

  const stopPolling = useCallback(() => {
    cancelled.current = true;
    if (pollTimer.current) clearTimeout(pollTimer.current);
    pollTimer.current = null;
  }, []);
  useEffect(() => stopPolling, [stopPolling]);

  // Conto alla rovescia del codice
  useEffect(() => {
    if (!session || phase === 'expired' || phase === 'syncing') return;
    const t = setInterval(() => {
      const left = Math.max(0, Math.round((deadline.current - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) {
        stopPolling();
        setPhase('expired');
      }
    }, 1000);
    return () => clearInterval(t);
  }, [session, phase, stopPolling]);

  const finishConnection = async () => {
    setPhase('syncing');
    try {
      const res = await syncScalablePortfolio({ targetGroup: 'Scalable' });
      setSession(null);
      setNotice({
        tone: 'success',
        text: `Conto collegato. Prima sincronizzazione completata: ${plural(res.importedCount, 'transazione importata', 'transazioni importate')}.`,
      });
    } catch (err) {
      setSession(null);
      setNotice({ tone: 'error', text: `Conto collegato, ma la prima sincronizzazione non è riuscita. ${friendlyError(err, 'Riprova con "Sincronizza ora".')}` });
    }
  };

  // Un controllo alla volta (niente sovrapposizioni), con l'intervallo indicato da Scalable
  const schedulePoll = (intervalSec: number) => {
    if (cancelled.current) return;
    pollTimer.current = setTimeout(async () => {
      if (cancelled.current) return;
      if (Date.now() > deadline.current) {
        setPhase('expired');
        return;
      }
      let next = intervalSec;
      try {
        const res = await pollScalableDeviceAuth();
        if (cancelled.current) return;
        switch (res.status) {
          case 'authorized':
            await finishConnection();
            return;
          case '2fa_pending':
            setPhase('2fa');
            break;
          case 'slow_down':
            next = intervalSec + 5;
            break;
          case 'expired':
            setPhase('expired');
            return;
          case 'denied':
            setSession(null);
            setNotice({ tone: 'error', text: 'Scalable ha negato l\'accesso. Controlla di aver attivato "Scalable CLI" in Profilo > Sicurezza > Agentic Investing, poi riprova.' });
            return;
          case 'not_found':
          case 'error':
            setSession(null);
            setNotice({ tone: 'error', text: res.message && !/[a-z]{3,} [a-z]{3,} error/i.test(res.message) ? res.message : 'La procedura di collegamento si è interrotta. Riprova.' });
            return;
          default:
            break;
        }
      } catch (err) {
        // Un errore di rete isolato non chiude la procedura: si riprova al giro successivo
        console.warn('Controllo autorizzazione non riuscito:', err);
      }
      schedulePoll(next);
    }, intervalSec * 1000);
  };

  const startConnection = async () => {
    setStarting(true);
    setNotice(null);
    try {
      const s = await startScalableDeviceAuth();
      cancelled.current = false;
      deadline.current = Date.now() + (s.expiresIn || 600) * 1000;
      setSecondsLeft(s.expiresIn || 600);
      setPhase('waiting');
      setSession(s);
      schedulePoll(Math.max(s.interval || 5, 5));
    } catch (err) {
      setNotice({ tone: 'error', text: friendlyError(err, 'Non è stato possibile avviare il collegamento con Scalable. Riprova tra qualche minuto.') });
    } finally {
      setStarting(false);
    }
  };

  const cancelConnection = () => {
    stopPolling();
    setSession(null);
  };

  const copyCode = async () => {
    if (!session) return;
    await Clipboard.setStringAsync(session.userCode);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  // ---- Collegato ----
  const [syncing, setSyncing] = useState(false);
  const [renewing, setRenewing] = useState(false);

  const syncNow = async () => {
    setSyncing(true);
    setNotice(null);
    try {
      const res = await syncScalablePortfolio({ targetGroup: 'Scalable' });
      const parts = [plural(res.importedCount, 'nuova transazione', 'nuove transazioni')];
      if (res.deduplicatedCount) parts.push(plural(res.deduplicatedCount, 'duplicato unificato', 'duplicati unificati'));
      setNotice({ tone: 'success', text: `Sincronizzazione completata: ${parts.join(', ')}.` });
    } catch (err) {
      setNotice({ tone: 'error', text: friendlyError(err, 'Sincronizzazione non riuscita. I dati mostrati sono quelli dell\'ultima sincronizzazione.') });
    } finally {
      setSyncing(false);
    }
  };

  const renewSession = async () => {
    setRenewing(true);
    setNotice(null);
    try {
      await refreshScalableSession();
      setNotice({ tone: 'success', text: 'Sessione rinnovata.' });
    } catch {
      setNotice({ tone: 'error', text: 'Rinnovo non riuscito: ricollega il conto con il codice di verifica. Le tue transazioni restano dove sono.' });
    } finally {
      setRenewing(false);
    }
  };

  const savePref = async (prefs: Parameters<typeof saveScalableConfig>[1]) => {
    if (!userId) return;
    try {
      await saveScalableConfig(userId, prefs);
    } catch (err) {
      console.error('Errore salvataggio preferenze Scalable:', err);
      setNotice({ tone: 'error', text: 'Preferenza non salvata: riprova.' });
    }
  };

  // ---- Liquidità ----
  const cash = typeof config?.cashBalance === 'number' ? config.cashBalance : null;
  const [plan, setPlan] = useState<ScalableInterestPlanId>('custom');
  const [rateInput, setRateInput] = useState('');
  const [rateError, setRateError] = useState<string | null>(null);
  const [rateSaved, setRateSaved] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      setPlan((config?.interestPlan as ScalableInterestPlanId) || 'custom');
      setRateInput(typeof config?.interestRate === 'number' ? formatInputNumber(config.interestRate) : '');
    }, 0);
    return () => clearTimeout(t);
  }, [config?.interestPlan, config?.interestRate]);

  const rateValue = parseLocalNumber(rateInput);
  const rateDirty = rateInput.trim() !== '' && (rateValue !== config?.interestRate || plan !== (config?.interestPlan || 'custom'));
  const cap = interestCapFor(plan);
  const yieldEst = cash !== null && rateValue >= 0 ? calculateCashYield(cash, rateValue, undefined, cap) : null;

  const choosePlan = (id: ScalableInterestPlanId) => {
    setPlan(id);
    if (id !== 'custom') setRateInput(formatInputNumber(SCALABLE_INTEREST_PLANS[id].rate));
    setRateError(null);
  };

  const saveRate = async () => {
    if (!(rateValue >= 0) || rateValue > 20) {
      setRateError('Inserisci il tasso annuo in percentuale, tra 0 e 20 (es. 2,6).');
      return;
    }
    await savePref({ interestPlan: plan, interestRate: rateValue });
    setRateSaved(true);
    setTimeout(() => setRateSaved(false), 2000);
  };

  // ---- Avvisi e piani ----
  const evaluatedAlerts = useMemo(() => evaluateAllAlerts(alerts, quotesState.quotes), [alerts, quotesState.quotes]);
  const activePlans = plans.filter(p => p.status === 'ACTIVE');
  const monthlyTotal = activePlans.reduce((sum, p) => sum + monthlyEquivalent(p), 0);

  // ---- Scollegamento ----
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const doDisconnect = async () => {
    setDisconnecting(true);
    try {
      const res = await disconnectScalable();
      setConfirmDisconnect(false);
      setNotice({ tone: res.revoked ? 'success' : 'info', text: res.message });
    } catch (err) {
      setNotice({ tone: 'error', text: friendlyError(err, 'Scollegamento non riuscito: il conto risulta ancora collegato. Riprova tra qualche istante.') });
      setConfirmDisconnect(false);
    } finally {
      setDisconnecting(false);
    }
  };

  // ---- Configurazione manuale: solo in sviluppo ----
  const [devOpen, setDevOpen] = useState(false);
  const [devToken, setDevToken] = useState('');
  const [devTesting, setDevTesting] = useState(false);
  const testDev = async () => {
    setDevTesting(true);
    const res = await testScalableMcpConnection(DEFAULT_SCALABLE_MCP_URL, devToken);
    setDevTesting(false);
    setNotice({ tone: res.success ? 'success' : 'error', text: res.message });
    if (res.success) setDevToken('');
  };

  const noticeView = notice && (
    <View
      style={[styles.notice, notice.tone === 'error' ? styles.noticeError : notice.tone === 'success' ? styles.noticeSuccess : styles.noticeInfo]}
      accessibilityRole={notice.tone === 'error' ? 'alert' : undefined}
      accessibilityLiveRegion="polite"
    >
      {notice.tone === 'error'
        ? <AlertCircle size={16} color={colors.negative} style={styles.noticeIcon} />
        : <CheckCircle2 size={16} color={notice.tone === 'success' ? colors.scalable : colors.textSecondary} style={styles.noticeIcon} />}
      <Text style={styles.noticeText}>{notice.text}</Text>
    </View>
  );

  const switchProps = (value: boolean) => ({
    value,
    trackColor: { false: withAlpha(colors.textSecondary, 0.45), true: colors.primary },
    thumbColor: colors.card,
    // react-native-web usa activeThumbColor per il pallino acceso
    ...({ activeThumbColor: colors.background } as object),
  });

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}><ActivityIndicator color={colors.textSecondary} /></View>
      </SafeAreaView>
    );
  }

  const lastSync = formatWhen(config?.lastSyncedAt);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconButton} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} accessibilityRole="button" accessibilityLabel="Indietro">
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} accessibilityRole="header">Scalable Capital</Text>
        <View style={styles.iconButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {noticeView}

        {/* ===== In collegamento ===== */}
        {session ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Conferma su Scalable</Text>
            {phase === 'syncing' ? (
              <View style={styles.rowCenter} accessibilityLiveRegion="polite">
                <ActivityIndicator color={colors.scalable} style={{ marginRight: 10 }} />
                <Text style={styles.body}>Conto collegato. Sincronizzo il portafoglio…</Text>
              </View>
            ) : phase === 'expired' ? (
              <>
                <Text style={styles.body}>Il codice è scaduto prima della conferma.</Text>
                <TouchableOpacity style={styles.primaryButton} onPress={startConnection} disabled={starting} accessibilityRole="button">
                  {starting ? <ActivityIndicator color={colors.background} /> : <Text style={styles.primaryButtonText}>Genera un nuovo codice</Text>}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.body}>
                  1. Apri Scalable e accedi.{'\n'}2. Controlla che il codice mostrato sia questo, poi conferma.
                </Text>
                <View style={styles.codeBox} accessible accessibilityLabel={`Codice di verifica ${session.userCode.split('').join(' ')}`}>
                  <Text style={styles.codeLabel}>Codice di verifica</Text>
                  <Text style={styles.code} selectable>{session.userCode}</Text>
                </View>
                <View style={styles.buttonRow}>
                  <TouchableOpacity style={[styles.primaryButton, { flex: 1, marginTop: 0 }]} onPress={() => openExternal(session.verificationUriComplete)} accessibilityRole="link">
                    <ExternalLink size={16} color={colors.background} style={{ marginRight: 8 }} />
                    <Text style={styles.primaryButtonText}>Apri Scalable</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.secondaryButton} onPress={copyCode} accessibilityRole="button" accessibilityLabel="Copia il codice">
                    <Copy size={16} color={colors.text} style={{ marginRight: 6 }} />
                    <Text style={styles.secondaryButtonText}>{codeCopied ? 'Copiato' : 'Copia'}</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.rowCenter} accessibilityLiveRegion="polite">
                  <ActivityIndicator size="small" color={colors.textSecondary} style={{ marginRight: 8 }} />
                  <Text style={styles.muted}>
                    {phase === '2fa'
                      ? 'Scalable ha inviato una notifica al tuo telefono: aprila nell\'app Scalable e conferma.'
                      : `In attesa della conferma · il codice scade tra ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`}
                  </Text>
                </View>
              </>
            )}
            {phase !== 'syncing' && (
              <TouchableOpacity style={styles.textButton} onPress={cancelConnection} accessibilityRole="button">
                <Text style={styles.textButtonLabel}>Annulla</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : !isConnected && !isExpired ? (
          /* ===== Non collegato ===== */
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Collega il tuo conto Scalable</Text>
              <Text style={styles.body}>
                L&apos;app legge posizioni, movimenti, liquidità, piani di accumulo e avvisi di prezzo per tenere aggiornata la panoramica. Non invia ordini.
              </Text>
              <Text style={styles.sectionLabel}>Prima di iniziare</Text>
              {[
                'Su scalable.capital (anche dal browser del telefono) apri Profilo > Sicurezza > Agentic Investing.',
                'Attiva l\'accesso "Scalable CLI". Senza questo passaggio Scalable risponde "Attivazione negata".',
                'Torna qui e tocca "Collega". Ti mostreremo un codice da confermare su Scalable.',
              ].map((step, i) => (
                <View key={i} style={styles.step}>
                  <Text style={styles.stepNumber}>{i + 1}</Text>
                  <Text style={styles.stepText}>{step}</Text>
                </View>
              ))}
              <Text style={styles.muted}>
                L&apos;accesso &quot;Scalable CLI&quot; vale per tutto il conto: quest&apos;app lo usa solo per leggere. Puoi revocarlo in qualsiasi momento, da qui o dal sito di Scalable.
              </Text>
              <TouchableOpacity style={styles.primaryButton} onPress={startConnection} disabled={starting} accessibilityRole="button">
                {starting ? <ActivityIndicator color={colors.background} /> : <Text style={styles.primaryButtonText}>Collega</Text>}
              </TouchableOpacity>
            </View>

            {__DEV__ && (
              <View style={styles.card}>
                <TouchableOpacity style={styles.rowBetween} onPress={() => setDevOpen(o => !o)} accessibilityRole="button" aria-expanded={devOpen}>
                  <Text style={styles.cardTitleSmall}>Sviluppo: token manuale o demo</Text>
                  <ChevronRight size={18} color={colors.textSecondary} style={{ transform: [{ rotate: devOpen ? '90deg' : '0deg' }] }} />
                </TouchableOpacity>
                {devOpen && (
                  <>
                    <Text style={styles.muted}>Visibile solo nelle build di sviluppo. Il token &quot;demo&quot; funziona solo con l&apos;emulatore.</Text>
                    <TextInput
                      style={styles.input}
                      value={devToken}
                      onChangeText={setDevToken}
                      placeholder="Token o demo"
                      placeholderTextColor={colors.textSecondary}
                      secureTextEntry
                      autoCapitalize="none"
                      accessibilityLabel="Token di sviluppo"
                    />
                    <TouchableOpacity style={styles.secondaryButtonWide} onPress={testDev} disabled={devTesting || !devToken.trim()} accessibilityRole="button">
                      {devTesting ? <ActivityIndicator color={colors.text} /> : <Text style={styles.secondaryButtonText}>Verifica e collega</Text>}
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}
          </>
        ) : (
          /* ===== Collegato (o sessione scaduta) ===== */
          <>
            <View style={[styles.card, isExpired && styles.cardWarning]}>
              <View style={styles.rowCenter}>
                {isExpired
                  ? <AlertCircle size={20} color={colors.warning} style={{ marginRight: 8 }} />
                  : <CheckCircle2 size={20} color={colors.scalable} style={{ marginRight: 8 }} />}
                <Text style={styles.cardTitle} accessibilityRole="header">{isExpired ? 'Sessione scaduta' : 'Conto collegato'}</Text>
              </View>
              <Text style={styles.body}>
                {isExpired
                  ? 'Scalable ha chiuso la sessione. Ricollega il conto con un nuovo codice: transazioni, piani e preferenze restano dove sono.'
                  : lastSync ? `Ultima sincronizzazione ${lastSync}.` : 'Nessuna sincronizzazione ancora completata.'}
              </Text>
              {isExpired ? (
                <>
                  <TouchableOpacity style={styles.primaryButton} onPress={startConnection} disabled={starting} accessibilityRole="button">
                    {starting ? <ActivityIndicator color={colors.background} /> : <Text style={styles.primaryButtonText}>Ricollega il conto</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.textButton} onPress={renewSession} disabled={renewing} accessibilityRole="button">
                    {renewing ? <ActivityIndicator color={colors.text} /> : <Text style={styles.textButtonLabel}>Prova a rinnovare la sessione</Text>}
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity style={styles.primaryButton} onPress={syncNow} disabled={syncing} accessibilityRole="button" aria-busy={syncing}>
                  {syncing ? <ActivityIndicator color={colors.background} /> : (
                    <>
                      <RefreshCw size={16} color={colors.background} style={{ marginRight: 8 }} />
                      <Text style={styles.primaryButtonText}>Sincronizza ora</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
              <View style={[styles.rowBetween, styles.settingRow]}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={styles.settingTitle}>Sincronizza all&apos;apertura</Text>
                  <Text style={styles.muted}>Aggiorna transazioni e liquidità quando apri la panoramica.</Text>
                </View>
                <Switch
                  {...switchProps(config?.autoSync ?? true)}
                  onValueChange={v => savePref({ autoSync: v })}
                  accessibilityLabel="Sincronizza all'apertura"
                  aria-checked={config?.autoSync ?? true}
                />
              </View>
            </View>

            {/* Liquidità */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Liquidità</Text>
              <View style={styles.rowBetween}>
                <Text style={styles.muted}>Saldo all&apos;ultima sincronizzazione</Text>
                <Text style={styles.value}>{cash !== null ? eur(cash) : 'n/d'}</Text>
              </View>
              <View style={[styles.rowBetween, styles.settingRow]}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={styles.settingTitle}>Includi nel bilancio</Text>
                  <Text style={styles.muted}>Somma la liquidità al valore dei titoli nella panoramica e nei pesi.</Text>
                </View>
                <Switch
                  {...switchProps(config?.includeCashInTotal ?? false)}
                  onValueChange={v => savePref({ includeCashInTotal: v })}
                  accessibilityLabel="Includi la liquidità nel bilancio"
                  aria-checked={config?.includeCashInTotal ?? false}
                />
              </View>

              <Text style={[styles.settingTitle, { marginTop: 16 }]}>Tasso che ricevi</Text>
              <View style={styles.chips} accessibilityRole="radiogroup" aria-label="Piano di interessi">
                {(Object.keys(SCALABLE_INTEREST_PLANS) as ScalableInterestPlanId[]).map(id => {
                  const p = SCALABLE_INTEREST_PLANS[id];
                  const selected = plan === id;
                  return (
                    <TouchableOpacity key={id} style={[styles.chip, selected && styles.chipActive]} onPress={() => choosePlan(id)} accessibilityRole="radio" aria-checked={selected}>
                      <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                        {p.label}{id !== 'custom' ? ` ${formatNumber(p.rate)}%` : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={styles.rateRow}>
                <TextInput
                  style={[styles.input, styles.rateInput, rateError && { borderColor: colors.negative }]}
                  value={rateInput}
                  onChangeText={v => { setRateInput(v); setPlan('custom'); setRateError(null); }}
                  keyboardType="decimal-pad"
                  placeholder="es. 2,6"
                  placeholderTextColor={colors.textSecondary}
                  accessibilityLabel="Tasso annuo lordo in percentuale"
                  aria-invalid={!!rateError}
                />
                <Text style={styles.rateUnit}>% annuo lordo</Text>
              </View>
              {rateError ? <Text style={styles.errorText}>{rateError}</Text> : (
                <Text style={styles.muted}>I valori dei piani sono gli ultimi noti all&apos;app e possono cambiare: verifica il tasso nell&apos;app Scalable.</Text>
              )}
              {yieldEst && rateValue > 0 && (
                <Text style={[styles.body, { marginTop: 8 }]}>
                  Stima: circa {eur(yieldEst.annualNet)} l&apos;anno netti ({eur(yieldEst.monthlyNet)} al mese), dopo l&apos;imposta del 26%
                  {cap !== null && cash !== null && cash > cap ? `, calcolati sui primi ${eur(cap)}` : ''}.
                </Text>
              )}
              {rateDirty && (
                <TouchableOpacity style={styles.secondaryButtonWide} onPress={saveRate} accessibilityRole="button">
                  <Text style={styles.secondaryButtonText}>Salva tasso</Text>
                </TouchableOpacity>
              )}
              {rateSaved && <Text style={styles.muted} accessibilityLiveRegion="polite">Tasso salvato.</Text>}
            </View>

            {/* Piani di accumulo */}
            {plans.length > 0 && (
              <View style={styles.card}>
                <View style={styles.rowBetween}>
                  <Text style={styles.cardTitle}>Piani di accumulo</Text>
                  <Text style={styles.value}>{eur(monthlyTotal)} al mese</Text>
                </View>
                <Text style={styles.muted}>Totale dei soli piani attivi, con ogni frequenza riportata al mese.</Text>
                {plans.map(p => (
                  <View key={p.id} style={styles.listRow}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.listTitle} numberOfLines={2}>{p.name}</Text>
                      <Text style={styles.muted}>
                        {frequencyLabel(p.frequency)}{p.dayOfMonth ? `, giorno ${p.dayOfMonth}` : ''}
                        {p.status === 'ACTIVE' && p.nextExecutionDate ? ` · prossimo ${formatDate(p.nextExecutionDate)}` : ''}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.value}>{eur(p.amount)}</Text>
                      {p.status !== 'ACTIVE' && <Text style={styles.muted}>{p.status === 'PAUSED' ? 'Sospeso' : 'Non attivo'}</Text>}
                    </View>
                  </View>
                ))}
                <TouchableOpacity style={styles.linkRow} onPress={() => router.push('/pac-calculator' as never)} accessibilityRole="link">
                  <Text style={styles.linkText}>Apri nel simulatore PAC</Text>
                  <ChevronRight size={16} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            )}

            {/* Avvisi di prezzo */}
            {alerts.length > 0 && (
              <View style={styles.card}>
                <View style={styles.rowBetween}>
                  <Text style={styles.cardTitle}>Avvisi di prezzo</Text>
                  <TouchableOpacity style={styles.iconButton} onPress={refreshAlerts} disabled={refreshingAlerts} accessibilityRole="button" accessibilityLabel="Aggiorna gli avvisi da Scalable">
                    {refreshingAlerts ? <ActivityIndicator size="small" color={colors.textSecondary} /> : <RefreshCw size={18} color={colors.text} />}
                  </TouchableOpacity>
                </View>
                {evaluatedAlerts.map(({ alert, calculation }) => (
                  <View key={alert.id} style={styles.listRow}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.listTitle} numberOfLines={2}>{alert.name || alert.symbol}</Text>
                      <Text style={styles.muted}>{calculation.directionLabel} {calculation.targetPriceFormatted} · ora {calculation.currentPriceFormatted}</Text>
                      <Text style={[styles.muted, calculation.statusBadge === 'triggered' && { color: colors.warning }]}>{calculation.distanceDescription}</Text>
                      {alert.note ? <Text style={styles.muted}>{alert.note}</Text> : null}
                    </View>
                    <Text style={[styles.status, calculation.statusBadge === 'triggered' && { color: colors.warning }, calculation.statusBadge === 'approaching' && { color: colors.scalable }]}>
                      {calculation.statusLabel}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Zainetto */}
            <TouchableOpacity style={[styles.card, styles.rowBetween]} onPress={() => router.push('/tax-report')} accessibilityRole="link">
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Zainetto fiscale</Text>
                <Text style={styles.muted}>
                  {taxReport && taxReport.totalActiveLosses > 0
                    ? `${eur(taxReport.totalActiveLosses)} di minusvalenze disponibili (stima)`
                    : taxReport ? 'Nessuna minusvalenza disponibile (stima)' : 'Nessuna vendita Scalable registrata'}
                </Text>
              </View>
              <ChevronRight size={18} color={colors.textSecondary} />
            </TouchableOpacity>

            {/* Gestione della connessione */}
            <View style={styles.card}>
              <View style={styles.rowCenter}>
                <Lock size={16} color={colors.textSecondary} style={{ marginRight: 8 }} />
                <Text style={styles.settingTitle}>Come trattiamo l&apos;accesso</Text>
              </View>
              <Text style={styles.muted}>
                Le chiavi di accesso a Scalable restano sui nostri server e non arrivano mai sul tuo dispositivo. L&apos;app le usa solo per leggere i dati del conto.
              </Text>
              <TouchableOpacity style={styles.dangerButton} onPress={() => setConfirmDisconnect(true)} accessibilityRole="button">
                <Text style={styles.dangerButtonText}>Scollega il conto</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>

      <Modal visible={confirmDisconnect} transparent animationType="fade" onRequestClose={() => setConfirmDisconnect(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard} accessibilityViewIsModal>
            <Text style={styles.cardTitle} accessibilityRole="header">Scollegare il conto Scalable?</Text>
            <Text style={styles.body}>Verranno rimossi: l&apos;accesso al conto (con richiesta di revoca a Scalable), i piani di accumulo, gli avvisi di prezzo e la liquidità sincronizzata.</Text>
            <Text style={styles.body}>Restano: le transazioni già importate e il tasso che hai impostato.</Text>
            <View style={styles.buttonRow}>
              <TouchableOpacity style={[styles.secondaryButton, { flex: 1 }]} onPress={() => setConfirmDisconnect(false)} disabled={disconnecting} accessibilityRole="button">
                <Text style={styles.secondaryButtonText}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.dangerButton, { flex: 1, marginTop: 0 }]} onPress={doDisconnect} disabled={disconnecting} accessibilityRole="button" aria-busy={disconnecting}>
                {disconnecting ? <ActivityIndicator color={colors.negative} /> : <Text style={styles.dangerButtonText}>Scollega</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  content: { padding: 16, paddingBottom: 48 },
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 16, marginBottom: 16 },
  cardWarning: { backgroundColor: colors.warningSurface },
  cardTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 6 },
  cardTitleSmall: { fontSize: 15, fontWeight: '600', color: colors.text },
  sectionLabel: { fontSize: 14, fontWeight: '600', color: colors.text, marginTop: 16, marginBottom: 8 },
  body: { fontSize: 15, lineHeight: 21, color: colors.text, marginBottom: 8 },
  muted: { fontSize: 13, lineHeight: 18, color: colors.textSecondary, marginTop: 2 },
  value: { fontSize: 15, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  status: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginLeft: 12 },
  errorText: { fontSize: 13, lineHeight: 18, color: colors.negative, marginTop: 4 },
  rowCenter: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  settingRow: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.border },
  settingTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  step: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.inputBackground,
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 24,
    marginRight: 10,
    overflow: 'hidden',
  },
  stepText: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.text },
  primaryButton: {
    flexDirection: 'row',
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    paddingHorizontal: 20,
  },
  primaryButtonText: { fontSize: 16, fontWeight: '600', color: colors.background },
  secondaryButton: {
    flexDirection: 'row',
    height: 50,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  secondaryButtonWide: {
    height: 50,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  secondaryButtonText: { fontSize: 15, fontWeight: '600', color: colors.text },
  textButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  textButtonLabel: { fontSize: 15, fontWeight: '600', color: colors.text, textDecorationLine: 'underline' },
  // Azione distruttiva: contorno rosso, mai riempimento (vedi DESIGN.md)
  dangerButton: {
    height: 50,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: colors.negative,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  dangerButtonText: { fontSize: 15, fontWeight: '600', color: colors.negative },
  buttonRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  codeBox: { backgroundColor: colors.inputBackground, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  codeLabel: { fontSize: 13, color: colors.textSecondary, marginBottom: 6 },
  code: { fontSize: 30, fontWeight: '700', color: colors.scalable, letterSpacing: 3, fontVariant: ['tabular-nums'] },
  notice: { flexDirection: 'row', alignItems: 'flex-start', borderRadius: 12, padding: 12, marginBottom: 16 },
  noticeError: { backgroundColor: colors.negativeSurface },
  noticeSuccess: { backgroundColor: colors.scalableSurface },
  noticeInfo: { backgroundColor: colors.card },
  noticeIcon: { marginRight: 8, marginTop: 2 },
  noticeText: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.text },
  input: {
    height: 50,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBackground,
    paddingHorizontal: 14,
    color: colors.text,
    fontSize: 16,
    marginTop: 12,
  },
  rateRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  rateInput: { width: 110, marginTop: 0 },
  rateUnit: { fontSize: 15, color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  // Selezione neutra: il teal resta per i dati di Scalable, non per la scelta dell'utente
  chip: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
  },
  chipActive: { borderColor: colors.text, backgroundColor: withAlpha(colors.text, 0.1) },
  chipText: { fontSize: 14, fontWeight: '500', color: colors.textSecondary },
  chipTextActive: { color: colors.text, fontWeight: '600' },
  listRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border, marginTop: 8 },
  listTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  linkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, marginTop: 8 },
  linkText: { fontSize: 15, fontWeight: '600', color: colors.text },
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: colors.card, borderRadius: 16, padding: 20, maxWidth: 420, width: '100%', alignSelf: 'center' },
});
