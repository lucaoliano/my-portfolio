import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  TextInput, 
  ScrollView, 
  Switch, 
  ActivityIndicator, 
  Alert, 
  Platform,
  Linking,
  Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { 
  ArrowLeft, 
  CheckCircle2, 
  AlertCircle, 
  ShieldCheck, 
  Eye, 
  EyeOff, 
  Clipboard as ClipboardIcon, 
  RefreshCw, 
  Trash2,
  Cpu,
  Lock,
  Download,
  Check,
  Coins,
  Wallet,
  Info,
  Calculator,
  Sliders,
  Bell,
  TrendingDown,
  TrendingUp,
  Receipt,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  Smartphone
} from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { useAppTheme } from '../../theme/ThemeContext';
import { ThemeColors, withAlpha } from '../../theme/colors';
import { auth } from '../../config/firebase';
import { 
  DEFAULT_SCALABLE_MCP_URL, 
  testScalableMcpConnection, 
  saveScalableConfig, 
  disconnectScalable, 
  getScalableConfig,
  syncScalablePortfolio,
  refreshScalableSession,
  subscribeScalableConfig,
  startScalableDeviceAuth,
  pollScalableDeviceAuth,
  ScalableDeviceAuthSession,
  completeScalableOAuth
} from '../../services/scalableMcp';
import { formatNumber } from '../../utils/formatters';
import { ScalableMcpConfig } from '../../types';
import { useScalableSavingsPlans } from '../../hooks/useScalableSavingsPlans';
import { useScalablePriceAlerts } from '../../hooks/useScalablePriceAlerts';
import { useTransactions } from '../../hooks/useTransactions';
import { useScalableTaxReport } from '../../hooks/useScalableTaxReport';
import { calculateAlertStatus } from '../../utils/priceAlerts';
import { getQuotes, YahooQuote } from '../../services/yahooFinance';
import { 
  calculateCashYield, 
  SCALABLE_INTEREST_PLANS, 
  ScalableInterestPlanId 
} from '../../utils/cashInterest';

