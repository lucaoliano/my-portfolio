import { ThemeColors, withAlpha } from '../theme/colors';
import React, { useEffect, useState, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, RefreshControl, Modal, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LogOut, Search, ChevronRight, ChevronDown, PieChart as PieChartIcon, Settings, Menu, X, User, Calculator, Cpu, Coins, Bell, Receipt, RefreshCw, CheckCircle2, AlertCircle, FolderCog, Plus, Link2 } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAppTheme } from '../theme/ThemeContext';
import { formatNumber, formatSignedCurrency } from '../utils/formatters';
import { AssetCard } from '../components/AssetCard';
import { MetricChip } from '../components/MetricChip';
import { PieChartComponent } from '../components/PieChartComponent';
import { PortfolioSkeleton } from '../components/PortfolioSkeleton';
import { CopyableText } from '../components/CopyableText';
import { HealthCheckSummaryRow } from '../components/PortfolioHealthCheckCard';
import { auth, signOutAndClearData } from '../config/firebase';
import { Coverage, GroupedPortfolio } from '../types';

import { usePortfolioOverview } from '../hooks/usePortfolioOverview';
import { usePortfolioHistory, HistorySnapshot } from '../hooks/usePortfolioHistory';
import { PortfolioTrendChart } from '../components/PortfolioTrendChart';
import { useScalablePriceAlerts } from '../hooks/useScalablePriceAlerts';
import { calculateCashYield, interestCapFor } from '../utils/cashInterest';
import { getTriggeredAlerts, getApproachingAlerts } from '../utils/priceAlerts';
import { syncScalablePortfolio, saveScalableConfig } from '../services/scalableMcp';
import { usePeriodSeries } from '../hooks/usePeriodSeries';
import { PERIODS, PeriodKey, PeriodResult, computePeriodPerformance, periodStart } from '../utils/periodPerformance';
import { priceKey } from '../utils/historyBackfill';

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

