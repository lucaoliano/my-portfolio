import { ThemeColors, withAlpha } from '../theme/colors';
import React, { useEffect, useState, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, RefreshControl, Modal, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LogOut, Search, ChevronRight, ChevronDown, PieChart as PieChartIcon, Settings, Menu, X, User, Calculator, Cpu, Coins, Bell, Receipt, RefreshCw, CheckCircle2, AlertCircle, FolderCog, Plus, Link2 } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { signOut } from 'firebase/auth';

import { useAppTheme } from '../theme/ThemeContext';
import { formatNumber, formatSignedCurrency } from '../utils/formatters';
import { AssetCard } from '../components/AssetCard';
import { MetricChip } from '../components/MetricChip';
import { PieChartComponent } from '../components/PieChartComponent';
import { PortfolioSkeleton } from '../components/PortfolioSkeleton';
import { CopyableText } from '../components/CopyableText';
import { HealthCheckSummaryRow } from '../components/PortfolioHealthCheckCard';
import { auth } from '../config/firebase';
import { Coverage, GroupedPortfolio } from '../types';

import { usePortfolioOverview } from '../hooks/usePortfolioOverview';
import { useScalablePriceAlerts } from '../hooks/useScalablePriceAlerts';
import { calculateCashYield } from '../utils/cashInterest';
import { getTriggeredAlerts, getApproachingAlerts } from '../utils/priceAlerts';
import { syncScalablePortfolio } from '../services/scalableMcp';

// Oltre questa distanza di scroll il bilancio esce dallo schermo e il titolo della barra lo riprende
const COMPACT_HEADER_OFFSET = 96;
// Pull-to-refresh manuale per la PWA su iOS, dove RefreshControl non esiste
const PWA_PULL_THRESHOLD = -70;

const isSessionError = (msg: string) => {
  const m = msg.toLowerCase();
  return (
    m.includes('missing or invalid credentials') ||
    m.includes('scaduta') ||
    m.includes('unauthenticated') ||
    m.includes('token refresh fallito')
  );
};