export default function ScalableMcpSetupScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = getStyles(colors);

  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [serverUrl, setServerUrl] = useState(DEFAULT_SCALABLE_MCP_URL);
  const [apiToken, setApiToken] = useState('');
  const [readOnly, setReadOnly] = useState(true);
  const [autoSync, setAutoSync] = useState(true);
  const [showToken, setShowToken] = useState(false);
  const [currentConfig, setCurrentConfig] = useState<ScalableMcpConfig | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [showManualConfig, setShowManualConfig] = useState(false);

  // Scalable Device Code Flow state (RFC 8628 - Consumer Friendly & No Localhost)
  const [deviceSession, setDeviceSession] = useState<ScalableDeviceAuthSession | null>(null);
  const [pollingDevice, setPollingDevice] = useState(false);
  const [isWaiting2fa, setIsWaiting2fa] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [refreshingSession, setRefreshingSession] = useState(false);
  const pollTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  // Clear poll timer on unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, []);

  const { code, state: oauthState } = useLocalSearchParams<{ code?: string; state?: string }>();

  const userId = auth.currentUser?.uid;
  const { plans: savingsPlans, totalMonthlyAmount: savingsTotalMonthly } = useScalableSavingsPlans(userId);
  const { alerts: priceAlerts, refreshing: refreshingAlerts, refreshAlerts } = useScalablePriceAlerts(userId);
  const { transactions } = useTransactions(userId);
  const { taxReport } = useScalableTaxReport(userId, transactions);
  const [alertQuotes, setAlertQuotes] = useState<Record<string, YahooQuote>>({});

  // Punto 2: Cash & Yield Tracker State
  const [interestPlan, setInterestPlan] = useState<ScalableInterestPlanId>('prime');
  const [interestRate, setInterestRate] = useState<number>(2.6);
  const [customRateInput, setCustomRateInput] = useState<string>('2.6');
  const [includeCashInTotal, setIncludeCashInTotal] = useState<boolean>(false);
  const [savingCashConfig, setSavingCashConfig] = useState<boolean>(false);
  const [cashSavedFeedback, setCashSavedFeedback] = useState<string | null>(null);

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  useEffect(() => {
    const currentUserId = auth.currentUser?.uid;
    if (!currentUserId) {
      const timeoutId = setTimeout(() => setLoading(false), 0);
      return () => clearTimeout(timeoutId);
    }

    const unsubscribe = subscribeScalableConfig(currentUserId, (cfg) => {
      if (cfg) {
        setCurrentConfig(cfg);
        setServerUrl(cfg.serverUrl || DEFAULT_SCALABLE_MCP_URL);
        setReadOnly(cfg.readOnly ?? true);
        setAutoSync(cfg.autoSync ?? true);
        setInterestPlan((cfg.interestPlan as ScalableInterestPlanId) || 'prime');
        setInterestRate(cfg.interestRate ?? 2.6);
        setCustomRateInput((cfg.interestRate ?? 2.6).toString());
        setIncludeCashInTotal(cfg.includeCashInTotal ?? false);
      } else {
        setCurrentConfig(null);
      }
      setLoading(false);
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const handleRenewSession = async () => {
    setRefreshingSession(true);
    try {
      await refreshScalableSession();
      showAlert('Sessione Rinnovata', 'La sessione con Scalable Capital è stata rinnovata con successo.');
    } catch (err: unknown) {
      const error = err as Error;
      showAlert('Errore Rinnovo', error.message || 'Impossibile rinnovare la sessione.');
    } finally {
      setRefreshingSession(false);
    }
  };

  // Handle OAuth Callback from Scalable Capital
  useEffect(() => {
    if (!code) return;

    let isMounted = true;
    const handleOAuthCallback = async () => {
      setSyncing(true);
      setStatusMessage({ text: 'Autenticazione con Scalable Capital in corso...', isError: false });
      try {
        await completeScalableOAuth(code, oauthState || '');
        if (isMounted) {
          setShowSuccessModal(true);
          const currentUserId = auth.currentUser?.uid;
          if (currentUserId) {
            const updated = await getScalableConfig(currentUserId);
            setCurrentConfig(updated);
          }
          await syncScalablePortfolio();
          router.replace('/integrations/scalable');
        }
      } catch (err: unknown) {
        const e = err as Error;
        console.error('OAuth callback error:', e);
        if (isMounted) {
          setStatusMessage({ text: `Errore durante il collegamento OAuth: ${e.message}`, isError: true });
        }
      } finally {
        if (isMounted) setSyncing(false);
      }
    };

    handleOAuthCallback();

    return () => {
      isMounted = false;
    };
  }, [code, oauthState, router]);

  // Fetch live market quotes for price alerts
  useEffect(() => {
    if (!priceAlerts || priceAlerts.length === 0) return;
    const symbols = Array.from(new Set(priceAlerts.map(a => a.symbol)));
    getQuotes(symbols).then(quotes => {
      const map: Record<string, YahooQuote> = {};
      quotes.forEach(q => { map[q.symbol] = q; });
      setAlertQuotes(map);
    }).catch(e => console.warn('Could not fetch alert quotes:', e));
  }, [priceAlerts]);

  const handleStartDeviceAuth = async () => {
    setTesting(true);
    setStatusMessage(null);
    try {
      const session = await startScalableDeviceAuth();
      setDeviceSession(session);
      setTesting(false);
      setPollingDevice(true);

      // Open Scalable Capital activation URL in new window/tab
      if (typeof window !== 'undefined' && window.open) {
        window.open(session.verificationUriComplete, '_blank');
      } else {
        Linking.openURL(session.verificationUriComplete).catch(() => {});
      }

      // Start polling for authorization
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      const intervalMs = Math.max(session.interval || 5, 5) * 1000;
      pollTimerRef.current = setInterval(async () => {
        try {
          const pollRes = await pollScalableDeviceAuth();
          if (pollRes.status === 'authorized') {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            setPollingDevice(false);
            setDeviceSession(null);
            setIsWaiting2fa(false);
            setShowSuccessModal(true);
            const currentUserId = auth.currentUser?.uid;
            if (currentUserId) {
              const updated = await getScalableConfig(currentUserId);
              setCurrentConfig(updated);
            }
            try {
              await syncScalablePortfolio();
            } catch (syncErr) {
              console.warn('Initial sync error:', syncErr);
            }
          } else if (pollRes.status === '2fa_pending') {
            setIsWaiting2fa(true);
            setStatusMessage({
              text: pollRes.message || '📱 Notifica 2FA inviata! Apri l\'app Scalable Capital sul tuo smartphone e tocca "Conferma".',
              isError: false,
            });
          } else if (pollRes.status === 'expired' || pollRes.status === 'denied') {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            setPollingDevice(false);
            setDeviceSession(null);
            setIsWaiting2fa(false);
            setStatusMessage({ text: pollRes.message || 'Sessione terminata o negata.', isError: true });
          }
        } catch (pollErr: unknown) {
          console.warn('Poll error:', pollErr);
        }
      }, intervalMs);
    } catch (err: unknown) {
      const e = err as Error;
      setTesting(false);
      setStatusMessage({ text: e.message || 'Impossibile avviare la procedura di connessione con Scalable Capital.', isError: true });
    }
  };

  const handleCancelDeviceAuth = () => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    setPollingDevice(false);
    setDeviceSession(null);
    setIsWaiting2fa(false);
    setStatusMessage(null);
  };

  const handleCopyCode = async () => {
    if (!deviceSession?.userCode) return;
    await Clipboard.setStringAsync(deviceSession.userCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handlePasteToken = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (text) {
        setApiToken(text.trim());
      }
    } catch (e) {
      console.error('Error pasting from clipboard:', e);
    }
  };

  const handleTestAndSave = async () => {
    const userId = auth.currentUser?.uid;
    if (!userId) {
      showAlert('Errore', 'Devi aver effettuato l\'accesso per salvare le impostazioni.');
      return;
    }

    if (!apiToken.trim() && !currentConfig?.hasApiToken) {
      setStatusMessage({ text: 'Inserisci il token di autorizzazione generato da Scalable Capital.', isError: true });
      return;
    }

    setTesting(true);
    setStatusMessage(null);

    try {
      const result = await testScalableMcpConnection(serverUrl, apiToken);

      if (result.success) {
        const now = new Date().toISOString();
        const newConfig: ScalableMcpConfig = {
          enabled: true,
          serverUrl: serverUrl.trim(),
          readOnly,
          autoSync,
          status: 'connected',
          lastTestedAt: now,
        };

        // Il token è già stato salvato lato server da testScalableMcp
        await saveScalableConfig(userId, newConfig);
        setCurrentConfig({ ...newConfig, hasApiToken: true });
        setApiToken('');
        setStatusMessage({
          text: result.message || 'Connessione verificata e salvata con successo!',
          isError: false
        });
        showAlert('Connessione Riuscita', 'Il server MCP di Scalable Capital è stato collegato con successo al tuo portafoglio!');
      } else {
        const now = new Date().toISOString();
        const errConfig: Partial<ScalableMcpConfig> = {
          enabled: false,
          serverUrl: serverUrl.trim(),
          status: 'error',
          lastTestedAt: now,
          errorMessage: result.message
        };
        await saveScalableConfig(userId, errConfig);
        setStatusMessage({ text: result.message, isError: true });
      }
    } catch (err: unknown) {
      const error = err as Error;
      setStatusMessage({ text: `Errore imprevisto: ${error.message}`, isError: true });
    } finally {
      setTesting(false);
    }
  };

  const handleSyncPortfolio = async () => {
    const userId = auth.currentUser?.uid;
    if (!userId) {
      showAlert('Errore', 'Devi aver effettuato l\'accesso per sincronizzare.');
      return;
    }

    setSyncing(true);
    setSyncFeedback(null);

    try {
      const res = await syncScalablePortfolio({ targetGroup: 'Scalable' });
      const dedupMsg = res.deduplicatedCount ? `, ${res.deduplicatedCount} duplicati unificati` : '';
      const feedback = `Sincronizzazione completata: ${res.importedCount} nuove transazioni (${res.updatedCount} collegate al conto${dedupMsg}). Liquidità: €${formatNumber(res.cashBalance || 0)}.`;
      setSyncFeedback(feedback);
      showAlert('Sincronizzazione Riuscita', feedback);

      const updated = await getScalableConfig(userId);
      if (updated) {
        setCurrentConfig(updated);
      }
    } catch (err: unknown) {
      const error = err as Error;
      const msg = error.message || '';
      if (
        msg.toLowerCase().includes('missing or invalid credentials') ||
        msg.toLowerCase().includes('scaduta') ||
        msg.toLowerCase().includes('unauthenticated') ||
        msg.toLowerCase().includes('token refresh fallito')
      ) {
        setStatusMessage({
          text: 'La sessione Scalable Capital è scaduta. Tocca "Disconnetti" in alto per ripulire la sessione e ricollegare il conto.',
          isError: true,
        });
        showAlert(
          'Sessione Scalable Scaduta',
          'La sessione di Scalable Capital è scaduta o non valida. Clicca su "Disconnetti" in alto a destra per ripulire la sessione e poi tocca "Collega Scalable Capital" per ricollegare il conto in 1 clic.'
        );
      } else {
        setStatusMessage({ text: msg || 'Impossibile completare la sincronizzazione.', isError: true });
        showAlert('Errore Sincronizzazione', msg || 'Impossibile completare la sincronizzazione.');
      }
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = () => {
    setShowDisconnectModal(true);
  };

  const handleConfirmDisconnect = async () => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    setDisconnecting(true);
    try {
      await disconnectScalable(userId);
      setCurrentConfig(null);
      setApiToken('');
      setDeviceSession(null);
      setStatusMessage({ text: 'Integrazione Scalable Capital disconnessa con successo.', isError: false });
      setShowDisconnectModal(false);
    } catch (e) {
      console.error('Error disconnecting:', e);
      // Fail-safe: clear local state so the user is never blocked from re-connecting
      setCurrentConfig(null);
      setApiToken('');
      setDeviceSession(null);
      setShowDisconnectModal(false);
      setStatusMessage({ text: 'Sessione reimpostata.', isError: false });
    } finally {
      setDisconnecting(false);
    }
  };

  const handleSaveCashConfig = async () => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    setSavingCashConfig(true);
    try {
      const parsedRate = interestPlan === 'custom' 
        ? Math.max(0, parseFloat(customRateInput.replace(',', '.')) || 0)
        : interestRate;

      await saveScalableConfig(userId, {
        interestPlan,
        interestRate: parsedRate,
        includeCashInTotal
      });

      const updated = await getScalableConfig(userId);
      if (updated) setCurrentConfig(updated);
      setCashSavedFeedback('Parametri di liquidità e rendimento salvati!');
      setTimeout(() => setCashSavedFeedback(null), 3000);
    } catch (e) {
      console.error('Error saving cash config:', e);
      showAlert('Errore', 'Impossibile salvare le impostazioni di liquidità.');
    } finally {
      setSavingCashConfig(false);
    }
  };

  const effectiveRate = interestPlan === 'custom'
    ? Math.max(0, parseFloat(customRateInput.replace(',', '.')) || 0)
    : interestRate;

  const yieldEst = calculateCashYield(currentConfig?.cashBalance || 0, effectiveRate);

  const isConnected = !!currentConfig?.enabled && currentConfig?.status === 'connected';
  const isSessionExpired = currentConfig?.status === 'expired' || (currentConfig?.status === 'error' && !!currentConfig?.errorMessage);
  const hasConfig = !!currentConfig && (!!currentConfig.hasApiToken || currentConfig.enabled || currentConfig.status !== 'disconnected');

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.scalable} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => router.canGoBack() ? router.back() : router.replace('/integrations')}
        >
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Scalable Capital MCP</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Status Banner */}
        <View style={[
          styles.statusCard, 
          isConnected 
            ? styles.statusCardConnected 
            : isSessionExpired 
              ? { borderColor: withAlpha(colors.warning, 0.376), backgroundColor: withAlpha(colors.warning, 0.063) } 
              : styles.statusCardDisconnected
        ]}>
          <View style={styles.statusHeaderRow}>
            <View style={[
              styles.iconBadge, 
              { 
                backgroundColor: isConnected 
                  ? withAlpha(colors.scalable, 0.125) 
                  : isSessionExpired 
                    ? withAlpha(colors.warning, 0.125) 
                    : colors.inputBackground 
              }
            ]}>
              {isSessionExpired ? (
                <AlertCircle size={22} color={colors.warning} />
              ) : (
                <Cpu size={22} color={isConnected ? colors.scalable : colors.textSecondary} />
              )}
            </View>
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={styles.statusCardTitle}>
                {isConnected 
                  ? 'Integrazione Connessa ed Attiva' 
                  : isSessionExpired 
                    ? 'Sessione Scalable Scaduta' 
                    : 'Integrazione Non Connessa'}
              </Text>
              <Text style={styles.statusCardSubtitle}>
                {isConnected 
                  ? `Ultimo test: ${currentConfig?.lastTestedAt ? new Date(currentConfig.lastTestedAt).toLocaleString('it-IT') : 'N/D'}` 
                  : isSessionExpired
                    ? (currentConfig?.hasRefreshToken 
                        ? 'La sessione di accesso è scaduta. Tocca "Rinnova" per riattivare la connessione senza effettuare il login.' 
                        : 'La sessione con Scalable è scaduta. Tocca "Disconnetti" a destra per ricollegare il conto.')
                    : 'Configura le credenziali MCP per attivare la sincronizzazione'}
              </Text>
            </View>
            {(isConnected || hasConfig || isSessionExpired) && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {isSessionExpired && !!currentConfig?.hasRefreshToken && (
                  <TouchableOpacity
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: withAlpha(colors.scalable, 0.082),
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: withAlpha(colors.scalable, 0.251),
                    }}
                    onPress={handleRenewSession}
                    disabled={refreshingSession}
                    activeOpacity={0.7}
                  >
                    {refreshingSession ? (
                      <ActivityIndicator size="small" color={colors.scalable} style={{ marginRight: 4 }} />
                    ) : (
                      <RefreshCw size={13} color={colors.scalable} style={{ marginRight: 4 }} />
                    )}
                    <Text style={{ color: colors.scalable, fontSize: 12, fontWeight: '600' }}>
                      {refreshingSession ? 'Rinnovo...' : 'Rinnova'}
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: withAlpha(colors.negative, 0.082),
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: withAlpha(colors.negative, 0.188),
                  }}
                  onPress={() => setShowDisconnectModal(true)}
                  activeOpacity={0.7}
                >
                  <Trash2 size={13} color={colors.negative} style={{ marginRight: 4 }} />
                  <Text style={{ color: colors.negative, fontSize: 12, fontWeight: '600' }}>Disconnetti</Text>
                </TouchableOpacity>
                {isConnected && <CheckCircle2 size={24} color={colors.scalable} />}
                {isSessionExpired && <AlertCircle size={24} color={colors.warning} />}
              </View>
            )}
          </View>
        </View>

        {/* Smart Sync Card (Punto 1: Riconciliazione Transazioni) */}
        {(isConnected || isSessionExpired) && (
          <View style={styles.syncCard}>
            <View style={styles.syncCardHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <View style={styles.syncIconContainer}>
                  <RefreshCw size={18} color={colors.scalable} />
                </View>
                <View style={{ marginLeft: 10, flex: 1 }}>
                  <Text style={styles.syncCardTitle}>Riconciliazione Portafoglio</Text>
                  <Text style={styles.syncCardSubtitle}>Import automatico transazioni, quote e liquidità</Text>
                </View>
              </View>
            </View>

            <View style={styles.syncDetailsBox}>
              <View style={styles.syncDetailRow}>
                <Text style={styles.syncDetailLabel}>Ultima sincronizzazione</Text>
                <Text style={styles.syncDetailValue}>
                  {currentConfig?.lastSyncedAt 
                    ? new Date(currentConfig.lastSyncedAt).toLocaleString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) 
                    : 'Nessuna'}
                </Text>
              </View>
              {currentConfig?.syncedTransactionsCount !== undefined && (
                <View style={styles.syncDetailRow}>
                  <Text style={styles.syncDetailLabel}>Transazioni gestite da Scalable</Text>
                  <Text style={styles.syncDetailValue}>
                    {currentConfig.syncedTransactionsCount} eseguiti
                  </Text>
                </View>
              )}
              {currentConfig?.cashBalance !== undefined && (
                <View style={[styles.syncDetailRow, { borderBottomWidth: 0 }]}>
                  <Text style={styles.syncDetailLabel}>Liquidità libera Scalable</Text>
                  <Text style={[styles.syncDetailValue, { color: colors.positive, fontWeight: '700' }]}>
                    €{formatNumber(currentConfig.cashBalance)}
                  </Text>
                </View>
              )}
            </View>

            {syncFeedback && (
              <View style={styles.syncFeedbackBanner}>
                <Check size={16} color={colors.positive} style={{ marginRight: 6 }} />
                <Text style={[styles.syncFeedbackText, { color: colors.positive }]}>
                  {syncFeedback}
                </Text>
              </View>
            )}

            <TouchableOpacity 
              style={[styles.syncActionButton, syncing && styles.buttonDisabled]} 
              onPress={handleSyncPortfolio}
              disabled={syncing}
            >
              {syncing ? (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <ActivityIndicator size="small" color={colors.onAccent} style={{ marginRight: 8 }} />
                  <Text style={styles.syncActionButtonText}>Sincronizzazione in corso...</Text>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Download size={18} color={colors.onAccent} style={{ marginRight: 8 }} />
                  <Text style={styles.syncActionButtonText}>Sincronizza Ora dal Broker</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Cash & Yield Tracker Card (Punto 2: Monitoraggio Liquidità Remunerata) */}
        {isConnected && (
          <View style={styles.yieldCard}>
            <View style={styles.yieldCardHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <View style={styles.yieldIconContainer}>
                  <Coins size={20} color={colors.scalable} />
                </View>
                <View style={{ marginLeft: 10, flex: 1 }}>
                  <Text style={styles.yieldCardTitle}>Liquidità Remunerata & Rendimento</Text>
                  <Text style={styles.yieldCardSubtitle}>Monitoraggio saldo libero e proiezione interessi</Text>
                </View>
              </View>
            </View>

            {/* Cash Balance Display Box */}
            <View style={styles.cashBalanceBox}>
              <Text style={styles.cashBalanceLabel}>Saldo Liquidità Scalable</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 4 }}>
                <Text style={styles.cashBalanceCurrency}>€</Text>
                <Text style={styles.cashBalanceAmount}>
                  {formatNumber(currentConfig?.cashBalance || 0)}
                </Text>
              </View>
              <Text style={styles.cashBalanceHint}>
                Rilevato automaticamente tramite tool MCP get_cash_balance
              </Text>
            </View>

            {/* Interest Plan Selection */}
            <Text style={styles.yieldSectionTitle}>Piano Interessi Applicato</Text>
            <View style={styles.planChipsContainer}>
              {(['prime', 'prime_plus', 'free', 'custom'] as ScalableInterestPlanId[]).map((planId) => {
                const plan = SCALABLE_INTEREST_PLANS[planId];
                const isSelected = interestPlan === planId;
                return (
                  <TouchableOpacity
                    key={planId}
                    style={[
                      styles.planChip,
                      isSelected && styles.planChipSelected,
                    ]}
                    onPress={() => {
                      setInterestPlan(planId);
                      if (planId !== 'custom') {
                        setInterestRate(plan.rate);
                        setCustomRateInput(plan.rate.toString());
                      }
                    }}
                  >
                    <Text style={[styles.planChipText, isSelected && styles.planChipTextSelected]}>
                      {plan.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Custom Rate Input if selected */}
            {interestPlan === 'custom' && (
              <View style={styles.customRateContainer}>
                <Text style={styles.customRateLabel}>Tasso nominale annuo (%):</Text>
                <View style={styles.customRateInputWrapper}>
                  <TextInput
                    style={styles.customRateInput}
                    value={customRateInput}
                    onChangeText={(val) => {
                      setCustomRateInput(val);
                      const parsed = parseFloat(val.replace(',', '.'));
                      if (!isNaN(parsed) && parsed >= 0) {
                        setInterestRate(parsed);
                      }
                    }}
                    placeholder="2.60"
                    placeholderTextColor={colors.textSecondary}
                    keyboardType="numeric"
                  />
                  <Text style={styles.percentSymbol}>%</Text>
                </View>
              </View>
            )}

            {/* Yield Projections Grid */}
            <View style={styles.projectionsGrid}>
              <View style={styles.projectionCard}>
                <Text style={styles.projectionLabel}>Annuo Netto (26%)</Text>
                <Text style={[styles.projectionValue, { color: colors.positive }]}>
                  +€{formatNumber(yieldEst.annualNet)}
                </Text>
                <Text style={styles.projectionSub}>Lordo: €{formatNumber(yieldEst.annualGross)}</Text>
              </View>

              <View style={styles.projectionCard}>
                <Text style={styles.projectionLabel}>Mensile Netto</Text>
                <Text style={[styles.projectionValue, { color: colors.positive }]}>
                  +€{formatNumber(yieldEst.monthlyNet)}
                </Text>
                <Text style={styles.projectionSub}>Lordo: €{formatNumber(yieldEst.monthlyGross)}</Text>
              </View>
            </View>

            <View style={styles.taxNoteRow}>
              <Info size={13} color={colors.textSecondary} style={{ marginRight: 5 }} />
              <Text style={styles.taxNoteText}>
                Stima calcolata con ritenuta fiscale del 26% (D.Lgs. 461/97) sul tasso del {formatNumber(effectiveRate)}% annuo.
              </Text>
            </View>

            {/* Toggle: Include in Total Net Worth */}
            <View style={styles.yieldSwitchRow}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Wallet size={16} color={colors.primary} style={{ marginRight: 6 }} />
                  <Text style={styles.switchLabel}>Includi nel Bilancio Totale</Text>
                </View>
                <Text style={styles.switchDescription}>
                  Somma la liquidità libera al valore degli investimenti nella dashboard del portafoglio.
                </Text>
              </View>
              <Switch
                value={includeCashInTotal}
                onValueChange={setIncludeCashInTotal}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={colors.onStrong}
              />
            </View>

            {cashSavedFeedback && (
              <View style={styles.syncFeedbackBanner}>
                <Check size={16} color={colors.positive} style={{ marginRight: 6 }} />
                <Text style={[styles.syncFeedbackText, { color: colors.positive }]}>
                  {cashSavedFeedback}
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.saveCashButton, savingCashConfig && styles.buttonDisabled]}
              onPress={handleSaveCashConfig}
              disabled={savingCashConfig}
            >
              {savingCashConfig ? (
                <ActivityIndicator size="small" color={colors.onAccent} />
              ) : (
                <Text style={styles.saveCashButtonText}>Salva Impostazioni Liquidità</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Savings Plans Card (Punto 3: Sinergia PAC) */}
        {isConnected && savingsPlans.length > 0 && (
          <View style={styles.savingsPlansCard}>
            <View style={styles.savingsPlansHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <View style={styles.savingsIconContainer}>
                  <Calculator size={20} color={colors.scalable} />
                </View>
                <View style={{ marginLeft: 10, flex: 1 }}>
                  <Text style={styles.savingsPlansTitle}>Piani di Accumulo (PAC Attivi)</Text>
                  <Text style={styles.savingsPlansSubtitle}>
                    {savingsPlans.length} PAC programmati • Totale: €{formatNumber(savingsTotalMonthly)}/mese
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.savingsPlansList}>
              {savingsPlans.map((plan) => (
                <View key={plan.id} style={styles.savingsPlanItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.savingsPlanSymbol}>{plan.symbol}</Text>
                    <Text style={styles.savingsPlanName} numberOfLines={1}>{plan.name}</Text>
                    <Text style={styles.savingsPlanCadence}>
                      Ogni mese (giorno {plan.dayOfMonth})
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.savingsPlanAmount}>€{formatNumber(plan.amount)}/mese</Text>
                    <View style={styles.savingsPlanBadge}>
                      <Text style={styles.savingsPlanBadgeText}>
                        {savingsTotalMonthly > 0 ? Math.round((plan.amount / savingsTotalMonthly) * 100) : 0}%
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={styles.openPacButton}
              onPress={() => router.push('/pac-calculator')}
            >
              <Sliders size={16} color={colors.onAccent} style={{ marginRight: 6 }} />
              <Text style={styles.openPacButtonText}>Apri nel PAC Calculator e Ribilancia</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Price Alerts Card (Punto 4: Price Alert Sincronizzati) */}
        {isConnected && priceAlerts.length > 0 && (
          <View style={styles.priceAlertsCard}>
            <View style={styles.priceAlertsHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <View style={styles.priceAlertsIconContainer}>
                  <Bell size={20} color={colors.scalable} />
                </View>
                <View style={{ marginLeft: 10, flex: 1 }}>
                  <Text style={styles.priceAlertsTitle}>Price Alert Sincronizzati</Text>
                  <Text style={styles.priceAlertsSubtitle}>
                    {priceAlerts.length} alert monitorati • Rilevamento automatico soglie
                  </Text>
                </View>
              </View>
              <TouchableOpacity 
                style={styles.refreshAlertsSmallButton}
                onPress={refreshAlerts}
                disabled={refreshingAlerts}
              >
                {refreshingAlerts ? (
                  <ActivityIndicator size="small" color={colors.scalable} />
                ) : (
                  <RefreshCw size={15} color={colors.scalable} />
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.priceAlertsList}>
              {priceAlerts.map((alert) => {
                const quote = alertQuotes[alert.symbol];
                const currentPrice = quote?.regularMarketPrice;
                const calc = calculateAlertStatus(alert, currentPrice);

                return (
                  <TouchableOpacity
                    key={alert.id}
                    style={styles.priceAlertItem}
                    onPress={() => router.push({
                      pathname: '/asset/[id]',
                      params: { id: alert.symbol, symbol: alert.symbol, name: alert.name }
                    })}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1, marginRight: 10 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={styles.priceAlertSymbol}>{alert.symbol}</Text>
                        <View style={[
                          styles.priceAlertStatusBadge,
                          calc.statusBadge === 'triggered' && styles.priceAlertStatusTriggered,
                          calc.statusBadge === 'approaching' && styles.priceAlertStatusApproaching,
                          calc.statusBadge === 'active' && styles.priceAlertStatusActive,
                        ]}>
                          <Text style={[
                            styles.priceAlertStatusText,
                            calc.statusBadge === 'triggered' && { color: colors.positive },
                            calc.statusBadge === 'approaching' && { color: colors.warning },
                            calc.statusBadge === 'active' && { color: colors.textSecondary },
                          ]}>
                            {calc.statusLabel}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.priceAlertName} numberOfLines={1}>{alert.name}</Text>
                      {alert.note && (
                        <Text style={styles.priceAlertNoteText} numberOfLines={1}>
                          {alert.note}
                        </Text>
                      )}
                    </View>

                    <View style={{ alignItems: 'flex-end' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        {alert.direction === 'BELOW' ? (
                          <TrendingDown size={14} color={colors.negative} style={{ marginRight: 4 }} />
                        ) : (
                          <TrendingUp size={14} color={colors.positive} style={{ marginRight: 4 }} />
                        )}
                        <Text style={styles.priceAlertTargetPrice}>
                          {calc.targetPriceFormatted}
                        </Text>
                      </View>
                      <Text style={[
                        styles.priceAlertDistance,
                        calc.isTriggered && { color: colors.positive, fontWeight: '700' }
                      ]}>
                        {calc.isTriggered ? 'Target raggiunto' : `Distanza ${calc.distanceFormatted}`}
                      </Text>
                      {currentPrice !== undefined && (
                        <Text style={styles.priceAlertCurrentPrice}>
                          Attuale: €{formatNumber(currentPrice)}
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Punto 6: Zainetto Fiscale e Report Minusvalenze Card */}
        {isConnected && (
          <View style={styles.taxReportCard}>
            <View style={styles.taxReportHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <View style={styles.taxReportIconContainer}>
                  <Receipt size={20} color={colors.primary} />
                </View>
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text style={styles.taxReportTitle}>Zainetto Fiscale & Minusvalenze</Text>
                  <Text style={styles.taxReportSubtitle}>
                    Scadenzario a 4 anni • Aliquota 26% • Compensazioni FIFO
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.taxReportMetricsRow}>
              <View style={styles.taxReportMetricCol}>
                <Text style={styles.taxReportMetricLabel}>Minusvalenze Attive</Text>
                <Text style={styles.taxReportMetricValue}>
                  €{formatNumber(taxReport?.totalActiveLosses || 0)}
                </Text>
              </View>

              <View style={styles.taxReportMetricCol}>
                <Text style={styles.taxReportMetricLabel}>Risparmio Fiscale (26%)</Text>
                <Text style={[styles.taxReportMetricValue, { color: colors.positive }]}>
                  €{formatNumber(taxReport?.potentialTaxSavings || 0)}
                </Text>
              </View>

              <View style={styles.taxReportMetricCol}>
                <Text style={styles.taxReportMetricLabel}>In Scadenza {new Date().getFullYear()}</Text>
                <Text
                  style={[
                    styles.taxReportMetricValue,
                    (taxReport?.lossesExpiringThisYear || 0) > 0 && { color: colors.warning },
                  ]}
                >
                  €{formatNumber(taxReport?.lossesExpiringThisYear || 0)}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.taxReportButton}
              onPress={() => router.push('/tax-report')}
              activeOpacity={0.8}
            >
              <Text style={styles.taxReportButtonText}>Apri Zainetto Fiscale Completo</Text>
              <ChevronRight size={16} color={colors.onAccent} />
            </TouchableOpacity>
          </View>
        )}

        {/* Pre-requisite Guide Card (Always visible when not connected) */}
        {!isConnected && (
          <View style={styles.guideCard}>
            <View style={styles.guideHeader}>
              <View style={styles.guideIconBadge}>
                <Info size={18} color={colors.scalable} />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.guideTitle}>Prima di iniziare: Abilita l&apos;accesso in Scalable</Text>
                <Text style={styles.guideSubtitle}>
                  Per autorizzare la connessione ed evitare l&apos;errore &quot;Attivazione negata&quot;:
                </Text>
              </View>
            </View>

            <View style={styles.guideStepsList}>
              <View style={styles.guideStepRow}>
                <View style={styles.guideStepNumber}>
                  <Text style={styles.guideStepNumberText}>1</Text>
                </View>
                <Text style={styles.guideStepText}>
                  Accedi a <Text style={{ fontWeight: '700', color: colors.text }}>scalable.capital</Text> dal browser del tuo computer.
                </Text>
              </View>

              <View style={styles.guideStepRow}>
                <View style={styles.guideStepNumber}>
                  <Text style={styles.guideStepNumberText}>2</Text>
                </View>
                <Text style={styles.guideStepText}>
                  Vai in <Text style={{ fontWeight: '700', color: colors.text }}>Profilo &gt; Sicurezza &gt; Agentic Investing</Text>.
                </Text>
              </View>

              <View style={styles.guideStepRow}>
                <View style={[styles.guideStepNumber, { backgroundColor: withAlpha(colors.scalable, 0.145), borderColor: colors.scalable }]}>
                  <Text style={[styles.guideStepNumberText, { color: colors.scalable }]}>3</Text>
                </View>
                <Text style={styles.guideStepText}>
                  Attiva l&apos;interruttore <Text style={{ fontWeight: '800', color: colors.scalable }}>Scalable CLI</Text> (Accesso esterno).
                </Text>
              </View>

              <View style={styles.guideStepRow}>
                <View style={styles.guideStepNumber}>
                  <Text style={styles.guideStepNumberText}>4</Text>
                </View>
                <Text style={styles.guideStepText}>
                  Torna qui, premi <Text style={{ fontWeight: '700', color: colors.text }}>Accedi con Scalable Capital</Text> e conferma il codice.
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Device Flow Activation Modal / Card */}
        {!isConnected && deviceSession && (
          <View style={styles.deviceAuthCard}>
            <View style={styles.deviceAuthHeader}>
              <View style={[styles.oauthBadge, { backgroundColor: colors.scalable }]}>
                <ShieldCheck size={22} color={colors.onAccent} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.oauthTitle}>Conferma Accesso su Scalable</Text>
                <Text style={styles.oauthSubtitle}>
                  Abbiamo aperto Scalable Capital in un&apos;altra scheda. Accedi e verifica che il codice corrisponda:
                </Text>
              </View>
            </View>

            {/* CLI Activation Reminder Box */}
            <View style={styles.cliReminderBox}>
              <AlertCircle size={16} color={colors.warning} style={{ marginRight: 8, marginTop: 1 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.cliReminderTitle}>Ricevi l&apos;errore &quot;Attivazione negata&quot;?</Text>
                <Text style={styles.cliReminderText}>
                  Verifica di aver attivato <Text style={{ fontWeight: '700', color: colors.text }}>Scalable CLI</Text> sul sito web di Scalable in <Text style={{ fontWeight: '600', color: colors.text }}>Profilo &gt; Sicurezza &gt; Agentic Investing</Text>.
                </Text>
              </View>
            </View>

            {/* Big User Code Display */}
            <View style={styles.userCodeBox}>
              <Text style={styles.userCodeLabel}>IL TUO CODICE DI VERIFICA</Text>
              <Text style={styles.userCodeValue}>{deviceSession.userCode}</Text>
              <TouchableOpacity
                style={styles.copyCodeButton}
                onPress={handleCopyCode}
                activeOpacity={0.7}
              >
                {copiedCode ? (
                  <>
                    <Check size={16} color={colors.positive} style={{ marginRight: 6 }} />
                    <Text style={[styles.copyCodeText, { color: colors.positive }]}>Codice Copiato!</Text>
                  </>
                ) : (
                  <>
                    <ClipboardIcon size={16} color={colors.primary} style={{ marginRight: 6 }} />
                    <Text style={styles.copyCodeText}>Copia Codice</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {/* Open Scalable Capital Action */}
            <TouchableOpacity
              style={styles.openScalableButton}
              onPress={() => {
                if (typeof window !== 'undefined' && window.open) {
                  window.open(deviceSession.verificationUriComplete, '_blank');
                } else {
                  Linking.openURL(deviceSession.verificationUriComplete).catch(() => {});
                }
              }}
              activeOpacity={0.8}
            >
              <ExternalLink size={18} color={colors.onAccent} style={{ marginRight: 8 }} />
              <Text style={styles.openScalableButtonText}>Apri Scalable Capital per Approvare</Text>
            </TouchableOpacity>

            {/* 2FA Smartphone Notification Box */}
            {isWaiting2fa && (
              <View style={{
                marginTop: 16,
                backgroundColor: withAlpha(colors.info, 0.094),
                borderColor: withAlpha(colors.info, 0.314),
                borderWidth: 1.5,
                borderRadius: 12,
                padding: 16,
                flexDirection: 'row',
                alignItems: 'center',
              }}>
                <Smartphone size={32} color={colors.info} style={{ marginRight: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700', marginBottom: 4 }}>
                    Passo 2: Notifica 2FA sul tuo Smartphone
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }}>
                    Scalable Capital ha inviato una notifica di sicurezza alla tua app mobile. Tocca <Text style={{ fontWeight: '700', color: colors.text }}>&quot;Conferma&quot;</Text> sullo smartphone per autorizzare l&apos;accesso ai tuoi dati.
                  </Text>
                </View>
              </View>
            )}

            {/* Polling Indicator */}
            <View style={styles.pollingRow}>
              <ActivityIndicator size="small" color={colors.scalable} style={{ marginRight: 10 }} />
              <Text style={styles.pollingText}>
                {isWaiting2fa
                  ? 'In attesa di approvazione 2FA sul tuo smartphone...'
                  : 'In attesa di approvazione dal tuo account Scalable...'}
              </Text>
            </View>

            {/* Cancel Button */}
            <TouchableOpacity
              style={styles.cancelDeviceButton}
              onPress={handleCancelDeviceAuth}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelDeviceButtonText}>Annulla Procedura</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 1-Click Connect Card (when not connecting or waiting) */}
        {!isConnected && !deviceSession && (
          <View style={styles.oauthCard}>
            <View style={styles.oauthHeader}>
              <View style={styles.oauthBadge}>
                <ShieldCheck size={22} color={colors.onAccent} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.oauthTitle}>Connetti Scalable Capital in 1 Clic</Text>
                <Text style={styles.oauthSubtitle}>
                  Nessun parametro tecnico o terminale. Accedi direttamente con le tue credenziali Scalable in totale sicurezza da qualsiasi dispositivo.
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.oauthMainBtn}
              onPress={handleStartDeviceAuth}
              disabled={testing || syncing || pollingDevice}
              activeOpacity={0.8}
            >
              {testing || syncing ? (
                <ActivityIndicator size="small" color={colors.onAccent} />
              ) : (
                <>
                  <ShieldCheck size={20} color={colors.onAccent} />
                  <Text style={styles.oauthMainBtnText}>Accedi con Scalable Capital</Text>
                </>
              )}
            </TouchableOpacity>

            <View style={styles.oauthBulletList}>
              <View style={styles.oauthBulletRow}>
                <Check size={14} color={colors.positive} />
                <Text style={styles.oauthBulletText}>Login ufficiale e sicuro sui server Scalable Capital</Text>
              </View>
              <View style={styles.oauthBulletRow}>
                <Check size={14} color={colors.positive} />
                <Text style={styles.oauthBulletText}>Autorizzazione protetta da notifica 2FA sul tuo smartphone</Text>
              </View>
              <View style={styles.oauthBulletRow}>
                <Check size={14} color={colors.positive} />
                <Text style={styles.oauthBulletText}>Accesso in sola lettura (impossibile effettuare ordini)</Text>
              </View>
              <View style={styles.oauthBulletRow}>
                <Check size={14} color={colors.positive} />
                <Text style={styles.oauthBulletText}>Sincronizzazione istantanea di titoli, PAC, liquidità e minusvalenze</Text>
              </View>
            </View>
          </View>
        )}

        {/* Toggle per Configurazione Manuale o Sandbox Demo */}
        {!isConnected && (
          <TouchableOpacity
            style={styles.advancedToggleBtn}
            onPress={() => setShowManualConfig(!showManualConfig)}
            activeOpacity={0.7}
          >
            <Text style={styles.advancedToggleText}>
              {showManualConfig ? "Nascondi opzioni manuali" : "Oppure: Modalità Sandbox di prova / Token manuale"}
            </Text>
            <ChevronDown
              size={16}
              color={colors.textSecondary}
              style={{ transform: [{ rotate: showManualConfig ? '180deg' : '0deg' }] }}
            />
          </TouchableOpacity>
        )}

        {/* Configuration Form (shown if connected OR if showManualConfig is true) */}
        {(isConnected || showManualConfig) && (
        <View style={styles.formCard}>
          <Text style={styles.formSectionTitle}>
            {isConnected ? "Impostazioni Connessione Attiva" : "Configurazione Manuale / Sandbox Demo"}
          </Text>

          {/* Server URL Input */}
          <Text style={styles.fieldLabel}>URL Server MCP</Text>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.textInput}
              value={serverUrl}
              onChangeText={setServerUrl}
              placeholder="https://mcp.scalable.capital/mcp"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* API Token Input */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
            <Text style={styles.fieldLabel}>Token di Autorizzazione (Bearer)</Text>
            <TouchableOpacity onPress={handlePasteToken} style={styles.pasteButton}>
              <ClipboardIcon size={14} color={colors.primary} style={{ marginRight: 4 }} />
              <Text style={styles.pasteButtonText}>Incolla</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.inputContainer}>
            <TextInput
              style={[styles.textInput, { paddingRight: 40 }]}
              value={apiToken}
              onChangeText={setApiToken}
              placeholder={currentConfig?.hasApiToken ? 'Token salvato · incollane uno nuovo per sostituirlo' : "Incolla qui il token o digita 'demo'"}
              placeholderTextColor={colors.textSecondary}
              secureTextEntry={!showToken}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity 
              style={styles.eyeButton} 
              onPress={() => setShowToken(!showToken)}
            >
              {showToken ? (
                <EyeOff size={20} color={colors.textSecondary} />
              ) : (
                <Eye size={20} color={colors.textSecondary} />
              )}
            </TouchableOpacity>
          </View>

          {/* Toggles */}
          <View style={styles.switchRow}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <ShieldCheck size={18} color={colors.positive} style={{ marginRight: 6 }} />
                <Text style={styles.switchLabel}>Modalità Sola Lettura (Consigliata)</Text>
              </View>
              <Text style={styles.switchDescription}>
                Blocca categoricamente ogni operazione di compravendita a livello locale. L&apos;app leggerà unicamente quote, liquidità e storico.
              </Text>
            </View>
            <Switch
              value={readOnly}
              onValueChange={setReadOnly}
              trackColor={{ false: colors.border, true: colors.positive }}
              thumbColor={colors.onStrong}
            />
          </View>

          <View style={[styles.switchRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 14 }]}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={styles.switchLabel}>Sincronizzazione Automatica all&apos;avvio</Text>
              <Text style={styles.switchDescription}>
                Aggiorna posizioni e liquidità in background ad ogni apertura del portafoglio.
              </Text>
            </View>
            <Switch
              value={autoSync}
              onValueChange={setAutoSync}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={colors.onStrong}
            />
          </View>

          {/* Status Message feedback */}
          {statusMessage && (
            <View style={[
              styles.messageBanner, 
              statusMessage.isError ? styles.messageBannerError : styles.messageBannerSuccess
            ]}>
              {statusMessage.isError ? (
                <AlertCircle size={18} color={colors.negative} style={{ marginRight: 8 }} />
              ) : (
                <CheckCircle2 size={18} color={colors.positive} style={{ marginRight: 8 }} />
              )}
              <Text style={[
                styles.messageText, 
                { color: statusMessage.isError ? colors.negative : colors.positive }
              ]}>
                {statusMessage.text}
              </Text>
            </View>
          )}

          {/* Action Button */}
          <TouchableOpacity
            style={[styles.primaryButton, testing && styles.buttonDisabled]}
            onPress={handleTestAndSave}
            disabled={testing}
          >
            {testing ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <ActivityIndicator size="small" color={colors.onAccent} style={{ marginRight: 8 }} />
                <Text style={styles.primaryButtonText}>Verifica connessione in corso...</Text>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <RefreshCw size={18} color={colors.onAccent} style={{ marginRight: 8 }} />
                <Text style={styles.primaryButtonText}>Verifica e Salva Connessione</Text>
              </View>
            )}
          </TouchableOpacity>

          {isConnected && (
            <TouchableOpacity
              style={styles.disconnectButton}
              onPress={handleDisconnect}
            >
              <Trash2 size={16} color={colors.negative} style={{ marginRight: 6 }} />
              <Text style={styles.disconnectButtonText}>Disconnetti Integrazione</Text>
            </TouchableOpacity>
          )}
        </View>
        )}

        {/* Security Notes */}
        <View style={styles.securityNoteCard}>
          <Lock size={18} color={colors.textSecondary} style={{ marginRight: 10, marginTop: 2 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.securityNoteTitle}>Come gestiamo i tuoi dati</Text>
            <Text style={styles.securityNoteText}>
              Il token viene salvato nel documento protetto delle impostazioni utente su Firebase con accesso riservato al tuo UID autenticato. Scalable Capital richiede comunque la conferma a due fattori per qualsiasi operazione transattiva.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Modern High-End Success Modal */}
      <Modal
        visible={showSuccessModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSuccessModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            {/* Glowing Icon */}
            <View style={styles.successIconGlow}>
              <View style={styles.successIconCircle}>
                <Check size={32} color={colors.onAccent} strokeWidth={3} />
              </View>
            </View>

            <Text style={styles.modalTitle}>Connessione Riuscita!</Text>
            <Text style={styles.modalSubtitle}>
              Il tuo conto Scalable Capital è stato collegato con successo in modalità sicura e protetta.
            </Text>

            {/* Features Synced Box */}
            <View style={styles.modalFeaturesBox}>
              <View style={styles.modalFeatureRow}>
                <CheckCircle2 size={16} color={colors.positive} />
                <Text style={styles.modalFeatureText}>Portafoglio e Transazioni sincronizzati</Text>
              </View>
              <View style={styles.modalFeatureRow}>
                <CheckCircle2 size={16} color={colors.positive} />
                <Text style={styles.modalFeatureText}>Piani di Accumulo (PAC) attivi collegati</Text>
              </View>
              <View style={styles.modalFeatureRow}>
                <CheckCircle2 size={16} color={colors.positive} />
                <Text style={styles.modalFeatureText}>Liquidità remunerata e tracker rendimento</Text>
              </View>
              <View style={styles.modalFeatureRow}>
                <CheckCircle2 size={16} color={colors.positive} />
                <Text style={styles.modalFeatureText}>Zainetto Fiscale e Minusvalenze calcolate</Text>
              </View>
            </View>

            {/* Action Buttons */}
            <TouchableOpacity
              style={styles.modalPrimaryBtn}
              onPress={() => {
                setShowSuccessModal(false);
                router.replace('/');
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.modalPrimaryBtnText}>Vai alla Dashboard Portafoglio</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalSecondaryBtn}
              onPress={() => setShowSuccessModal(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.modalSecondaryBtnText}>Rimani nelle Impostazioni</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Disconnect Confirmation Modal */}
      <Modal
        visible={showDisconnectModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDisconnectModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={[styles.successIconGlow, { backgroundColor: withAlpha(colors.negative, 0.125) }]}>
              <View style={[styles.successIconCircle, { backgroundColor: colors.negative }]}>
                <Trash2 size={28} color={colors.onStrong} strokeWidth={2.5} />
              </View>
            </View>

            <Text style={styles.modalTitle}>Disconnetti Scalable?</Text>
            <Text style={styles.modalSubtitle}>
              La sessione e le chiavi di sicurezza verranno rimosse in modo protetto. I dati già sincronizzati rimarranno nel tuo portafoglio.
            </Text>

            <TouchableOpacity
              style={[styles.modalPrimaryBtn, { backgroundColor: colors.negative }]}
              onPress={handleConfirmDisconnect}
              disabled={disconnecting}
              activeOpacity={0.85}
            >
              {disconnecting ? (
                <ActivityIndicator size="small" color={colors.onStrong} />
              ) : (
                <Text style={[styles.modalPrimaryBtnText, { color: colors.onStrong }]}>Conferma Disconnessione</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalSecondaryBtn}
              onPress={() => setShowDisconnectModal(false)}
              activeOpacity={0.7}
              disabled={disconnecting}
            >
              <Text style={styles.modalSecondaryBtnText}>Annulla</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  statusCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
  },
  statusCardConnected: {
    backgroundColor: colors.scalableSurface,
    borderColor: colors.scalable,
  },
  statusCardDisconnected: {
    backgroundColor: colors.card,
    borderColor: colors.border,
  },
  statusHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  statusCardSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  guideContainer: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  guideHeading: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingLeft: 4,
    borderLeftWidth: 2,
    borderLeftColor: colors.border,
    paddingBottom: 18,
    marginLeft: 12,
  },
  stepNumberBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginLeft: -14,
  },
  stepNumberText: {
    color: colors.onAccent,
    fontWeight: '700',
    fontSize: 12,
  },
  stepTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 3,
  },
  stepDescription: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17,
  },
  formCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  formSectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 6,
  },
  pasteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  pasteButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  inputContainer: {
    position: 'relative',
    justifyContent: 'center',
  },
  textInput: {
    backgroundColor: colors.inputBackground,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    fontSize: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  eyeButton: {
    position: 'absolute',
    right: 12,
    padding: 4,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
    marginBottom: 6,
  },
  switchLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  switchDescription: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  messageBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    marginTop: 16,
  },
  messageBannerSuccess: {
    backgroundColor: colors.scalableSurface,
  },
  messageBannerError: {
    backgroundColor: colors.negativeSurface,
  },
  messageText: {
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
    lineHeight: 16,
  },
  primaryButton: {
    backgroundColor: colors.scalable,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  primaryButtonText: {
    color: colors.onAccent,
    fontSize: 14,
    fontWeight: '700',
  },
  disconnectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 12,
  },
  disconnectButtonText: {
    color: colors.negative,
    fontSize: 13,
    fontWeight: '600',
  },
  securityNoteCard: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  securityNoteTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  securityNoteText: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  syncCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: withAlpha(colors.scalable, 0.376),
  },
  syncCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  syncIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: withAlpha(colors.scalable, 0.125),
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  syncCardSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  syncDetailsBox: {
    backgroundColor: colors.inputBackground,
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    marginBottom: 16,
  },
  syncDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  syncDetailLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  syncDetailValue: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  syncFeedbackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.scalableSurface,
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  syncFeedbackText: {
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
    lineHeight: 16,
  },
  syncActionButton: {
    backgroundColor: colors.scalable,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncActionButtonText: {
    color: colors.onAccent,
    fontSize: 14,
    fontWeight: '700',
  },
  yieldCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: withAlpha(colors.scalable, 0.314),
  },
  yieldCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  yieldIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: withAlpha(colors.scalable, 0.125),
    alignItems: 'center',
    justifyContent: 'center',
  },
  yieldCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  yieldCardSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  cashBalanceBox: {
    backgroundColor: colors.inputBackground,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cashBalanceLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cashBalanceCurrency: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.scalable,
    marginRight: 4,
  },
  cashBalanceAmount: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.text,
  },
  cashBalanceHint: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 6,
    textAlign: 'center',
  },
  yieldSectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 10,
  },
  planChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  planChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.border,
  },
  planChipSelected: {
    backgroundColor: withAlpha(colors.scalable, 0.125),
    borderColor: colors.scalable,
  },
  planChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  planChipTextSelected: {
    color: colors.scalable,
    fontWeight: '700',
  },
  customRateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.inputBackground,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  customRateLabel: {
    fontSize: 13,
    color: colors.text,
  },
  customRateInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  customRateInput: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 50,
    textAlign: 'right',
  },
  percentSymbol: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textSecondary,
    marginLeft: 2,
  },
  projectionsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  projectionCard: {
    flex: 1,
    backgroundColor: colors.inputBackground,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  projectionLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600',
    marginBottom: 4,
  },
  projectionValue: {
    fontSize: 17,
    fontWeight: '700',
  },
  projectionSub: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 2,
  },
  taxNoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    paddingHorizontal: 2,
  },
  taxNoteText: {
    fontSize: 11,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 15,
  },
  yieldSwitchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    marginBottom: 12,
  },
  saveCashButton: {
    backgroundColor: colors.scalable,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  saveCashButtonText: {
    color: colors.onAccent,
    fontSize: 13,
    fontWeight: '700',
  },
  savingsPlansCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: withAlpha(colors.scalable, 0.251),
  },
  savingsPlansHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  savingsIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: withAlpha(colors.scalable, 0.125),
    alignItems: 'center',
    justifyContent: 'center',
  },
  savingsPlansTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  savingsPlansSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  savingsPlansList: {
    backgroundColor: colors.inputBackground,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  savingsPlanItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  savingsPlanSymbol: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  savingsPlanName: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
  },
  savingsPlanCadence: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  savingsPlanAmount: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  savingsPlanBadge: {
    backgroundColor: withAlpha(colors.scalable, 0.125),
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 3,
  },
  savingsPlanBadgeText: {
    color: colors.scalable,
    fontSize: 10,
    fontWeight: '700',
  },
  openPacButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.scalable,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  openPacButtonText: {
    color: colors.onAccent,
    fontSize: 13,
    fontWeight: '700',
  },
  priceAlertsCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  priceAlertsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  priceAlertsIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: withAlpha(colors.scalable, 0.082),
    alignItems: 'center',
    justifyContent: 'center',
  },
  priceAlertsTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  priceAlertsSubtitle: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  refreshAlertsSmallButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: withAlpha(colors.scalable, 0.082),
  },
  priceAlertsList: {
    backgroundColor: colors.inputBackground,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  priceAlertItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  priceAlertSymbol: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  priceAlertStatusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 6,
  },
  priceAlertStatusTriggered: {
    backgroundColor: withAlpha(colors.positive, 0.125),
  },
  priceAlertStatusApproaching: {
    backgroundColor: withAlpha(colors.warning, 0.125),
  },
  priceAlertStatusActive: {
    backgroundColor: colors.border,
  },
  priceAlertStatusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  priceAlertName: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  priceAlertNoteText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginTop: 2,
  },
  priceAlertTargetPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  priceAlertDistance: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  priceAlertCurrentPrice: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 1,
  },
  taxReportCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  taxReportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  taxReportIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: withAlpha(colors.info, 0.082),
    alignItems: 'center',
    justifyContent: 'center',
  },
  taxReportTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  taxReportSubtitle: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  taxReportMetricsRow: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  taxReportMetricCol: {
    flex: 1,
    alignItems: 'center',
  },
  taxReportMetricLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    marginBottom: 4,
    textAlign: 'center',
  },
  taxReportMetricValue: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  taxReportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 6,
  },
  taxReportButtonText: {
    color: colors.onAccent,
    fontSize: 13,
    fontWeight: '700',
  },
  oauthCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: withAlpha(colors.primary, 0.314),
  },
  oauthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  oauthBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  oauthTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  oauthSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 3,
    lineHeight: 17,
  },
  oauthMainBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
    marginTop: 16,
    marginBottom: 16,
  },
  oauthMainBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.onAccent,
  },
  oauthBulletList: {
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 14,
  },
  oauthBulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  oauthBulletText: {
    fontSize: 12,
    color: colors.textSecondary,
    flex: 1,
  },
  advancedToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
    marginBottom: 14,
  },
  advancedToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  deviceAuthCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1.5,
    borderColor: colors.scalable,
    marginBottom: 20,
    shadowColor: colors.scalable,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  deviceAuthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  userCodeBox: {
    backgroundColor: colors.inputBackground,
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  userCodeLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  userCodeValue: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.scalable,
    letterSpacing: 4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 10,
  },
  copyCodeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  copyCodeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  openScalableButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.scalable,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginBottom: 14,
  },
  openScalableButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.onAccent,
  },
  pollingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    marginBottom: 8,
  },
  pollingText: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  cancelDeviceButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  cancelDeviceButtonText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  guideCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: withAlpha(colors.scalable, 0.251),
    marginBottom: 16,
  },
  guideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  guideIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: withAlpha(colors.scalable, 0.125),
    justifyContent: 'center',
    alignItems: 'center',
  },
  guideTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  guideSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  guideStepsList: {
    gap: 10,
    backgroundColor: colors.inputBackground,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  guideStepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  guideStepNumber: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  guideStepNumberText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  guideStepText: {
    fontSize: 12,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 18,
  },
  cliReminderBox: {
    flexDirection: 'row',
    backgroundColor: withAlpha(colors.warning, 0.082),
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: withAlpha(colors.warning, 0.251),
    marginBottom: 16,
  },
  cliReminderTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.warning,
    marginBottom: 3,
  },
  cliReminderText: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.scalable,
    shadowColor: colors.scalable,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 10,
  },
  successIconGlow: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: withAlpha(colors.scalable, 0.145),
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
    borderWidth: 1,
    borderColor: withAlpha(colors.scalable, 0.376),
  },
  successIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.scalable,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.scalable,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  modalSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  modalFeaturesBox: {
    width: '100%',
    backgroundColor: colors.inputBackground,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 24,
  },
  modalFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modalFeatureText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
    flex: 1,
  },
  modalPrimaryBtn: {
    width: '100%',
    backgroundColor: colors.scalable,
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    shadowColor: colors.scalable,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  modalPrimaryBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.onAccent,
  },
  modalSecondaryBtn: {
    width: '100%',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSecondaryBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
});
