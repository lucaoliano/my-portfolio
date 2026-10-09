import { ThemeColors, withAlpha } from '../theme/colors';
import React, { useEffect, useState, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, RefreshControl, Modal, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LogOut, Search, ChevronRight, ChevronDown, PieChart as PieChartIcon, Settings, Menu, X, User, Calculator, Cpu, Coins, Bell, Receipt, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { signOut } from 'firebase/auth';

import { useAppTheme } from '../theme/ThemeContext';
import { formatNumber, formatSignedCurrency } from '../utils/formatters';
import { AssetCard } from '../components/AssetCard';
import { MetricChip } from '../components/MetricChip';
import { PieChartComponent } from '../components/PieChartComponent';
import { PortfolioSkeleton } from '../components/PortfolioSkeleton';
import { CopyableText } from '../components/CopyableText';
import { getQuotes, YahooQuote } from '../services/yahooFinance';
import { auth, db } from '../config/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { GroupedPortfolio, AggregatedAsset } from '../types';

import { useTransactions } from '../hooks/useTransactions';
import { useAssetCategories } from '../hooks/useAssetCategories';
import { useUserSettings } from '../hooks/useUserSettings';
import { useScalableConfig } from '../hooks/useScalableConfig';
import { useScalablePriceAlerts } from '../hooks/useScalablePriceAlerts';
import { useScalableSavingsPlans } from '../hooks/useScalableSavingsPlans';
import { calculatePortfolioAggregation } from '../utils/portfolioAggregator';
import { calculateCashYield, ScalableInterestPlanId } from '../utils/cashInterest';
import { getTriggeredAlerts, getApproachingAlerts } from '../utils/priceAlerts';
import { calculatePortfolioHealthCheck } from '../utils/portfolioHealthCheck';
import { PortfolioHealthCheckCard } from '../components/PortfolioHealthCheckCard';
import { syncScalablePortfolio } from '../services/scalableMcp';

export const PortfolioScreen = () => {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);
  const router = useRouter();
  const userId = auth.currentUser?.uid;

  // Custom Hooks
  const { transactions, loading: txLoading } = useTransactions(userId);
  const { assetCategories } = useAssetCategories(userId);
  const { settings, loading: settingsLoading } = useUserSettings(userId);
  const { config: scalableConfig } = useScalableConfig(userId);
  const { alerts: scalableAlerts } = useScalablePriceAlerts(userId);
  const { plans: scalableSavingsPlans } = useScalableSavingsPlans(userId);

  // Local State
  const [quotes, setQuotes] = useState<Record<string, YahooQuote>>({});
  const [quotesLoading, setQuotesLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [compositionGroup, setCompositionGroup] = useState<GroupedPortfolio | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);

  // Scalable Sync Feedback & State
  const isScalableConnected = scalableConfig?.enabled && scalableConfig?.status === 'connected';
  const [scalableSyncing, setScalableSyncing] = useState(false);
  const [syncBanner, setSyncBanner] = useState<{
    message: string;
    type: 'syncing' | 'success' | 'error';
  } | null>(null);
  const autoSyncTriggeredRef = useRef(false);
  const bannerTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
        ? 'Sincronizzazione automatica con Scalable Capital in corso...' 
        : 'Sincronizzazione con Scalable Capital in corso...'
    });

    try {
      const res = await syncScalablePortfolio({ targetGroup: 'Scalable' });
      // Fetch fresh quotes to pick up latest prices updated in scalable_quotes
      fetchPortfolioQuotes(true);

      const parts: string[] = [];
      if (res.importedCount > 0) {
        parts.push(`${res.importedCount} ${res.importedCount === 1 ? 'nuova transazione' : 'nuove transazioni'}`);
      }
      if (res.deduplicatedCount && res.deduplicatedCount > 0) {
        parts.push(`${res.deduplicatedCount} duplicate unificate`);
      }
      
      const successDetail = parts.length > 0 ? parts.join(', ') : 'portafoglio e liquidità aggiornati';
      setSyncBanner({
        type: 'success',
        message: `Scalable sincronizzato: ${successDetail}`
      });

      bannerTimeoutRef.current = setTimeout(() => {
        setSyncBanner(null);
      }, 4500);
    } catch (err: unknown) {
      const error = err as Error;
      const msg = error.message || 'Errore durante la sincronizzazione con Scalable';
      
      if (
        msg.toLowerCase().includes('missing or invalid credentials') ||
        msg.toLowerCase().includes('scaduta') ||
        msg.toLowerCase().includes('unauthenticated') ||
        msg.toLowerCase().includes('token refresh fallito')
      ) {
        setSyncBanner({
          type: 'error',
          message: 'Sessione Scalable scaduta: tocca qui per ricollegare il conto'
        });
      } else {
        setSyncBanner({
          type: 'error',
          message: `Errore sincronizzazione: ${msg}`
        });
      }

      bannerTimeoutRef.current = setTimeout(() => {
        setSyncBanner(null);
      }, 7000);
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

  const fetchPortfolioQuotes = async (showRefreshIndicator = false) => {
    const uniqueSymbols = Array.from(new Set(transactions.map(t => t.symbol)));
    
    if (uniqueSymbols.length === 0) {
      setQuotes({});
      setQuotesLoading(false);
      setRefreshing(false);
      return;
    }

    if (showRefreshIndicator) setRefreshing(true);
    else setQuotesLoading(true);

    try {
      // 1. First, check if any symbols have real-time quotes from Scalable Capital
      const scalableQuotesMap: Record<string, YahooQuote> = {};
      if (userId) {
        try {
          const sqSnap = await getDoc(doc(db, 'portfolios', userId, 'settings', 'scalable_quotes'));
          if (sqSnap.exists()) {
            const sqData = sqSnap.data();
            for (const [sym, q] of Object.entries(sqData)) {
              const item = q as {
                symbol?: string;
                shortName?: string;
                longName?: string;
                regularMarketPrice?: number;
                currency?: string;
              };
              if (item.regularMarketPrice && item.regularMarketPrice > 0) {
                scalableQuotesMap[sym] = {
                  symbol: sym,
                  shortName: item.shortName || sym,
                  longName: item.longName || sym,
                  regularMarketPrice: item.regularMarketPrice,
                  regularMarketChangePercent: 0,
                  regularMarketChange: 0,
                  currency: item.currency || 'EUR',
                };
              }
            }
            // Bridge transactions: if a transaction has an ISIN that exists in Scalable quotes, map it to its symbol
            transactions.forEach(t => {
              if (t.isin && scalableQuotesMap[t.isin] && !scalableQuotesMap[t.symbol]) {
                scalableQuotesMap[t.symbol] = {
                  ...scalableQuotesMap[t.isin],
                  symbol: t.symbol,
                  shortName: t.name || scalableQuotesMap[t.isin].shortName || t.symbol,
                };
              }
              if (t.symbol && scalableQuotesMap[t.symbol] && t.isin && !scalableQuotesMap[t.isin]) {
                scalableQuotesMap[t.isin] = {
                  ...scalableQuotesMap[t.symbol],
                  symbol: t.isin,
                };
              }
            });
          }
        } catch (sqErr) {
          console.warn('Error reading scalable quotes:', sqErr);
        }
      }

      // 2. Symbols not covered by Scalable can be fetched from Yahoo Finance (via getQuotes Cloud Function)
      const symbolsToFetch = uniqueSymbols.filter(s => !scalableQuotesMap[s]);
      let yahooQuotes: YahooQuote[] = [];
      if (symbolsToFetch.length > 0) {
        yahooQuotes = await getQuotes(symbolsToFetch);
      }

      const quotesMap: Record<string, YahooQuote> = { ...scalableQuotesMap };
      yahooQuotes.forEach(q => {
        if (!quotesMap[q.symbol]) {
          quotesMap[q.symbol] = q;
        }
      });
      setQuotes(quotesMap);
    } catch (error) {
      console.error("Errore fetch quotes:", error);
    } finally {
      setQuotesLoading(false);
      setRefreshing(false);
    }
  };

  // Fetch quotes whenever transactions change (if not already loading initially)
  useEffect(() => {
    if (txLoading) return;
    
    const timeoutId = setTimeout(() => {
      if (transactions.length > 0) {
        fetchPortfolioQuotes();
      } else {
        setQuotesLoading(false);
      }
    }, 0);
    
    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, txLoading]); 

  // Auto-Sync with Scalable Capital MCP at startup if enabled
  useEffect(() => {
    if (!userId || !scalableConfig) return;
    if (autoSyncTriggeredRef.current) return;

    if (scalableConfig.enabled && scalableConfig.status === 'connected' && scalableConfig.autoSync) {
      autoSyncTriggeredRef.current = true;
      const lastSync = scalableConfig.lastSyncedAt ? new Date(scalableConfig.lastSyncedAt).getTime() : 0;
      const now = Date.now();
      // Sync if more than 1 minute since last sync (prevents redundant sync loops on fast reloads)
      if (now - lastSync > 60 * 1000) {
        handleSyncScalable(true);
      }
    }
  }, [userId, scalableConfig]);

  const onRefresh = () => {
    fetchPortfolioQuotes(true);
    if (isScalableConnected) {
      handleSyncScalable(false);
    }
  };

  // Aggregation Logic (Moved to Utility)
  const aggregation = useMemo(() => {
    return calculatePortfolioAggregation(transactions, quotes, assetCategories, settings);
  }, [transactions, quotes, assetCategories, settings]);

  const {
    groupedData,
    globalTotalValue,
    globalPL,
    globalPLPercent,
    globalDailyChange,
    globalDailyChangePercent,
    globalAnnualizedReturn,
    globalIsAnnualizedExtrapolated
  } = aggregation;

  // Cash & Yield Tracker Data (Punto 2)
  const scalableCash = isScalableConnected ? (scalableConfig?.cashBalance || 0) : 0;
  const scalableInterestRate = scalableConfig?.interestRate ?? 2.6;
  const includeCashInTotal = scalableConfig?.includeCashInTotal ?? false;
  const displayTotalValue = (includeCashInTotal && scalableCash > 0) 
    ? (globalTotalValue + scalableCash) 
    : globalTotalValue;

  const lastSyncLabel = useMemo(() => {
    if (!scalableConfig?.lastSyncedAt) return 'Non ancora sincronizzato';
    try {
      const d = new Date(scalableConfig.lastSyncedAt);
      const isToday = d.toDateString() === new Date().toDateString();
      const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return isToday 
        ? `Sincronizzato oggi alle ${timeStr}` 
        : `Sincronizzato il ${d.toLocaleDateString([], { day: '2-digit', month: '2-digit' })} alle ${timeStr}`;
    } catch {
      return 'Sincronizzato di recente';
    }
  }, [scalableConfig?.lastSyncedAt]);
  const scalableYield = useMemo(() => {
    return calculateCashYield(scalableCash, scalableInterestRate);
  }, [scalableCash, scalableInterestRate]);

  // Health Check & Insights Engine (Punto 5)
  const allAssets = useMemo(() => {
    const map = new Map<string, AggregatedAsset>();
    groupedData.forEach(g => {
      g.assets.forEach(a => {
        if (!map.has(a.symbol)) {
          map.set(a.symbol, { ...a });
        } else {
          const existing = map.get(a.symbol)!;
          existing.currentTotalValue += a.currentTotalValue;
          existing.totalQuantity += a.totalQuantity;
          existing.totalInvested += a.totalInvested;
        }
      });
    });
    return Array.from(map.values());
  }, [groupedData]);

  const healthCheck = useMemo(() => {
    return calculatePortfolioHealthCheck(
      allAssets,
      scalableCash,
      (scalableConfig?.interestPlan as ScalableInterestPlanId) || 'prime',
      scalableInterestRate,
      scalableSavingsPlans
    );
  }, [allAssets, scalableCash, scalableConfig?.interestPlan, scalableInterestRate, scalableSavingsPlans]);

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

  const isInitialLoading = (txLoading || settingsLoading || quotesLoading) && (transactions.length === 0 || Object.keys(quotes).length === 0);

  if (isInitialLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <PortfolioSkeleton />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity style={{ padding: 4, marginRight: 12 }} onPress={() => setMenuVisible(true)}>
            <Menu size={28} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>Dashboard</Text>
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
            >
              {scalableSyncing ? (
                <ActivityIndicator size={12} color={colors.scalable} style={{ marginRight: 5 }} />
              ) : scalableConfig?.status === 'expired' ? (
                <AlertCircle size={12} color={colors.negative} style={{ marginRight: 5 }} />
              ) : (
                <RefreshCw size={12} color={colors.scalable} style={{ marginRight: 5 }} />
              )}
              <Text style={[
                styles.scalableTopBarBtnText,
                scalableConfig?.status === 'expired' && { color: colors.negative }
              ]}>
                {scalableSyncing ? 'Sincronizzo...' : scalableConfig?.status === 'expired' ? 'Ricollega' : 'Scalable'}
              </Text>
            </TouchableOpacity>
          )}

          {refreshing && (
            <ActivityIndicator size="small" color={colors.text} style={{ marginRight: 12 }} />
          )}
          <TouchableOpacity style={{ padding: 4 }} onPress={() => router.push('/search')}>
            <Search size={24} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Scalable Sync Status Banner */}
      {syncBanner && (
        <View style={[
          styles.syncBanner,
          syncBanner.type === 'syncing' && styles.syncBannerSyncing,
          syncBanner.type === 'success' && styles.syncBannerSuccess,
          syncBanner.type === 'error' && styles.syncBannerError,
        ]}>
          <TouchableOpacity 
            style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
            onPress={() => {
              if (syncBanner.type === 'error') {
                router.push('/integrations/scalable');
              }
            }}
            activeOpacity={syncBanner.type === 'error' ? 0.7 : 1}
          >
            {syncBanner.type === 'syncing' ? (
              <ActivityIndicator size="small" color={colors.scalable} style={{ marginRight: 10 }} />
            ) : syncBanner.type === 'success' ? (
              <CheckCircle2 size={18} color={colors.positive} style={{ marginRight: 10 }} />
            ) : (
              <AlertCircle size={18} color={colors.negative} style={{ marginRight: 10 }} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.syncBannerText}>
                {syncBanner.message}
              </Text>
            </View>
          </TouchableOpacity>

          {syncBanner.type === 'error' && (
            <TouchableOpacity
              style={styles.syncRetryBtn}
              onPress={() => handleSyncScalable(false)}
            >
              <Text style={styles.syncRetryBtnText}>Riprova</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={{ padding: 6, marginLeft: 4 }}
            onPress={() => {
              clearBannerTimeout();
              setSyncBanner(null);
            }}
          >
            <X size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.header}>
        <View>
          <Text style={styles.headerSubtitle}>Bilancio Totale</Text>
          <CopyableText style={styles.headerTitle} valueToCopy={displayTotalValue.toString()}>
            €{formatNumber(displayTotalValue)}
          </CopyableText>
          {includeCashInTotal && scalableCash > 0 && (
            <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 4 }}>
              Investito: €{formatNumber(globalTotalValue)} • Liquidità: €{formatNumber(scalableCash)}
            </Text>
          )}
          {transactions.length > 0 && (
            <View style={{ flexDirection: 'column', alignItems: 'flex-start', marginTop: 12 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
                <MetricChip value={globalPL} style={{ marginRight: 8, marginBottom: 8 }}>
                    Tot: {formatSignedCurrency(globalPL)} ({globalPL >= 0 ? '+' : ''}{formatNumber(globalPLPercent)}%)
                </MetricChip>
                {globalAnnualizedReturn !== undefined && globalAnnualizedReturn !== null && (
                  <MetricChip value={globalAnnualizedReturn} style={{ marginRight: 8, marginBottom: 8 }}>
                      Ann: {globalAnnualizedReturn >= 0 ? '+' : ''}{formatNumber(globalAnnualizedReturn)}%{globalIsAnnualizedExtrapolated ? '*' : ''}
                  </MetricChip>
                )}
                {/* Nascosto se nessuna quotazione ha la variazione giornaliera (es. prezzi Scalable) */}
                {(globalDailyChange !== 0 || globalDailyChangePercent !== 0) && (
                  <MetricChip value={globalDailyChange} style={{ marginBottom: 8 }}>
                      Oggi: {formatSignedCurrency(globalDailyChange)} ({globalDailyChange >= 0 ? '+' : ''}{formatNumber(globalDailyChangePercent)}%)
                  </MetricChip>
                )}
              </View>
              {globalIsAnnualizedExtrapolated && globalAnnualizedReturn !== null && (
                <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>
                  *Tasso annuo (XIRR) estrapolato su orizzonte &lt; 1 anno
                </Text>
              )}
            </View>
          )}

          {/* Liquidità Scalable Remunerata Card */}
          {isScalableConnected && (
            <TouchableOpacity 
              style={styles.cashYieldBanner}
              onPress={() => router.push('/integrations/scalable')}
              activeOpacity={0.7}
            >
              <View style={styles.cashYieldHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                  <View style={styles.cashYieldIcon}>
                    <Coins size={14} color={colors.scalable} />
                  </View>
                  <Text style={styles.cashYieldTitle}>Liquidità Scalable</Text>
                  <View style={styles.rateBadge}>
                    <Text style={styles.rateBadgeText}>{formatNumber(scalableInterestRate)}% annuo</Text>
                  </View>
                </View>
                <ChevronRight size={16} color={colors.textSecondary} />
              </View>
              {scalableCash > 0 && (
                <View style={styles.cashYieldDetailsRow}>
                  <Text style={styles.cashBalanceText}>
                    Saldo libero: <Text style={{ color: colors.text, fontWeight: '700' }}>€{formatNumber(scalableCash)}</Text>
                  </Text>
                  {scalableYield.annualNet > 0 && (
                    <Text style={styles.cashEstText}>
                      Rendimento: <Text style={{ color: colors.positive, fontWeight: '700' }}>+€{formatNumber(scalableYield.annualNet)}/anno</Text> netti
                    </Text>
                  )}
                </View>
              )}
              <View style={styles.cashYieldFooterRow}>
                <Text style={styles.cashYieldSyncTimeText}>
                  {lastSyncLabel}
                </Text>
                <TouchableOpacity
                  style={styles.cashYieldSyncBtn}
                  onPress={(e) => {
                    e.stopPropagation();
                    handleSyncScalable(false);
                  }}
                  disabled={scalableSyncing}
                >
                  {scalableSyncing ? (
                    <ActivityIndicator size={11} color={colors.scalable} style={{ marginRight: 4 }} />
                  ) : (
                    <RefreshCw size={11} color={colors.scalable} style={{ marginRight: 4 }} />
                  )}
                  <Text style={styles.cashYieldSyncBtnText}>
                    {scalableSyncing ? 'Sincronizzo...' : 'Sincronizza ora'}
                  </Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          )}

          {/* Scalable Price Alert Banner (Punto 4: Price Alert Sincronizzati) */}
          {isScalableConnected && (triggeredAlerts.length > 0 || approachingAlerts.length > 0) && (
            <TouchableOpacity
              style={[
                styles.priceAlertBanner,
                triggeredAlerts.length > 0 ? styles.priceAlertBannerTriggeredBorder : styles.priceAlertBannerApproachingBorder
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
            >
              <View style={styles.priceAlertBannerHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                  <View style={[
                    styles.priceAlertBannerIcon,
                    triggeredAlerts.length > 0 ? styles.priceAlertBannerIconTriggered : styles.priceAlertBannerIconApproaching
                  ]}>
                    <Bell size={14} color={triggeredAlerts.length > 0 ? colors.positive : colors.warning} />
                  </View>
                  <Text style={styles.priceAlertBannerTitle}>
                    {triggeredAlerts.length > 0
                      ? `${triggeredAlerts.length} Price Alert Scalable Raggiunto!`
                      : `${approachingAlerts.length} Price Alert in Avvicinamento`}
                  </Text>
                </View>
                <ChevronRight size={16} color={colors.textSecondary} />
              </View>

              <Text style={styles.priceAlertBannerText} numberOfLines={1}>
                {triggeredAlerts.length > 0
                  ? `${triggeredAlerts[0].alert.symbol} ha toccato la soglia di ${triggeredAlerts[0].calculation.targetPriceFormatted} (Attuale: ${triggeredAlerts[0].calculation.currentPriceFormatted})`
                  : `${approachingAlerts[0].alert.symbol} dista solo ${approachingAlerts[0].calculation.distanceFormatted} dal target di ${approachingAlerts[0].calculation.targetPriceFormatted}`}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {transactions.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>Il tuo portafoglio è vuoto.</Text>
          <Text style={styles.emptySubText}>Cerca un titolo per aggiungerlo.</Text>
        </View>
      ) : (
        <FlatList
          data={sections}
          keyExtractor={(item) => item.groupName}
          ListHeaderComponent={
            allAssets.length > 0 ? (
              <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 }}>
                <PortfolioHealthCheckCard healthCheck={healthCheck} />
              </View>
            ) : null
          }
          renderItem={({ item: group }) => {
            const isCollapsed = collapsedGroups.has(group.groupName);
            
            let groupComposition: {label: string, value: number}[] = [];
            if (group.assets.length > 0 && group.currentTotalValue > 0) {
              const categoryTotals: Record<string, number> = {};
              group.assets.forEach(a => {
                const cat = a.category || 'Altro';
                categoryTotals[cat] = (categoryTotals[cat] || 0) + a.currentTotalValue;
              });

              groupComposition = Object.entries(categoryTotals).map(([cat, total]) => ({
                label: cat,
                value: Number(((total / group.currentTotalValue) * 100).toFixed(2))
              })).sort((a, b) => b.value - a.value).filter(item => item.value > 0);
            }

            return (
              <View style={styles.groupOuterContainer}>
                <TouchableOpacity 
                  style={styles.sectionHeaderContainer}
                  onPress={() => {
                    toggleGroup(group.groupName);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.sectionHeaderTop}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      {isCollapsed ? (
                        <ChevronRight size={20} color={colors.textSecondary} style={{ marginRight: 8 }} />
                      ) : (
                        <ChevronDown size={20} color={colors.textSecondary} style={{ marginRight: 8 }} />
                      )}
                      <Text style={styles.sectionTitle}>{group.groupName}</Text>
                    </View>
                    
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      {groupComposition.length > 0 && (
                        <TouchableOpacity 
                          onPress={(e) => { e.stopPropagation(); setCompositionGroup(group); }} 
                          style={{ marginRight: 12, padding: 4 }}
                        >
                          <PieChartIcon size={20} color={colors.primary} />
                        </TouchableOpacity>
                      )}
                      <CopyableText style={styles.sectionValue} valueToCopy={group.currentTotalValue.toString()}>€{formatNumber(group.currentTotalValue)}</CopyableText>
                    </View>
                  </View>
                  
                  <View style={styles.sectionMetricsRow}>
                      <MetricChip value={group.profitOrLoss} style={{ marginRight: 8, marginBottom: 4 }}>
                          Tot: {formatSignedCurrency(group.profitOrLoss)} ({group.profitOrLoss >= 0 ? '+' : ''}{formatNumber(group.profitOrLossPercent)}%)
                      </MetricChip>
                      {group.annualizedReturn !== undefined && group.annualizedReturn !== null && (
                        <MetricChip value={group.annualizedReturn} style={{ marginRight: 8, marginBottom: 4 }}>
                            Ann: {group.annualizedReturn >= 0 ? '+' : ''}{formatNumber(group.annualizedReturn)}%{group.isAnnualizedExtrapolated ? '*' : ''}
                        </MetricChip>
                      )}
                      {(group.dailyChange !== 0 || group.dailyChangePercent !== 0) && (
                        <MetricChip value={group.dailyChange} style={{ marginBottom: 4 }}>
                            Oggi: {formatSignedCurrency(group.dailyChange)} ({group.dailyChange >= 0 ? '+' : ''}{formatNumber(group.dailyChangePercent)}%)
                        </MetricChip>
                      )}
                  </View>
                </TouchableOpacity>

                {!isCollapsed && group.assets.length > 0 && (
                  <View style={styles.groupAssetsInner}>
                    {group.assets.map((asset, index) => (
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
                        isFirst={index === 0}
                        isLast={index === group.assets.length - 1}
                        onPress={() => router.push({ pathname: '/asset/[id]', params: { id: asset.symbol, symbol: asset.symbol, name: asset.name, currentPrice: asset.currentPrice, currency: asset.currency, groupName: group.groupName, dailyChange: asset.dailyChange, dailyChangePercent: asset.dailyChangePercent } })}
                      />
                    ))}
                  </View>
                )}
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
            // Fix per iOS PWA
            if (e.nativeEvent.contentOffset.y < -70 && !refreshing) {
              onRefresh();
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
        <Pressable style={styles.modalOverlay} onPress={() => setCompositionGroup(null)}>
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>Composizione: {compositionGroup?.groupName}</Text>
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
            <TouchableOpacity style={styles.closeButton} onPress={() => setCompositionGroup(null)}>
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
        <Pressable style={styles.drawerOverlay} onPress={() => setMenuVisible(false)}>
          <View style={styles.drawerContent} onStartShouldSetResponder={() => true}>
            <View style={styles.menuHeader}>
              <Text style={styles.menuTitle}>Menu</Text>
              <TouchableOpacity onPress={() => setMenuVisible(false)} style={{ padding: 4 }}>
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity 
              style={styles.menuItem} 
              onPress={() => {
                setMenuVisible(false);
                router.push('/profile');
              }}
            >
              <User size={24} color={colors.text} style={{ marginRight: 16 }} />
              <Text style={styles.menuItemText}>Profilo</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.menuItem} 
              onPress={() => {
                setMenuVisible(false);
                router.push('/pac-calculator' as never);
              }}
            >
              <Calculator size={24} color={colors.text} style={{ marginRight: 16 }} />
              <Text style={styles.menuItemText}>Simulatore PAC</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.menuItem} 
              onPress={() => {
                setMenuVisible(false);
                router.push('/tax-report' as never);
              }}
            >
              <Receipt size={24} color={colors.text} style={{ marginRight: 16 }} />
              <Text style={styles.menuItemText}>Zainetto Fiscale</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.menuItem} 
              onPress={() => {
                setMenuVisible(false);
                router.push('/manage-groups');
              }}
            >
              <Settings size={24} color={colors.text} style={{ marginRight: 16 }} />
              <Text style={styles.menuItemText}>Impostazioni Gruppi</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.menuItem} 
              onPress={() => {
                setMenuVisible(false);
                router.push('/integrations' as never);
              }}
            >
              <Cpu size={24} color={colors.text} style={{ marginRight: 16 }} />
              <Text style={styles.menuItemText}>Integrazioni Broker</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.menuItem} 
              onPress={() => {
                setMenuVisible(false);
                router.push('/settings' as never);
              }}
            >
              <Settings size={24} color={colors.text} style={{ marginRight: 16 }} />
              <Text style={styles.menuItemText}>Impostazioni</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.menuItem, { borderBottomWidth: 0 }]} 
              onPress={() => {
                setMenuVisible(false);
                handleLogout();
              }}
            >
              <LogOut size={24} color={colors.negative} style={{ marginRight: 16 }} />
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
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  topBarTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: 'bold',
  },
  scalableTopBarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: withAlpha(colors.scalable, 0.4),
    backgroundColor: withAlpha(colors.scalable, 0.1),
    marginRight: 10,
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
    fontSize: 12,
    fontWeight: '700',
    color: colors.scalable,
  },
  syncBanner: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    paddingVertical: 10,
    paddingHorizontal: 14,
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
    backgroundColor: withAlpha(colors.negative, 0.12),
    borderColor: withAlpha(colors.negative, 0.35),
  },
  syncBannerText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  syncRetryBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: withAlpha(colors.negative, 0.2),
    marginRight: 6,
  },
  syncRetryBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.negative,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
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
  globalPL: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  searchButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptySubText: {
    color: colors.textSecondary,
    fontSize: 15,
  },
  listContent: {
    paddingBottom: 20,
    minHeight: '101%',
  },
  groupOuterContainer: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: 'transparent',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  groupAssetsInner: {
  },
  sectionHeaderContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    backgroundColor: 'transparent',
  },
  sectionHeaderTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: 'bold',
  },
  sectionValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  sectionMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    paddingLeft: 28,
    marginTop: 8,
    justifyContent: 'flex-start',
  },
  reorderButton: {
    padding: 8,
    marginLeft: 8,
    backgroundColor: colors.card,
    borderRadius: 8,
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
    paddingVertical: 10,
    paddingHorizontal: 24,
    backgroundColor: colors.border,
    borderRadius: 8,
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
    marginBottom: 24,
  },
  menuTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: 'bold',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuItemText: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '500',
  },
  cashYieldBanner: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 12,
    marginTop: 14,
    borderWidth: 1,
    borderColor: withAlpha(colors.scalable, 0.251),
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
    fontSize: 13,
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
    fontSize: 10,
    fontWeight: '700',
  },
  cashYieldDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  cashBalanceText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  cashEstText: {
    fontSize: 12,
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
    fontSize: 11,
    color: colors.textSecondary,
  },
  cashYieldSyncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: withAlpha(colors.scalable, 0.12),
  },
  cashYieldSyncBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.scalable,
  },
  priceAlertBanner: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 12,
    marginTop: 10,
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
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  priceAlertBannerText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginLeft: 32,
  },
});

export default PortfolioScreen;