type RowMetric = 'total' | 'daily' | 'annual' | PeriodKey;
// Come la schermata Performance di Scalable: dal più breve al più lungo, poi i dati sul costo
const ROW_METRICS: { key: RowMetric; label: string }[] = [
  { key: 'daily', label: 'Oggi' },
  ...PERIODS.map(p => ({ key: p.key as RowMetric, label: p.label })),
  { key: 'total', label: 'Totale' },
  { key: 'annual', label: 'Annuo' },
];
const isPeriodKey = (m: string): m is PeriodKey => PERIODS.some(p => p.key === m);

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

  // Fotografia del giorno per lo storico: solo con prezzi freschi, altrimenti meglio non scrivere
  const historySnapshot = useMemo<HistorySnapshot | null>(() => {
    if (isInitialLoading || quotesError || !quotesUpdatedAt || aggregation.globalTotalValue <= 0) return null;
    return {
      invested: aggregation.globalTotalValue,
      costBasis: aggregation.globalInvested,
      cash: scalableCash,
      complete: aggregation.missingPriceSymbols.length === 0 && aggregation.fxMissingSymbols.length === 0,
    };
  }, [isInitialLoading, quotesError, quotesUpdatedAt, aggregation, scalableCash]);
  const historyPoints = usePortfolioHistory(userId, historySnapshot, transactions);

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  // I gruppi con gli stessi titoli di un altro partono chiusi: si aprono solo se l'utente lo chiede
  const [expandedDuplicates, setExpandedDuplicates] = useState<Set<string>>(new Set());
  const [rowMetric, setRowMetric] = useState<RowMetric>('total');
  // Rendimento per periodo (TWR): i prezzi storici si scaricano solo quando si sceglie un periodo
  const activePeriod = isPeriodKey(rowMetric) ? PERIODS.find(p => p.key === rowMetric)! : null;
  const { series: periodSeries, loading: periodLoading, error: periodError } = usePeriodSeries(transactions, !!activePeriod);
  const nowEurByKey = useMemo(() => {
    const map: Record<string, number | null> = {};
    aggregation.globalAssets.forEach(a => {
      const price = a.hasPrice && a.valueInBase != null && a.totalQuantity > 0 ? a.valueInBase / a.totalQuantity : null;
      transactions.filter(t => t.symbol === a.symbol).forEach(t => { map[priceKey(t)] = price; });
    });
    return map;
  }, [aggregation.globalAssets, transactions]);
  const periodResults = useMemo(() => {
    if (!activePeriod || !periodSeries) return null;
    const start = periodStart(activePeriod.key);
    const run = (txs: typeof transactions) => computePeriodPerformance(txs, periodSeries, nowEurByKey, start);
    const groups: Record<string, PeriodResult | null> = {};
    const assets: Record<string, PeriodResult | null> = {};
    const byGroup: Record<string, typeof transactions> = {};
    const bySymbol: Record<string, typeof transactions> = {};
    transactions.forEach(tx => {
      (tx.groups || (tx.group ? [tx.group] : ['Generale'])).forEach(g => { (byGroup[g] ||= []).push(tx); });
      (bySymbol[tx.symbol] ||= []).push(tx);
    });
    Object.entries(byGroup).forEach(([g, txs]) => { groups[g] = run(txs); });
    Object.entries(bySymbol).forEach(([sym, txs]) => { assets[sym] = run(txs); });
    return { portfolio: run(transactions), groups, assets };
  }, [activePeriod, periodSeries, nowEurByKey, transactions]);
  const [compositionGroup, setCompositionGroup] = useState<GroupedPortfolio | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [showCompactTitle, setShowCompactTitle] = useState(false);
  const [incompleteVisible, setIncompleteVisible] = useState(false);
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
        const [saved, savedExpanded, savedMetric] = await Promise.all([
          AsyncStorage.getItem('collapsedGroups'),
          AsyncStorage.getItem('expandedDuplicateGroups'),
          AsyncStorage.getItem('rowMetric'),
        ]);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            setCollapsedGroups(new Set(parsed));
          }
        }
        if (savedExpanded) {
          const parsed = JSON.parse(savedExpanded);
          if (Array.isArray(parsed)) setExpandedDuplicates(new Set(parsed));
        }
        if (savedMetric && ROW_METRICS.some(m => m.key === savedMetric)) {
          setRowMetric(savedMetric as RowMetric);
        }
      } catch (e) {
        console.error("Errore nel caricamento delle preferenze:", e);
      }
    };
    loadPreferences();
  }, []);

  const changeRowMetric = (metric: RowMetric) => {
    setRowMetric(metric);
    AsyncStorage.setItem('rowMetric', metric).catch(() => {});
  };

  const toggleGroup = async (groupName: string, isDuplicate = false) => {
    if (isDuplicate) {
      const nextExpanded = new Set(expandedDuplicates);
      if (nextExpanded.has(groupName)) nextExpanded.delete(groupName);
      else nextExpanded.add(groupName);
      setExpandedDuplicates(nextExpanded);
      AsyncStorage.setItem('expandedDuplicateGroups', JSON.stringify(Array.from(nextExpanded))).catch(() => {});
      return;
    }
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
      await signOutAndClearData();
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

  const toggleIncludeCash = async () => {
    if (!userId) return;
    try {
      await saveScalableConfig(userId, { includeCashInTotal: !includeCashInTotal });
    } catch (e) {
      console.error('Errore salvataggio preferenza liquidità:', e);
    }
  };

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
    fxMissingSymbols,
    globalDailyCoverage,
    hasExtrapolatedAnnualized,
    globalDailyEstimated,
    latestMarketTime,
    oldestMarketTime,
  } = aggregation;

  const displayTotalValue = (includeCashInTotal && scalableCash > 0)
    ? (globalTotalValue + scalableCash)
    : globalTotalValue;

  const formatWhen = (d: Date, prefix: { today: string; other: string }) => {
    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toDateString() === new Date().toDateString()
      ? `${prefix.today} ${timeStr}`
      : `${prefix.other} ${d.toLocaleDateString([], { day: '2-digit', month: '2-digit' })} alle ${timeStr}`;
  };

  const isToday = (d: Date) => d.toDateString() === new Date().toDateString();
  const shortDate = (d: Date) => d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
  const lastSyncDate = scalableConfig?.lastSyncedAt ? new Date(scalableConfig.lastSyncedAt) : null;
  const lastSyncLabel = lastSyncDate && !isNaN(lastSyncDate.getTime())
    ? formatWhen(lastSyncDate, { today: 'Scalable sincronizzato alle', other: 'Scalable sincronizzato il' })
    : null;
  // Meglio l'ora di mercato (quando il prezzo è nato) che l'ora in cui l'app l'ha scaricato
  const marketDate = latestMarketTime ? new Date(latestMarketTime) : null;
  const oldestMarketDate = oldestMarketTime ? new Date(oldestMarketTime) : null;
  // L'ora più recente può venire da Wall Street: se qualche borsa è ferma a un giorno prima, lo diciamo
  const staleVenueNote = marketDate && oldestMarketDate && !isNaN(oldestMarketDate.getTime())
    && oldestMarketDate.toDateString() !== marketDate.toDateString()
    ? `, alcuni del ${shortDate(oldestMarketDate)}`
    : '';
  const quotesStatusLabel = marketDate && !isNaN(marketDate.getTime())
    ? `${formatWhen(marketDate, { today: 'Prezzi delle', other: 'Prezzi del' })}${staleVenueNote}`
    : quotesUpdatedAt
      ? formatWhen(quotesUpdatedAt, { today: 'Prezzi aggiornati alle', other: 'Prezzi aggiornati il' })
      : null;
  // Se l'ultimo prezzo di mercato non è di oggi (sera tardi, weekend) "Oggi" sarebbe falso: diciamo quale chiusura è
  const dailyLabel = marketDate && !isToday(marketDate)
    ? `Chiusura ${marketDate.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })}`
    : 'Oggi';

  // Titoli fuori dai calcoli, con il motivo: un solo punto d'ingresso invece di avvisi sparsi
  const assetNames: Record<string, { name: string; currency: string }> = {};
  groupedData.forEach(g => g.assets.forEach(a => { assetNames[a.symbol] = { name: a.name, currency: a.currency }; }));
  const incompleteItems = [
    ...fxMissingSymbols.map(sym => ({
      symbol: sym,
      name: assetNames[sym]?.name ?? sym,
      reason: quotesError
        ? 'Prezzo e cambio non aggiornati (servizio prezzi non raggiungibile): escluso dai totali'
        : `Cambio ${assetNames[sym]?.currency ?? ''}→EUR non disponibile: escluso dai totali`,
    })),
    ...missingPriceSymbols.map(sym => ({
      symbol: sym,
      name: assetNames[sym]?.name ?? sym,
      reason: quotesError
        ? 'Prezzo non aggiornato (servizio prezzi non raggiungibile): valutato al prezzo medio di carico'
        : 'Prezzo non disponibile: valutato al prezzo medio di carico',
    })),
  ];

  const scalableYield = useMemo(() => {
    return calculateCashYield(scalableCash, configuredInterestRate ?? 0, undefined, interestCapFor(scalableConfig?.interestPlan));
  }, [scalableCash, configuredInterestRate, scalableConfig?.interestPlan]);

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

  // Gruppi con esattamente gli stessi titoli di un gruppo precedente: lo diciamo, così le somme non confondono
  const duplicateOf: Record<string, string> = {};
  const seenSignatures: Record<string, string> = {};
  sections.forEach(g => {
    if (g.assets.length === 0) return;
    const signature = g.assets.map(a => `${a.symbol}:${a.totalQuantity}`).sort().join('|');
    if (seenSignatures[signature]) {
      duplicateOf[g.groupName] = seenSignatures[signature];
    } else {
      seenSignatures[signature] = g.groupName;
    }
  });

  if (isInitialLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <PortfolioSkeleton />
      </SafeAreaView>
    );
  }

  /**
   * "Oggi +€12,30 (+0,42%) · Annuo +11,22%*": prima la risposta alla domanda della sera, poi il lungo periodo.
   * Se nessun titolo ha la variazione di oggi lo diciamo ("Oggi n/d") invece di farla sparire.
   */
  const renderSecondaryMetrics = (opts: {
    annualized?: number | null;
    extrapolated?: boolean;
    daily: number;
    dailyPercent: number;
    coverage: Coverage;
    estimated?: boolean;
    large?: boolean;
  }) => {
    const hasAnnualized = opts.annualized !== undefined && opts.annualized !== null;
    const hasDaily = opts.coverage.withData > 0;
    if (opts.coverage.total === 0 && !hasAnnualized) return null;
    const partialDaily = hasDaily && opts.coverage.withData < opts.coverage.total;
    return (
      <Text style={[styles.secondaryMetrics, opts.large && styles.secondaryMetricsLarge]}>
        <Text style={styles.metricSeparator}>{dailyLabel} </Text>
        {hasDaily ? (
          <Text style={{ color: opts.daily >= 0 ? colors.positive : colors.negative }}>
            {opts.estimated ? '≈ ' : ''}{formatSignedCurrency(opts.daily)} ({signedPercent(opts.dailyPercent)})
          </Text>
        ) : (
          <Text style={styles.metricSeparator}>n/d</Text>
        )}
        {partialDaily && (
          <Text style={styles.metricSeparator}> su {opts.coverage.withData} di {opts.coverage.total} titoli</Text>
        )}
        {hasAnnualized && <Text style={styles.metricSeparator}>  ·  </Text>}
        {hasAnnualized && <Text style={styles.metricSeparator}>Annuo </Text>}
        {hasAnnualized && (
          <Text style={{ color: opts.annualized! >= 0 ? colors.positive : colors.negative }}>
            {signedPercent(opts.annualized!)}{opts.extrapolated ? '*' : ''}
          </Text>
        )}
      </Text>
    );
  };

  const hasTriggeredAlerts = triggeredAlerts.length > 0;
  const syncIconOnly = showCompactTitle && transactions.length > 0;
  const alertCount = hasTriggeredAlerts ? triggeredAlerts.length : approachingAlerts.length;

  // Una sola riga di stato: l'ora dei prezzi. La sync Scalable compare solo se non è di oggi
  const statusParts: string[] = [];
  if (quotesStatusLabel) statusParts.push(quotesStatusLabel);
  if (isScalableConnected && lastSyncLabel && lastSyncDate && !isToday(lastSyncDate)) statusParts.push(lastSyncLabel);
  const cashExcluded = scalableCash > 0 && !includeCashInTotal;
  const heroLabel = cashExcluded ? 'Valore dei titoli' : 'Bilancio totale';
  const unreachable = quotesError ? 'servizio prezzi non raggiungibile' : 'cambio non disponibile';

  /** Un solo dato per gruppo, scelto dal selettore Totale / Oggi / Annuo. */
  const renderGroupMetric = (group: GroupedPortfolio) => {
    if (activePeriod) {
      if (!periodResults) {
        return <Text style={styles.metricMissing}>{periodError ? `${activePeriod.label} n/d` : '…'}</Text>;
      }
      const r = periodResults.groups[group.groupName];
      if (!r || r.percent === null) return <Text style={styles.metricMissing}>{activePeriod.label} n/d</Text>;
      return (
        <>
          <MetricChip value={r.gain} style={{ alignSelf: 'flex-start' }}>
            {activePeriod.label} {formatSignedCurrency(r.gain)} ({signedPercent(r.percent)})
          </MetricChip>
          {r.coverage.withData < r.coverage.total && (
            <Text style={styles.footnote}>su {r.coverage.withData} di {r.coverage.total} titoli</Text>
          )}
        </>
      );
    }
    if (rowMetric === 'daily') {
      const { withData, total } = group.dailyCoverage;
      if (withData === 0) return <Text style={styles.metricMissing}>{dailyLabel} n/d</Text>;
      return (
        <>
          <MetricChip value={group.dailyChange} style={{ alignSelf: 'flex-start' }}>
            {dailyLabel} {group.dailyEstimated ? '≈ ' : ''}{formatSignedCurrency(group.dailyChange)} ({signedPercent(group.dailyChangePercent)})
          </MetricChip>
          {withData < total && <Text style={styles.footnote}>su {withData} di {total} titoli</Text>}
        </>
      );
    }
    if (rowMetric === 'annual') {
      if (group.annualizedReturn === undefined || group.annualizedReturn === null) {
        return <Text style={styles.metricMissing}>Annuo n/d</Text>;
      }
      return (
        <MetricChip value={group.annualizedReturn} style={{ alignSelf: 'flex-start' }}>
          Annuo {signedPercent(group.annualizedReturn)}{group.isAnnualizedExtrapolated ? '*' : ''}
        </MetricChip>
      );
    }
    return (
      <MetricChip value={group.profitOrLoss} style={{ alignSelf: 'flex-start' }}>
        Totale {formatSignedCurrency(group.profitOrLoss)} ({signedPercent(group.profitOrLossPercent)})
      </MetricChip>
    );
  };

  // Il selettore sta sulla stessa riga del titolo "Gruppi": si vede subito che comanda le righe sotto
  const metricSelector = (
    <View style={styles.groupsHeader}>
      <Text style={styles.groupsHeading} accessibilityRole="header">Gruppi</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.metricScroll} contentContainerStyle={styles.metricSelector} accessibilityRole="tablist" aria-label="Dato mostrato per gruppi e titoli">
      {ROW_METRICS.map(m => (
        <TouchableOpacity
          key={m.key}
          style={[styles.metricOption, rowMetric === m.key && styles.metricOptionActive]}
          onPress={() => changeRowMetric(m.key)}
          hitSlop={{ top: 4, bottom: 4 }}
          accessibilityRole="tab"
          aria-selected={rowMetric === m.key}
        >
          <Text style={[styles.metricOptionText, rowMetric === m.key && styles.metricOptionTextActive]}>
            {m.key === 'daily' ? dailyLabel : m.label}
          </Text>
        </TouchableOpacity>
      ))}
      </ScrollView>
    </View>
  );

  // Riga del periodo sotto il rendimento totale: risponde a "come è andata nell'ultimo mese?" come in Scalable
  const periodLine = activePeriod ? (() => {
    const label = activePeriod.spoken.charAt(0).toUpperCase() + activePeriod.spoken.slice(1);
    const r = periodResults?.portfolio;
    return (
      <View style={{ marginTop: 4 }}>
        <Text style={[styles.secondaryMetrics, styles.secondaryMetricsLarge]}>
          <Text style={styles.metricSeparator}>{label} </Text>
          {!periodResults ? (
            <Text style={styles.metricSeparator}>{periodError ? 'n/d: prezzi storici non raggiungibili' : periodLoading ? 'calcolo in corso…' : '…'}</Text>
          ) : !r || r.percent === null ? (
            <Text style={styles.metricSeparator}>n/d</Text>
          ) : (
            <>
              <Text style={{ color: r.gain >= 0 ? colors.positive : colors.negative }}>
                {formatSignedCurrency(r.gain)} ({signedPercent(r.percent)})
              </Text>
              {r.coverage.withData < r.coverage.total && (
                <Text style={styles.metricSeparator}> su {r.coverage.withData} di {r.coverage.total} titoli</Text>
              )}
            </>
          )}
        </Text>
        <Text style={styles.footnote}>Rendimento ponderato per il tempo: acquisti e vendite non lo alterano. Prezzi storici Yahoo Finance.</Text>
      </View>
    );
  })() : null;

  // Prezzi non aggiornati: lo diciamo subito sotto il numero che ne dipende, con il rimedio a portata di dito
  const quotesErrorLine = quotesError ? (
    <View style={styles.inlineAlert} accessibilityRole="alert">
      <AlertCircle size={16} color={colors.warning} style={{ marginRight: 8 }} />
      <Text style={styles.inlineAlertText}>
        {quotesError}
        {quotesStatusLabel
          ? ` ${quotesStatusLabel}.`
          : lastSyncLabel
            ? ` Mostro i prezzi dell'ultima sincronizzazione (${lastSyncLabel.replace(/^Scalable sincronizzato /, '')}).`
            : ' Mostro gli ultimi prezzi disponibili.'}
      </Text>
      <TouchableOpacity
        style={styles.inlineAlertAction}
        onPress={() => refreshQuotes(true)}
        accessibilityRole="button"
        accessibilityLabel="Riprova ad aggiornare i prezzi"
      >
        <Text style={styles.inlineAlertActionText}>Riprova</Text>
      </TouchableOpacity>
    </View>
  ) : null;

  const listHeader = (
    <View style={styles.header}>
      <Text style={styles.headerSubtitle}>{heroLabel}</Text>
      <CopyableText
        style={styles.headerTitle}
        valueToCopy={displayTotalValue.toString()}
        accessibilityLabel={`${heroLabel} €${formatNumber(displayTotalValue)}`}
      >
        €{formatNumber(displayTotalValue)}
      </CopyableText>
      {scalableCash > 0 && (
        <View style={styles.cashToggleRow}>
          <Text style={styles.headerNote}>
            {includeCashInTotal
              ? `Titoli €${formatNumber(globalTotalValue)} + liquidità €${formatNumber(scalableCash)}`
              : `Liquidità Scalable esclusa (€${formatNumber(scalableCash)})`}
          </Text>
          {/* La stessa scelta vale per pesi e Salute del portafoglio: un solo "patrimonio" ovunque */}
          <TouchableOpacity
            onPress={toggleIncludeCash}
            style={styles.cashToggle}
            accessibilityRole="switch"
            aria-checked={includeCashInTotal}
            accessibilityLabel="Includi la liquidità nel totale"
          >
            <Text style={styles.cashToggleText}>{includeCashInTotal ? 'Escludi' : 'Includi'}</Text>
          </TouchableOpacity>
        </View>
      )}
      {quotesErrorLine}

      {transactions.length > 0 && (
        <View style={styles.headerMetrics}>
          <Text
            style={[styles.heroReturn, { color: globalPL >= 0 ? colors.positive : colors.negative }]}
            accessibilityLabel={`Rendimento totale ${formatSignedCurrency(globalPL)}, ${signedPercent(globalPLPercent)}`}
          >
            {formatSignedCurrency(globalPL)} ({signedPercent(globalPLPercent)})
            <Text style={styles.heroReturnLabel}> in totale</Text>
          </Text>
          {renderSecondaryMetrics({
            annualized: globalAnnualizedReturn,
            extrapolated: globalIsAnnualizedExtrapolated,
            daily: globalDailyChange,
            dailyPercent: globalDailyChangePercent,
            coverage: globalDailyCoverage,
            estimated: globalDailyEstimated,
            large: true,
          })}
          {periodLine}
          {!quotesError && statusParts.length > 0 && <Text style={styles.footnote}>{statusParts.join(' · ')}</Text>}
          {incompleteItems.length > 0 && (
            <TouchableOpacity
              style={styles.incompleteRow}
              onPress={() => setIncompleteVisible(true)}
              accessibilityRole="button"
              accessibilityLabel={`Dati incompleti: ${plural(incompleteItems.length, 'titolo', 'titoli')}. Apri l'elenco`}
            >
              <AlertCircle size={14} color={colors.warning} style={{ marginRight: 6 }} />
              <Text style={styles.incompleteText}>
                Dati incompleti: {plural(incompleteItems.length, 'titolo', 'titoli')}
              </Text>
              <ChevronRight size={14} color={colors.warning} />
            </TouchableOpacity>
          )}
          <PortfolioTrendChart points={historyPoints} live={historySnapshot} />
        </View>
      )}

      {/* Liquidità Scalable: una riga, il dettaglio è nella schermata dell'integrazione */}
      {isScalableConnected && (
        <TouchableOpacity
          style={styles.cashRow}
          onPress={() => router.push('/integrations/scalable')}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Liquidità Scalable €${formatNumber(scalableCash)}${configuredInterestRate !== undefined ? `, tasso ${formatNumber(configuredInterestRate)}%, rendimento stimato ${formatNumber(scalableYield.annualNet)} euro l'anno` : ', tasso non impostato'}`}
        >
          <Coins size={18} color={colors.scalable} style={{ marginRight: 10 }} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.cashRowTitle}>Liquidità Scalable</Text>
            <Text style={styles.cashRowDetail} numberOfLines={2}>
              {configuredInterestRate !== undefined
                ? `${formatNumber(configuredInterestRate)}% annuo${scalableYield.annualNet > 0 ? ` · +€${formatNumber(scalableYield.annualNet)}/anno netti` : ''}`
                : 'Imposta il tasso del tuo piano'}
            </Text>
          </View>
          <Text style={styles.cashRowValue}>€{formatNumber(scalableCash)}</Text>
          <ChevronRight size={16} color={colors.textSecondary} style={{ marginLeft: 4 }} />
        </TouchableOpacity>
      )}

      {/* Price alert Scalable */}
      {isScalableConnected && alertCount > 0 && (
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
                <Bell size={14} color={hasTriggeredAlerts ? colors.warning : colors.scalable} />
              </View>
              <Text style={styles.priceAlertBannerTitle}>
                {hasTriggeredAlerts
                  ? plural(triggeredAlerts.length, 'avviso di prezzo raggiunto', 'avvisi di prezzo raggiunti')
                  : `${plural(approachingAlerts.length, 'avviso di prezzo vicino', 'avvisi di prezzo vicini')} alla soglia`}
              </Text>
            </View>
            <ChevronRight size={16} color={colors.textSecondary} />
          </View>

          <Text style={styles.priceAlertBannerText} numberOfLines={2}>
            {hasTriggeredAlerts
              ? `${triggeredAlerts[0].alert.name || triggeredAlerts[0].alert.symbol} ha raggiunto ${triggeredAlerts[0].calculation.targetPriceFormatted} (ora ${triggeredAlerts[0].calculation.currentPriceFormatted})`
              : `${approachingAlerts[0].alert.name || approachingAlerts[0].alert.symbol} è a ${approachingAlerts[0].calculation.distanceFormatted} dalla soglia di ${approachingAlerts[0].calculation.targetPriceFormatted}`}
            {alertCount > 1 ? ` e ${plural(alertCount - 1, 'altro', 'altri')}` : ''}
          </Text>
        </TouchableOpacity>
      )}
      {transactions.length > 0 && metricSelector}
    </View>
  );

  const listFooter = allAssets.length > 0 ? (
    <View style={styles.listFooter}>
      <HealthCheckSummaryRow healthCheck={healthCheck} onPress={() => router.push('/health-check')} />
      {globalDailyEstimated && (
        <Text style={[styles.footnote, { marginTop: 16 }]}>
          ≈ Variazione giornaliera stimata: Scalable non la fornisce, quindi applichiamo al prezzo Scalable la variazione percentuale di Yahoo Finance per lo stesso titolo.
        </Text>
      )}
      {hasExtrapolatedAnnualized && (
        <Text style={[styles.footnote, { marginTop: globalDailyEstimated ? 8 : 16 }]}>
          *Rendimento annuo (XIRR) stimato: le posizioni hanno meno di un anno di storico, quindi il dato è proiettato su base annua.
        </Text>
      )}
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
            <View
              style={styles.compactTitle}
              accessible
              accessibilityRole="header"
              accessibilityLabel={`Bilancio totale €${formatNumber(displayTotalValue)}, rendimento totale ${signedPercent(globalPLPercent)}`}
            >
              <Text style={styles.compactTitleValue} numberOfLines={1}>€{formatNumber(displayTotalValue)}</Text>
              <Text style={[styles.compactTitleDelta, { color: globalPL >= 0 ? colors.positive : colors.negative }]}>
                Tot {signedPercent(globalPLPercent)}
              </Text>
            </View>
          ) : (
            <Text style={styles.topBarTitle} accessibilityRole="header">Panoramica</Text>
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
              aria-busy={scalableSyncing}
              aria-disabled={scalableSyncing}
            >
              {scalableSyncing ? (
                <ActivityIndicator size={12} color={colors.scalable} style={{ marginRight: syncIconOnly ? 0 : 6 }} />
              ) : scalableConfig?.status === 'expired' ? (
                <AlertCircle size={12} color={colors.negative} style={{ marginRight: syncIconOnly ? 0 : 6 }} />
              ) : (
                <RefreshCw size={12} color={colors.scalable} style={{ marginRight: syncIconOnly ? 0 : 6 }} />
              )}
              {/* Con il bilancio compatto nella barra il pulsante resta solo icona, per non troncare il valore */}
              {!syncIconOnly && (
                <Text style={[
                  styles.scalableTopBarBtnText,
                  scalableConfig?.status === 'expired' && { color: colors.negative }
                ]}>
                  {scalableSyncing ? 'Sincronizzo…' : scalableConfig?.status === 'expired' ? 'Ricollega' : 'Sincronizza'}
                </Text>
              )}
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

      <View style={{ flex: 1 }}>
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
            const isDuplicate = !!duplicateOf[group.groupName];
            const isCollapsed = isDuplicate
              ? !expandedDuplicates.has(group.groupName)
              : collapsedGroups.has(group.groupName);
            const groupValueUnknown = group.fxMissingCount > 0 && group.fxMissingCount === group.dailyCoverage.total;
            const onToggle = () => toggleGroup(group.groupName, isDuplicate);
            // Una torta al 100% "Altro" non dice nulla: la mostriamo solo se le categorie sono impostate
            const hasComposition = group.currentTotalValue > 0 && group.assets.some(a => a.category && a.category !== 'Altro');
            // Nessun prezzo nel gruppo: il rendimento sarebbe 0% per costruzione, quindi non lo mostriamo
            const allUnpriced = group.dailyCoverage.total > 0 && (
              group.missingPriceCount === group.dailyCoverage.total || group.fxMissingCount === group.dailyCoverage.total
            );

            return (
              <View style={styles.groupOuterContainer}>
                {/* Intestazione: un solo controllo "apri/chiudi" accessibile; torta e valore sono controlli fratelli, non annidati */}
                <View style={styles.sectionHeaderContainer}>
                  <View style={styles.sectionHeaderTop}>
                    <TouchableOpacity
                      style={styles.sectionToggle}
                      onPress={onToggle}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={`Gruppo ${group.groupName}, ${groupValueUnknown ? 'valore non disponibile' : `€${formatNumber(group.currentTotalValue)}`}, ${plural(group.assets.length, 'titolo', 'titoli')}${isDuplicate ? `, stessi titoli di ${duplicateOf[group.groupName]}` : ''}`}
                      aria-expanded={!isCollapsed}
                    >
                      {isCollapsed ? (
                        <ChevronRight size={20} color={colors.textSecondary} style={{ marginRight: 8 }} />
                      ) : (
                        <ChevronDown size={20} color={colors.textSecondary} style={{ marginRight: 8 }} />
                      )}
                      <View style={{ flexShrink: 1 }}>
                        <Text style={styles.sectionTitle} numberOfLines={1}>{group.groupName}</Text>
                        {duplicateOf[group.groupName] && (
                          <Text style={styles.groupNote} numberOfLines={1}>Stessi titoli di {duplicateOf[group.groupName]}</Text>
                        )}
                      </View>
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
                    {/* Il valore è già nell'etichetta del controllo apri/chiudi: qui solo tocco e copia, niente doppia lettura */}
                    <CopyableText
                      style={styles.sectionValue}
                      touchableStyle={styles.sectionValueTouch}
                      hiddenFromAccessibility
                      valueToCopy={groupValueUnknown ? '' : group.currentTotalValue.toString()}
                      onPress={onToggle}
                    >
                      {groupValueUnknown ? 'n/d' : `€${formatNumber(group.currentTotalValue)}`}
                    </CopyableText>
                  </View>

                  <Pressable
                    style={styles.sectionMetrics}
                    onPress={onToggle}
                    accessible={false}
                  >
                    {allUnpriced ? (
                      <Text style={styles.footnote}>
                        {group.fxMissingCount === group.dailyCoverage.total
                          ? `Escluso dal totale: ${unreachable}`
                          : 'Prezzi non disponibili: valutato al costo'}
                      </Text>
                    ) : (
                      <>
                        {renderGroupMetric(group)}
                        {group.missingPriceCount > 0 && (
                          <Text style={styles.footnote}>
                            {plural(group.missingPriceCount, 'titolo valutato', 'titoli valutati')} al costo
                          </Text>
                        )}
                        {group.fxMissingCount > 0 && (
                          <Text style={styles.footnote}>
                            {plural(group.fxMissingCount, 'titolo escluso', 'titoli esclusi')} dal totale: {unreachable}
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
                    metric={activePeriod ? 'period' : (rowMetric as 'total' | 'daily' | 'annual')}
                    periodLabel={activePeriod?.label}
                    periodGain={!activePeriod ? undefined : !periodResults ? (periodError ? null : undefined) : (periodResults.assets[asset.symbol]?.percent == null ? null : periodResults.assets[asset.symbol]!.gain)}
                    periodPercent={periodResults?.assets[asset.symbol]?.percent ?? null}
                    dailyLabel={dailyLabel}
                    dailyEstimated={asset.dailyChangeEstimated}
                    hasPrice={asset.hasPrice}
                    hasDailyChange={asset.hasDailyChange}
                    valueInBase={asset.valueInBase}
                    category={asset.category && asset.category !== 'Altro' ? asset.category : undefined}
                    weightPercent={asset.valueInBase && displayTotalValue > 0 ? (asset.valueInBase / displayTotalValue) * 100 : null}
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
              tintColor={colors.textSecondary}
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

      {/* Stato della sincronizzazione: galleggia sopra la lista, così non sposta quello che stai leggendo */}
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
            accessibilityRole={syncBanner.sessionExpired ? 'button' : 'text'}
            accessibilityHint={syncBanner.sessionExpired ? 'Apre la schermata per ricollegare Scalable' : undefined}
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

      </View>

      {/* Elenco dei titoli fuori dai calcoli, con il motivo */}
      <Modal
        visible={incompleteVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIncompleteVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setIncompleteVisible(false)} accessibilityLabel="Chiudi">
          <View style={[styles.modalContent, { alignItems: 'stretch' }]} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle} accessibilityRole="header">Dati incompleti</Text>
            {incompleteItems.map(item => (
              <View key={item.symbol} style={styles.incompleteItem}>
                <Text style={styles.incompleteItemName}>{item.name}</Text>
                <Text style={styles.incompleteItemReason}>{item.reason}</Text>
              </View>
            ))}
            <TouchableOpacity style={[styles.closeButton, { alignSelf: 'center' }]} onPress={() => setIncompleteVisible(false)} accessibilityRole="button">
              <Text style={styles.closeButtonText}>Chiudi</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

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
    width: 44,
    height: 44,
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
    backgroundColor: withAlpha(colors.scalable, 0.12),
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
    position: 'absolute',
    top: 8,
    left: 16,
    right: 16,
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
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
    backgroundColor: colors.scalableSurface,
    borderColor: withAlpha(colors.scalable, 0.35),
  },
  syncBannerSuccess: {
    backgroundColor: colors.card,
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
  // Bottone a contorno: il testo chiaro su rosso pieno non arrivava a 3:1 nel tema scuro
  syncRetryBtn: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.negative,
    marginLeft: 8,
  },
  syncRetryBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  bannerClose: {
    width: 44,
    height: 44,
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
    marginTop: 0,
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
  secondaryMetricsLarge: {
    fontSize: 14,
    marginTop: 6,
  },
  groupsHeader: {
    gap: 8,
    marginTop: 24,
  },
  metricScroll: {
    flexGrow: 0,
    marginHorizontal: -20,
  },
  groupsHeading: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  metricSelector: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 20,
  },
  metricOption: {
    minHeight: 40,
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: 8,
  },
  metricOptionActive: {
    backgroundColor: colors.card,
    borderColor: colors.text,
  },
  metricOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  metricOptionTextActive: {
    color: colors.text,
  },
  metricMissing: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  incompleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    minHeight: 44,
    marginTop: 2,
  },
  incompleteText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.warning,
    marginRight: 2,
  },
  incompleteItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  incompleteItemName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  incompleteItemReason: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
    marginTop: 2,
  },
  cashToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  cashToggle: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  cashToggleText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    textDecorationLine: 'underline',
  },
  heroReturn: {
    fontSize: 18,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  heroReturnLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  cashRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 16,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: withAlpha(colors.scalable, 0.25),
  },
  cashRowTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  cashRowDetail: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  cashRowValue: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
    marginLeft: 8,
  },
  groupNote: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
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
    minHeight: 44,
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
  // Il nome del gruppo non deve pesare più del suo valore
  sectionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '600',
    flexShrink: 1,
  },
  sectionValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  sectionValueTouch: {
    minHeight: 44,
    justifyContent: 'center',
    paddingLeft: 8,
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
  priceAlertBanner: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
  },
  // Soglia raggiunta: ambra, più evidente; in avvicinamento: il teal calmo dell'integrazione
  priceAlertBannerTriggeredBorder: {
    borderColor: colors.warning,
  },
  priceAlertBannerApproachingBorder: {
    borderColor: withAlpha(colors.scalable, 0.314),
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
    backgroundColor: withAlpha(colors.warning, 0.125),
  },
  priceAlertBannerIconApproaching: {
    backgroundColor: withAlpha(colors.scalable, 0.125),
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