/** Messaggi per l'utente: mai il testo tecnico del backend. */
const friendlySyncError = (msg: string) => {
  if (isSessionError(msg)) return 'Sessione Scalable scaduta: tocca qui per ricollegare il conto.';
  const m = msg.toLowerCase();
  if (m.includes('network') || m.includes('fetch') || m.includes('unavailable') || m.includes('deadline')) {
    return 'Sincronizzazione non riuscita: Scalable non risponde. I dati mostrati sono quelli dell\'ultima sincronizzazione.';
  }
  return 'Sincronizzazione non riuscita. I dati mostrati sono quelli dell\'ultima sincronizzazione.';
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const signedPercent = (value: number) => `${value >= 0 ? '+' : ''}${formatNumber(value)}%`;

export const PortfolioScreen = () => {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);
  const router = useRouter();
  const userId = auth.currentUser?.uid;

  const {
    transactions,
    settings,
    scalableConfig,
    isScalableConnected,
    scalableCash,
    configuredInterestRate,
    includeCashInTotal,
    quotesState,
    aggregation,
    allAssets,
    healthCheck,
    isInitialLoading,
  } = usePortfolioOverview(userId);
  const { alerts: scalableAlerts } = useScalablePriceAlerts(userId);
  const { quotes, refreshing, error: quotesError, updatedAt: quotesUpdatedAt, refresh: refreshQuotes } = quotesState;

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [compositionGroup, setCompositionGroup] = useState<GroupedPortfolio | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [showCompactTitle, setShowCompactTitle] = useState(false);
  const pullTriggeredRef = useRef(false);

  // Scalable Sync Feedback & State
  const [scalableSyncing, setScalableSyncing] = useState(false);
  const [syncBanner, setSyncBanner] = useState<{
    message: string;
    type: 'syncing' | 'success' | 'error';
    sessionExpired?: boolean;
  } | null>(null);
  const autoSyncTriggeredRef = useRef(false);
  const bannerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearBannerTimeout = () => {
    if (bannerTimeoutRef.current) {
      clearTimeout(bannerTimeoutRef.current);
      bannerTimeoutRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      clearBannerTimeout();
    };
  }, []);

  const handleSyncScalable = async (isAuto = false) => {
    if (scalableSyncing) return;
    setScalableSyncing(true);
    clearBannerTimeout();
    setSyncBanner({
      type: 'syncing',
      message: isAuto
        ? 'Sincronizzazione automatica con Scalable in corso…'
        : 'Sincronizzazione con Scalable in corso…'
    });

    try {
      const res = await syncScalablePortfolio({ targetGroup: 'Scalable' });
      // I prezzi aggiornati arrivano in scalable_quotes: ricarica le quotazioni
      refreshQuotes(true);

      const parts: string[] = [];
      if (res.importedCount > 0) {
        parts.push(plural(res.importedCount, 'nuova transazione', 'nuove transazioni'));
      }
      if (res.deduplicatedCount && res.deduplicatedCount > 0) {
        parts.push(plural(res.deduplicatedCount, 'duplicato unificato', 'duplicati unificati'));
      }

      const successDetail = parts.length > 0 ? parts.join(', ') : 'portafoglio e liquidità aggiornati';
      setSyncBanner({ type: 'success', message: `Scalable sincronizzato: ${successDetail}` });
      bannerTimeoutRef.current = setTimeout(() => setSyncBanner(null), 4500);
    } catch (err: unknown) {
      const msg = (err as Error)?.message || '';
      console.error('Errore sincronizzazione Scalable:', err);
      // Gli errori restano visibili finché l'utente non li chiude o riprova: un'occhiata non deve perderli
      setSyncBanner({ type: 'error', message: friendlySyncError(msg), sessionExpired: isSessionError(msg) });
    } finally {
      setScalableSyncing(false);
    }
  };

  const triggeredAlerts = useMemo(() => getTriggeredAlerts(scalableAlerts, quotes), [scalableAlerts, quotes]);
  const approachingAlerts = useMemo(() => getApproachingAlerts(scalableAlerts, quotes), [scalableAlerts, quotes]);

  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const saved = await AsyncStorage.getItem('collapsedGroups');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            setCollapsedGroups(new Set(parsed));
          }
        }
      } catch (e) {
        console.error("Errore nel caricamento delle preferenze:", e);
      }
    };
    loadPreferences();
  }, []);

  const toggleGroup = async (groupName: string) => {
    const next = new Set(collapsedGroups);
    if (next.has(groupName)) {
      next.delete(groupName);
    } else {
      next.add(groupName);
    }
    setCollapsedGroups(next);

    try {
      await AsyncStorage.setItem('collapsedGroups', JSON.stringify(Array.from(next)));
    } catch (e) {
      console.error("Errore nel salvataggio dei gruppi chiusi:", e);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Errore logout:", error);
    }
  };

  // Auto-Sync with Scalable Capital MCP at startup if enabled
  useEffect(() => {
    if (!userId || !scalableConfig) return;
    if (autoSyncTriggeredRef.current) return;

    if (scalableConfig.enabled && scalableConfig.status === 'connected' && scalableConfig.autoSync) {
      autoSyncTriggeredRef.current = true;
      const lastSync = scalableConfig.lastSyncedAt ? new Date(scalableConfig.lastSyncedAt).getTime() : 0;
      // Sync if more than 1 minute since last sync (prevents redundant sync loops on fast reloads)
      if (Date.now() - lastSync > 60 * 1000) {
        // Fuori dal ciclo dell'effect: la sync aggiorna lo stato (banner, spinner)
        setTimeout(() => handleSyncScalable(true), 0);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, scalableConfig]);

  const onRefresh = () => {
    refreshQuotes(true);
    if (isScalableConnected) {
      handleSyncScalable(false);
    }
  };

  const {
    groupedData,
    globalTotalValue,
    globalPL,
    globalPLPercent,
    globalDailyChange,
    globalDailyChangePercent,
    globalAnnualizedReturn,
    globalIsAnnualizedExtrapolated,
    missingPriceSymbols,
    globalDailyCoverage,
  } = aggregation;

  const displayTotalValue = (includeCashInTotal && scalableCash > 0)
    ? (globalTotalValue + scalableCash)
    : globalTotalValue;

  const lastSyncLabel = (() => {
    if (!scalableConfig?.lastSyncedAt) return 'Non ancora sincronizzato';
    const d = new Date(scalableConfig.lastSyncedAt);
    if (isNaN(d.getTime())) return 'Sincronizzato di recente';
    const isToday = d.toDateString() === new Date().toDateString();
    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return isToday
      ? `Sincronizzato oggi alle ${timeStr}`
      : `Sincronizzato il ${d.toLocaleDateString([], { day: '2-digit', month: '2-digit' })} alle ${timeStr}`;
  })();

  const quotesStatusLabel = useMemo(() => {
    if (!quotesUpdatedAt) return null;
    const isToday = quotesUpdatedAt.toDateString() === new Date().toDateString();
    const timeStr = quotesUpdatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return isToday
      ? `Quotazioni delle ${timeStr}`
      : `Quotazioni del ${quotesUpdatedAt.toLocaleDateString([], { day: '2-digit', month: '2-digit' })} alle ${timeStr}`;
  }, [quotesUpdatedAt]);

  const scalableYield = useMemo(() => {
    return calculateCashYield(scalableCash, configuredInterestRate ?? 0);
  }, [scalableCash, configuredInterestRate]);

  // Sorting Sections based on settings
  const sections = [...groupedData].sort((a, b) => {
    const orderList = settings?.groups || [];
    const indexA = orderList.indexOf(a.groupName);
    const indexB = orderList.indexOf(b.groupName);

    if (indexA === -1 && indexB === -1) return a.groupName.localeCompare(b.groupName);
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;

    return indexA - indexB;
  });

  if (isInitialLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <PortfolioSkeleton />
      </SafeAreaView>
    );
  }

  /** "Annuo +11,22%* · Oggi +€12,30 (+0,42%)" — un solo chip colorato per blocco, il resto è testo secondario. */
  const renderSecondaryMetrics = (opts: {
    annualized?: number | null;
    extrapolated?: boolean;
    daily: number;
    dailyPercent: number;
    coverage: Coverage;
  }) => {
    const hasAnnualized = opts.annualized !== undefined && opts.annualized !== null;
    const hasDaily = opts.coverage.withData > 0;
    if (!hasAnnualized && !hasDaily) return null;
    const partialDaily = hasDaily && opts.coverage.withData < opts.coverage.total;
    return (
      <Text style={styles.secondaryMetrics}>
        {hasAnnualized && (
          <Text style={{ color: opts.annualized! >= 0 ? colors.positive : colors.negative }}>
            Annuo {signedPercent(opts.annualized!)}{opts.extrapolated ? '*' : ''}
          </Text>
        )}
        {hasAnnualized && hasDaily && <Text style={styles.metricSeparator}>  ·  </Text>}
        {hasDaily && (
          <Text style={{ color: opts.daily >= 0 ? colors.positive : colors.negative }}>
            Oggi {formatSignedCurrency(opts.daily)} ({signedPercent(opts.dailyPercent)})
          </Text>
        )}
        {partialDaily && (
          <Text style={styles.metricSeparator}> su {opts.coverage.withData} di {opts.coverage.total} titoli</Text>
        )}
      </Text>
    );
  };

  const hasTriggeredAlerts = triggeredAlerts.length > 0;

  const listHeader = (
    <View style={styles.header}>
      <Text style={styles.headerSubtitle}>Bilancio totale</Text>
      <CopyableText style={styles.headerTitle} valueToCopy={displayTotalValue.toString()} accessibilityRole="header">
        €{formatNumber(displayTotalValue)}
      </CopyableText>
      {scalableCash > 0 && (
        <Text style={styles.headerNote}>
          {includeCashInTotal
            ? `Investito €${formatNumber(globalTotalValue)} · Liquidità €${formatNumber(scalableCash)}`
            : `Liquidità Scalable esclusa (€${formatNumber(scalableCash)})`}
        </Text>
      )}

      {transactions.length > 0 && (
        <View style={styles.headerMetrics}>
          <MetricChip value={globalPL} style={{ alignSelf: 'flex-start' }}>
            Totale {formatSignedCurrency(globalPL)} ({signedPercent(globalPLPercent)})
          </MetricChip>
          {renderSecondaryMetrics({
            annualized: globalAnnualizedReturn,
            extrapolated: globalIsAnnualizedExtrapolated,
            daily: globalDailyChange,
            dailyPercent: globalDailyChangePercent,
            coverage: globalDailyCoverage,
          })}
          {globalIsAnnualizedExtrapolated && globalAnnualizedReturn !== null && (
            <Text style={styles.footnote}>*Stima annua (XIRR) su meno di un anno di storico</Text>
          )}
          {(quotesStatusLabel || missingPriceSymbols.length > 0) && (
            <Text style={styles.footnote}>
              {quotesStatusLabel}
              {quotesStatusLabel && missingPriceSymbols.length > 0 ? ' · ' : ''}
              {missingPriceSymbols.length > 0 && (
                <Text style={{ color: colors.warning }}>
                  {plural(missingPriceSymbols.length, 'titolo senza prezzo', 'titoli senza prezzo')}, valutati al costo
                </Text>
              )}
            </Text>
          )}
        </View>
      )}

      {quotesError && (
        <View style={styles.inlineAlert} accessibilityRole="alert">
          <AlertCircle size={16} color={colors.warning} style={{ marginRight: 8 }} />
          <Text style={styles.inlineAlertText}>{quotesError}</Text>
          <TouchableOpacity
            style={styles.inlineAlertAction}
            onPress={() => refreshQuotes(true)}
            hitSlop={8}
            accessibilityRole="button"
          >
            <Text style={styles.inlineAlertActionText}>Riprova</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Liquidità Scalable: la card apre l'integrazione, il pulsante di sync è un controllo separato */}
      {isScalableConnected && (
        <View style={styles.cashYieldBanner}>
          <TouchableOpacity
            onPress={() => router.push('/integrations/scalable')}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Liquidità Scalable, apri i dettagli"
          >
            <View style={styles.cashYieldHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <View style={styles.cashYieldIcon}>
                  <Coins size={14} color={colors.scalable} />
                </View>
                <Text style={styles.cashYieldTitle}>Liquidità Scalable</Text>
                {configuredInterestRate !== undefined ? (
                  <View style={styles.rateBadge}>
                    <Text style={styles.rateBadgeText}>{formatNumber(configuredInterestRate)}% annuo</Text>
                  </View>
                ) : (
                  <Text style={styles.cashEstText}>Imposta il tasso</Text>
                )}
              </View>
              <ChevronRight size={16} color={colors.textSecondary} />
            </View>
            {scalableCash > 0 && (
              <View style={styles.cashYieldDetailsRow}>
                <Text style={styles.cashBalanceText}>
                  Saldo libero: <Text style={styles.cashBalanceValue}>€{formatNumber(scalableCash)}</Text>
                </Text>
                {scalableYield.annualNet > 0 && (
                  <Text style={styles.cashEstText}>
                    Rendimento: <Text style={{ color: colors.positive, fontWeight: '700' }}>+€{formatNumber(scalableYield.annualNet)}/anno</Text> netti
                  </Text>
                )}
              </View>
            )}
          </TouchableOpacity>
          <View style={styles.cashYieldFooterRow}>
            <Text style={styles.cashYieldSyncTimeText}>{lastSyncLabel}</Text>
            <TouchableOpacity
              style={styles.cashYieldSyncBtn}
              onPress={() => handleSyncScalable(false)}
              disabled={scalableSyncing}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityState={{ busy: scalableSyncing, disabled: scalableSyncing }}
            >
              {scalableSyncing ? (
                <ActivityIndicator size={12} color={colors.scalable} style={{ marginRight: 6 }} />
              ) : (
                <RefreshCw size={12} color={colors.scalable} style={{ marginRight: 6 }} />
              )}
              <Text style={styles.cashYieldSyncBtnText}>
                {scalableSyncing ? 'Sincronizzo…' : 'Sincronizza ora'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Price alert Scalable */}
      {isScalableConnected && (hasTriggeredAlerts || approachingAlerts.length > 0) && (
        <TouchableOpacity
          style={[
            styles.priceAlertBanner,
            hasTriggeredAlerts ? styles.priceAlertBannerTriggeredBorder : styles.priceAlertBannerApproachingBorder
          ]}
          onPress={() => {
            if (triggeredAlerts.length === 1) {
              const item = triggeredAlerts[0];
              router.push({
                pathname: '/asset/[id]',
                params: { id: item.alert.symbol, symbol: item.alert.symbol, name: item.alert.name }
              });
            } else {
              router.push('/integrations/scalable');
            }
          }}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <View style={styles.priceAlertBannerHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <View style={[
                styles.priceAlertBannerIcon,
                hasTriggeredAlerts ? styles.priceAlertBannerIconTriggered : styles.priceAlertBannerIconApproaching
              ]}>
                <Bell size={14} color={hasTriggeredAlerts ? colors.positive : colors.warning} />
              </View>
              <Text style={styles.priceAlertBannerTitle}>
                {hasTriggeredAlerts
                  ? `${plural(triggeredAlerts.length, 'avviso di prezzo raggiunto', 'avvisi di prezzo raggiunti')}`
                  : `${plural(approachingAlerts.length, 'avviso di prezzo vicino', 'avvisi di prezzo vicini')} alla soglia`}
              </Text>
            </View>
            <ChevronRight size={16} color={colors.textSecondary} />
          </View>

          <Text style={styles.priceAlertBannerText} numberOfLines={2}>
            {hasTriggeredAlerts
              ? `${triggeredAlerts[0].alert.name || triggeredAlerts[0].alert.symbol} ha raggiunto ${triggeredAlerts[0].calculation.targetPriceFormatted} (ora ${triggeredAlerts[0].calculation.currentPriceFormatted})`
              : `${approachingAlerts[0].alert.name || approachingAlerts[0].alert.symbol} è a ${approachingAlerts[0].calculation.distanceFormatted} dalla soglia di ${approachingAlerts[0].calculation.targetPriceFormatted}`}
            {(hasTriggeredAlerts ? triggeredAlerts.length : approachingAlerts.length) > 1 ? ' e altri' : ''}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const listFooter = allAssets.length > 0 ? (
    <View style={styles.listFooter}>
      <HealthCheckSummaryRow healthCheck={healthCheck} onPress={() => router.push('/health-check')} />
    </View>
  ) : null;

  const menuItems: { label: string; icon: React.ReactNode; onPress: () => void }[] = [
    { label: 'Profilo', icon: <User size={24} color={colors.text} />, onPress: () => router.push('/profile') },
    { label: 'Simulatore PAC', icon: <Calculator size={24} color={colors.text} />, onPress: () => router.push('/pac-calculator' as never) },
    { label: 'Zainetto fiscale', icon: <Receipt size={24} color={colors.text} />, onPress: () => router.push('/tax-report' as never) },
    { label: 'Gestisci gruppi', icon: <FolderCog size={24} color={colors.text} />, onPress: () => router.push('/manage-groups') },
    { label: 'Integrazioni broker', icon: <Cpu size={24} color={colors.text} />, onPress: () => router.push('/integrations' as never) },
    { label: 'Impostazioni', icon: <Settings size={24} color={colors.text} />, onPress: () => router.push('/settings' as never) },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.topBar, showCompactTitle && styles.topBarScrolled]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 }}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => setMenuVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Apri il menu"
          >
            <Menu size={26} color={colors.text} />
          </TouchableOpacity>
          {showCompactTitle && transactions.length > 0 ? (
            <View style={styles.compactTitle} accessibilityRole="header">
              <Text style={styles.compactTitleValue} numberOfLines={1}>€{formatNumber(displayTotalValue)}</Text>
              <Text style={[styles.compactTitleDelta, { color: globalPL >= 0 ? colors.positive : colors.negative }]}>
                {signedPercent(globalPLPercent)}
              </Text>
            </View>
          ) : (
            <Text style={styles.topBarTitle} accessibilityRole="header">Dashboard</Text>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {(isScalableConnected || scalableConfig?.status === 'expired') && (
            <TouchableOpacity
              style={[
                styles.scalableTopBarBtn,
                scalableSyncing && styles.scalableTopBarBtnActive,
                scalableConfig?.status === 'expired' && styles.scalableTopBarBtnExpired,
              ]}
              onPress={() => {
                if (scalableConfig?.status === 'expired') {
                  router.push('/integrations/scalable');
                } else if (!scalableSyncing) {
                  handleSyncScalable(false);
                }
              }}
              disabled={scalableSyncing}
              activeOpacity={0.7}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={
                scalableConfig?.status === 'expired'
                  ? 'Sessione Scalable scaduta, ricollega il conto'
                  : 'Sincronizza con Scalable'
              }
              accessibilityState={{ busy: scalableSyncing, disabled: scalableSyncing }}
            >
              {scalableSyncing ? (
                <ActivityIndicator size={12} color={colors.scalable} style={{ marginRight: 6 }} />
              ) : scalableConfig?.status === 'expired' ? (
                <AlertCircle size={12} color={colors.negative} style={{ marginRight: 6 }} />
              ) : (
                <RefreshCw size={12} color={colors.scalable} style={{ marginRight: 6 }} />
              )}
              <Text style={[
                styles.scalableTopBarBtnText,
                scalableConfig?.status === 'expired' && { color: colors.negative }
              ]}>
                {scalableSyncing ? 'Sincronizzo…' : scalableConfig?.status === 'expired' ? 'Ricollega' : 'Scalable'}
              </Text>
            </TouchableOpacity>
          )}

          {refreshing && !scalableSyncing && (
            <ActivityIndicator size="small" color={colors.textSecondary} style={{ marginHorizontal: 4 }} accessibilityLabel="Aggiornamento quotazioni" />
          )}
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => router.push('/search')}
            accessibilityRole="button"
            accessibilityLabel="Cerca un titolo"
          >
            <Search size={24} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Stato della sincronizzazione Scalable */}
      {syncBanner && (
        <View
          style={[
            styles.syncBanner,
            syncBanner.type === 'syncing' && styles.syncBannerSyncing,
            syncBanner.type === 'success' && styles.syncBannerSuccess,
            syncBanner.type === 'error' && styles.syncBannerError,
          ]}
          accessibilityLiveRegion="polite"
          accessibilityRole={syncBanner.type === 'error' ? 'alert' : undefined}
        >
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
            onPress={() => {
              if (syncBanner.sessionExpired) {
                router.push('/integrations/scalable');
              }
            }}
            disabled={!syncBanner.sessionExpired}
            activeOpacity={0.7}
          >
            {syncBanner.type === 'syncing' ? (
              <ActivityIndicator size="small" color={colors.scalable} style={{ marginRight: 10 }} />
            ) : syncBanner.type === 'success' ? (
              <CheckCircle2 size={18} color={colors.positive} style={{ marginRight: 10 }} />
            ) : (
              <AlertCircle size={18} color={colors.negative} style={{ marginRight: 10 }} />
            )}
            <Text style={styles.syncBannerText}>{syncBanner.message}</Text>
          </TouchableOpacity>

          {syncBanner.type === 'error' && !syncBanner.sessionExpired && (
            <TouchableOpacity
              style={styles.syncRetryBtn}
              onPress={() => handleSyncScalable(false)}
              hitSlop={6}
              accessibilityRole="button"
            >
              <Text style={styles.syncRetryBtnText}>Riprova</Text>
            </TouchableOpacity>
          )}

          {syncBanner.type !== 'syncing' && (
            <TouchableOpacity
              style={styles.bannerClose}
              onPress={() => {
                clearBannerTimeout();
                setSyncBanner(null);
              }}
              accessibilityRole="button"
              accessibilityLabel="Chiudi messaggio"
            >
              <X size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {transactions.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>Il tuo portafoglio è vuoto</Text>
          <Text style={styles.emptySubText}>Aggiungi il primo titolo o collega il tuo conto Scalable per importare le transazioni.</Text>
          <TouchableOpacity style={styles.emptyPrimaryButton} onPress={() => router.push('/search')} accessibilityRole="button">
            <Plus size={18} color={colors.onAccent} style={{ marginRight: 8 }} />
            <Text style={styles.emptyPrimaryButtonText}>Cerca un titolo</Text>
          </TouchableOpacity>
          {!isScalableConnected && (
            <TouchableOpacity style={styles.emptySecondaryButton} onPress={() => router.push('/integrations/scalable')} accessibilityRole="button">
              <Link2 size={18} color={colors.text} style={{ marginRight: 8 }} />
              <Text style={styles.emptySecondaryButtonText}>Collega Scalable</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={sections}
          keyExtractor={(item) => item.groupName}
          ListHeaderComponent={listHeader}
          ListFooterComponent={listFooter}
          renderItem={({ item: group }) => {
            const isCollapsed = collapsedGroups.has(group.groupName);
            const hasComposition = group.assets.length > 0 && group.currentTotalValue > 0;
            // Nessun prezzo nel gruppo: il rendimento sarebbe 0% per costruzione, quindi non lo mostriamo
            const allUnpriced = group.dailyCoverage.total > 0 && group.missingPriceCount === group.dailyCoverage.total;

            return (
              <View style={styles.groupOuterContainer}>
                {/* Intestazione: un solo controllo "apri/chiudi" accessibile; torta e valore sono controlli fratelli, non annidati */}
                <View style={styles.sectionHeaderContainer}>
                  <View style={styles.sectionHeaderTop}>
                    <TouchableOpacity
                      style={styles.sectionToggle}
                      onPress={() => toggleGroup(group.groupName)}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={`Gruppo ${group.groupName}, €${formatNumber(group.currentTotalValue)}, ${plural(group.assets.length, 'titolo', 'titoli')}`}
                      accessibilityState={{ expanded: !isCollapsed }}
                    >
                      {isCollapsed ? (
                        <ChevronRight size={20} color={colors.textSecondary} style={{ marginRight: 8 }} />
                      ) : (
                        <ChevronDown size={20} color={colors.textSecondary} style={{ marginRight: 8 }} />
                      )}
                      <Text style={styles.sectionTitle} numberOfLines={1}>{group.groupName}</Text>
                    </TouchableOpacity>

                    {hasComposition && (
                      <TouchableOpacity
                        onPress={() => setCompositionGroup(group)}
                        style={styles.iconButtonSmall}
                        accessibilityRole="button"
                        accessibilityLabel={`Composizione del gruppo ${group.groupName}`}
                      >
                        <PieChartIcon size={20} color={colors.textSecondary} />
                      </TouchableOpacity>
                    )}
                    <CopyableText
                      style={styles.sectionValue}
                      valueToCopy={group.currentTotalValue.toString()}
                      onPress={() => toggleGroup(group.groupName)}
                    >
                      €{formatNumber(group.currentTotalValue)}
                    </CopyableText>
                  </View>

                  <Pressable
                    style={styles.sectionMetrics}
                    onPress={() => toggleGroup(group.groupName)}
                    accessible={false}
                  >
                    {allUnpriced ? (
                      <Text style={styles.footnote}>Prezzi non disponibili: valutato al costo</Text>
                    ) : (
                      <>
                        <MetricChip value={group.profitOrLoss} style={{ alignSelf: 'flex-start' }}>
                          Totale {formatSignedCurrency(group.profitOrLoss)} ({signedPercent(group.profitOrLossPercent)})
                        </MetricChip>
                        {renderSecondaryMetrics({
                          annualized: group.annualizedReturn,
                          extrapolated: group.isAnnualizedExtrapolated,
                          daily: group.dailyChange,
                          dailyPercent: group.dailyChangePercent,
                          coverage: group.dailyCoverage,
                        })}
                        {group.missingPriceCount > 0 && (
                          <Text style={styles.footnote}>
                            {plural(group.missingPriceCount, 'titolo valutato', 'titoli valutati')} al costo
                          </Text>
                        )}
                      </>
                    )}
                  </Pressable>
                </View>

                {!isCollapsed && group.assets.map((asset, index) => (
                  <AssetCard
                    key={asset.symbol + index}
                    symbol={asset.symbol}
                    name={asset.name}
                    price={asset.currentPrice}
                    changePercent={asset.profitOrLossPercent}
                    changeAbsolute={asset.profitOrLoss}
                    dailyChange={asset.dailyChange}
                    dailyChangePercent={asset.dailyChangePercent}
                    quantity={asset.totalQuantity}
                    averagePrice={asset.averagePrice}
                    currency={asset.currency}
                    annualizedReturn={asset.annualizedReturn}
                    isAnnualizedExtrapolated={asset.isAnnualizedExtrapolated}
                    hasPrice={asset.hasPrice}
                    hasDailyChange={asset.hasDailyChange}
                    isFirst={index === 0}
                    isLast={index === group.assets.length - 1}
                    onPress={() => router.push({ pathname: '/asset/[id]', params: { id: asset.symbol, symbol: asset.symbol, name: asset.name, currentPrice: asset.currentPrice, currency: asset.currency, groupName: group.groupName, dailyChange: asset.dailyChange, dailyChangePercent: asset.dailyChangePercent, hasPrice: asset.hasPrice ? '1' : '0' } })}
                  />
                ))}
              </View>
            );
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.positive}
            />
          }
          onScroll={(e) => {
            const y = e.nativeEvent.contentOffset.y;
            const compact = y > COMPACT_HEADER_OFFSET;
            if (compact !== showCompactTitle) setShowCompactTitle(compact);
            // Pull-to-refresh nella PWA iOS: una sola volta per trascinamento, non a ogni evento di scroll
            if (y < PWA_PULL_THRESHOLD && !refreshing && !pullTriggeredRef.current) {
              pullTriggeredRef.current = true;
              onRefresh();
            } else if (y >= 0) {
              pullTriggeredRef.current = false;
            }
          }}
          scrollEventThrottle={16}
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* Modal Composizione Gruppo */}
      <Modal
        visible={!!compositionGroup}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setCompositionGroup(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setCompositionGroup(null)} accessibilityLabel="Chiudi">
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle} accessibilityRole="header">Composizione: {compositionGroup?.groupName}</Text>
            {compositionGroup && (
              <PieChartComponent
                data={Object.entries(
                  compositionGroup.assets.reduce((acc, a) => {
                    const cat = a.category || 'Altro';
                    acc[cat] = (acc[cat] || 0) + a.currentTotalValue;
                    return acc;
                  }, {} as Record<string, number>)
                ).map(([cat, total]) => ({
                  label: cat,
                  value: Number(((total / compositionGroup.currentTotalValue) * 100).toFixed(2))
                })).sort((a, b) => b.value - a.value).filter(item => item.value > 0)}
              />
            )}
            <TouchableOpacity style={styles.closeButton} onPress={() => setCompositionGroup(null)} accessibilityRole="button">
              <Text style={styles.closeButtonText}>Chiudi</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Modal Hamburger Menu */}
      <Modal
        visible={menuVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable style={styles.drawerOverlay} onPress={() => setMenuVisible(false)} accessibilityLabel="Chiudi il menu">
          <View style={styles.drawerContent} onStartShouldSetResponder={() => true}>
            <View style={styles.menuHeader}>
              <Text style={styles.menuTitle} accessibilityRole="header">Menu</Text>
              <TouchableOpacity
                onPress={() => setMenuVisible(false)}
                style={styles.iconButton}
                accessibilityRole="button"
                accessibilityLabel="Chiudi il menu"
              >
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {menuItems.map(item => (
              <TouchableOpacity
                key={item.label}
                style={styles.menuItem}
                onPress={() => {
                  setMenuVisible(false);
                  item.onPress();
                }}
                accessibilityRole="button"
              >
                <View style={styles.menuItemIcon}>{item.icon}</View>
                <Text style={styles.menuItemText}>{item.label}</Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={[styles.menuItem, { borderBottomWidth: 0 }]}
              onPress={() => {
                setMenuVisible(false);
                handleLogout();
              }}
              accessibilityRole="button"
            >
              <View style={styles.menuItemIcon}><LogOut size={24} color={colors.negative} /></View>
              <Text style={[styles.menuItemText, { color: colors.negative }]}>Esci</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
};

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
  },
  topBarScrolled: {
    borderBottomColor: colors.border,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonSmall: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  topBarTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  compactTitle: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginLeft: 4,
    flexShrink: 1,
  },
  compactTitleValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    flexShrink: 1,
  },
  compactTitleDelta: {
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    marginLeft: 8,
  },
  scalableTopBarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: withAlpha(colors.scalable, 0.4),
    backgroundColor: withAlpha(colors.scalable, 0.1),
    marginRight: 4,
  },
  scalableTopBarBtnActive: {
    borderColor: colors.scalable,
    backgroundColor: withAlpha(colors.scalable, 0.2),
  },
  scalableTopBarBtnExpired: {
    borderColor: withAlpha(colors.negative, 0.4),
    backgroundColor: withAlpha(colors.negative, 0.1),
  },
  scalableTopBarBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.scalable,
  },
  syncBanner: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    paddingVertical: 8,
    paddingLeft: 14,
    paddingRight: 4,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  syncBannerSyncing: {
    backgroundColor: withAlpha(colors.scalable, 0.1),
    borderColor: withAlpha(colors.scalable, 0.35),
  },
  syncBannerSuccess: {
    backgroundColor: withAlpha(colors.positive, 0.12),
    borderColor: withAlpha(colors.positive, 0.35),
  },
  syncBannerError: {
    backgroundColor: colors.negativeSurface,
    borderColor: withAlpha(colors.negative, 0.35),
  },
  syncBannerText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: colors.text,
  },
  syncRetryBtn: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.negative,
    marginLeft: 8,
  },
  syncRetryBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.onStrong,
  },
  bannerClose: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  headerSubtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 32,
    fontWeight: 'bold',
    fontVariant: ['tabular-nums'],
  },
  headerNote: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  headerMetrics: {
    marginTop: 12,
  },
  secondaryMetrics: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    color: colors.textSecondary,
  },
  metricSeparator: {
    color: colors.textSecondary,
    fontWeight: '400',
  },
  footnote: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
    marginTop: 6,
  },
  inlineAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingLeft: 12,
    paddingRight: 4,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: colors.warningSurface,
  },
  inlineAlertText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: colors.text,
  },
  inlineAlertAction: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  inlineAlertActionText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.warning,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyText: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptySubText: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyPrimaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.positive,
  },
  emptyPrimaryButtonText: {
    color: colors.onAccent,
    fontSize: 16,
    fontWeight: '600',
  },
  emptySecondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    height: 50,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 12,
  },
  emptySecondaryButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  listContent: {
    paddingBottom: 32,
    minHeight: '101%',
  },
  listFooter: {
    marginHorizontal: 16,
    marginTop: 24,
  },
  groupOuterContainer: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  sectionHeaderContainer: {
    paddingLeft: 16,
    paddingRight: 12,
    paddingVertical: 14,
  },
  sectionHeaderTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
    minHeight: 44,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: 'bold',
    flexShrink: 1,
  },
  sectionValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  sectionMetrics: {
    paddingLeft: 28,
    marginTop: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 24,
    width: '90%',
    maxWidth: 400,
    alignItems: 'center',
  },
  modalTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  closeButton: {
    marginTop: 16,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: colors.border,
    borderRadius: 22,
  },
  closeButtonText: {
    color: colors.text,
    fontWeight: 'bold',
  },
  drawerOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
  },
  drawerContent: {
    backgroundColor: colors.card,
    width: '75%',
    maxWidth: 300,
    height: '100%',
    padding: 24,
    paddingTop: 60,
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
  },
  menuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  menuTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: 'bold',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuItemIcon: {
    marginRight: 16,
  },
  menuItemText: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '500',
  },
  cashYieldBanner: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 12,
    marginTop: 16,
    borderWidth: 1,
    borderColor: withAlpha(colors.scalable, 0.25),
  },
  cashYieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  cashYieldIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: withAlpha(colors.scalable, 0.125),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  cashYieldTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginRight: 8,
  },
  rateBadge: {
    backgroundColor: withAlpha(colors.scalable, 0.125),
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  rateBadgeText: {
    color: colors.scalable,
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  cashYieldDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  cashBalanceText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  cashBalanceValue: {
    color: colors.text,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  cashEstText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  cashYieldFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cashYieldSyncTimeText: {
    fontSize: 12,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  cashYieldSyncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: withAlpha(colors.scalable, 0.12),
    marginLeft: 8,
  },
  cashYieldSyncBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.scalable,
  },
  priceAlertBanner: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
  },
  priceAlertBannerTriggeredBorder: {
    borderColor: withAlpha(colors.positive, 0.314),
  },
  priceAlertBannerApproachingBorder: {
    borderColor: withAlpha(colors.warning, 0.314),
  },
  priceAlertBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  priceAlertBannerIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  priceAlertBannerIconTriggered: {
    backgroundColor: withAlpha(colors.positive, 0.125),
  },
  priceAlertBannerIconApproaching: {
    backgroundColor: withAlpha(colors.warning, 0.125),
  },
  priceAlertBannerTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  priceAlertBannerText: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
    marginLeft: 32,
  },
});

export default PortfolioScreen;
