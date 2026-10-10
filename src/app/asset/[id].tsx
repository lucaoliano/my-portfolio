import { ThemeColors, withAlpha } from '../../theme/colors';
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Modal, Pressable, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, ChevronRight, Plus, Copy, Bell, TrendingDown, TrendingUp } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { useAppTheme } from '../../theme/ThemeContext';
import { db, auth } from '../../config/firebase';
import { collection, query, where, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { Transaction } from '../../types';
import { formatNumber, formatDate, formatSignedCurrency, getCurrencySymbol } from '../../utils/formatters';
import { CopyableText } from '../../components/CopyableText';
import { MetricChip } from '../../components/MetricChip';
import { calculatePosition } from '../../utils/portfolioAggregator';
import { usePortfolioOverview } from '../../hooks/usePortfolioOverview';
import { calculateTransactionsXIRR } from '../../utils/xirr';
import { getQuotes, YahooQuote } from '../../services/yahooFinance';
import { useScalablePriceAlerts } from '../../hooks/useScalablePriceAlerts';
import { calculateAlertStatus, getAlertsForSymbol } from '../../utils/priceAlerts';
import { ASSET_CLASSES, AssetCategoryInfo, resolveAssetCategory } from '../../constants/assetClasses';

export const AssetDetailsScreen = () => {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);
  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };
  const router = useRouter();
  const params = useLocalSearchParams<{
    id?: string;
    symbol?: string;
    name?: string;
    currentPrice?: string;
    hasPrice?: string;
    currency?: string;
    groupName?: string;
    dailyChange?: string;
    dailyChangePercent?: string;
  }>();

  const effectiveSymbol = params.symbol || params.id || '';
  const initialName = params.name || '';
  const initialCurrentPrice = Number(params.currentPrice ?? 0);
  const initialDailyChange = Number(params.dailyChange ?? 0);
  const initialDailyChangePercent = Number(params.dailyChangePercent ?? 0);
  const initialCurrency = params.currency || '';
  const groupName = params.groupName;

  const [liveQuote, setLiveQuote] = useState<YahooQuote | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const userId = auth.currentUser?.uid;
  const { alerts: allScalableAlerts } = useScalablePriceAlerts(userId);
  const assetAlerts = getAlertsForSymbol(allScalableAlerts, effectiveSymbol);
  const [categoryInfo, setCategoryInfo] = useState<AssetCategoryInfo | null>(null);
  const [scalableAssetData, setScalableAssetData] = useState<{ currentPrice?: number; currency?: string; fromQuotes?: boolean } | null>(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);

  useEffect(() => {
    if (!effectiveSymbol) return;
    let isMounted = true;
    getQuotes([effectiveSymbol]).then(quotes => {
      if (isMounted && quotes && quotes.length > 0) {
        setLiveQuote(quotes[0]);
      }
    }).catch(err => {
      console.error('Error fetching quote in AssetDetailsScreen:', err);
    });
    return () => {
      isMounted = false;
    };
  }, [effectiveSymbol]);

  useEffect(() => {
    const userId = auth.currentUser?.uid;
    if (!userId || !effectiveSymbol) return;

    const unsubscribeAsset = onSnapshot(doc(db, 'portfolios', userId, 'assets', effectiveSymbol), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setCategoryInfo(resolveAssetCategory(data));
        if (data.currentPrice || data.regularMarketPrice) {
          // scalable_quotes è la stessa fonte usata dalla dashboard: se c'è, ha la precedenza,
          // altrimenti dashboard e dettaglio mostrano valori diversi a seconda di quale snapshot arriva per ultimo.
          setScalableAssetData(prev => prev?.fromQuotes ? prev : {
            currentPrice: Number(data.currentPrice || data.regularMarketPrice),
            currency: data.currency || 'EUR',
          });
        }
      } else {
        setCategoryInfo(null);
      }
    });

    const unsubscribeQuotes = onSnapshot(doc(db, 'portfolios', userId, 'settings', 'scalable_quotes'), (sqSnap) => {
      if (sqSnap.exists()) {
        const sqData = sqSnap.data();
        const targetIsin = transactions.find(t => t.isin)?.isin;
        const q = sqData[effectiveSymbol] || (targetIsin ? sqData[targetIsin] : undefined);
        if (q && q.regularMarketPrice > 0) {
          setScalableAssetData({
            currentPrice: Number(q.regularMarketPrice),
            currency: q.currency || 'EUR',
            fromQuotes: true,
          });
          setLiveQuote({
            symbol: effectiveSymbol,
            shortName: q.shortName || effectiveSymbol,
            longName: q.longName || effectiveSymbol,
            regularMarketPrice: Number(q.regularMarketPrice),
            regularMarketChangePercent: 0,
            regularMarketChange: 0,
            currency: q.currency || 'EUR',
          });
        }
      }
    });

    return () => {
      unsubscribeAsset();
      unsubscribeQuotes();
    };
  }, [effectiveSymbol, transactions]);

  const displayName = initialName || liveQuote?.longName || liveQuote?.shortName || transactions.find(t => t.name)?.name || effectiveSymbol;

  const handleSelectCategory = async (cat: string) => {
    const userId = auth.currentUser?.uid;
    if (!userId || !effectiveSymbol) return;
    try {
      await setDoc(doc(db, 'portfolios', userId, 'assets', effectiveSymbol), {
        category: cat,
        // Scelta dell'utente: la sincronizzazione Scalable non la sovrascrive più
        categorySource: 'user',
        symbol: effectiveSymbol,
        name: displayName
      }, { merge: true });
      setShowCategoryModal(false);
    } catch (e) {
      console.error('Error saving category:', e);
    }
  };

  const [activeGroups, setActiveGroups] = useState<string[]>([]);

  useEffect(() => {
    const userId = auth.currentUser?.uid;
    if (!userId || !effectiveSymbol) {
      const timer = setTimeout(() => setLoading(false), 0);
      return () => clearTimeout(timer);
    }

    const q = query(
      collection(db, 'portfolios', userId, 'transactions'),
      where('symbol', '==', effectiveSymbol)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const txs: Transaction[] = [];
      const qtyByGroup: Record<string, number> = {};

      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const txGroups = data.groups || (data.group ? [data.group] : ['Generale']);
        
        const type = data.type || 'BUY';
        const qty = data.quantity || 0;
        
        txGroups.forEach((g: string) => {
          if (!qtyByGroup[g]) qtyByGroup[g] = 0;
          if (type === 'BUY') {
            qtyByGroup[g] += qty;
          } else {
            qtyByGroup[g] -= qty;
          }
        });

        if (!groupName || txGroups.includes(groupName)) {
          txs.push({ id: docSnap.id, ...data } as Transaction);
        }
      });
      
      const active = Object.entries(qtyByGroup)
        .filter(([_g, q]) => q > 0)
        .map(([g]) => g);
      setActiveGroups(active);

      txs.sort((a, b) => {
        if (a.date > b.date) return -1;
        if (a.date < b.date) return 1;
        return 0;
      });
      setTransactions(txs);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [effectiveSymbol, groupName]);

  const { totalQuantity, totalInvested, averagePrice } = React.useMemo(() => {
    return calculatePosition(transactions);
  }, [transactions]);

  const displayCurrency = scalableAssetData?.currency ||
    (transactions.some(t => t.source === 'scalable_mcp' || t.currency === 'EUR') ? 'EUR' : undefined) ||
    (initialCurrency && initialCurrency !== 'USD' ? initialCurrency : undefined) ||
    liveQuote?.currency ||
    'EUR';
  const currencySymbol = getCurrencySymbol(displayCurrency);

  // Prezzo reale da Scalable o Yahoo; altrimenti il titolo è valutato al costo e lo diciamo
  const hasRealPrice = !!scalableAssetData?.currentPrice || !!liveQuote?.regularMarketPrice || params.hasPrice !== '0';
  const numericCurrentPrice = scalableAssetData?.currentPrice ??
    liveQuote?.regularMarketPrice ??
    (initialCurrentPrice > 0 ? initialCurrentPrice : averagePrice);
  // regularMarketChange è per singola quota, mentre il parametro dalla dashboard è già sul totale della posizione
  const numericDailyChange = liveQuote?.regularMarketChange !== undefined
    ? liveQuote.regularMarketChange * totalQuantity
    : initialDailyChange;
  const numericDailyChangePercent = liveQuote?.regularMarketChangePercent ?? initialDailyChangePercent;

  const currentValue = totalQuantity * numericCurrentPrice;
  const profitOrLoss = currentValue - totalInvested;
  const profitOrLossPercent = totalInvested > 0 ? (profitOrLoss / totalInvested) * 100 : 0;

  const assetXirr = React.useMemo(() => {
    return calculateTransactionsXIRR(transactions, currentValue);
  }, [transactions, currentValue]);

  // Titoli in valuta estera: guadagno in euro e quanto ne dipende dal cambio (serve il cambio degli acquisti)
  const { aggregation } = usePortfolioOverview(auth.currentUser?.uid);
  const overviewAsset = aggregation.globalAssets.find(a => a.symbol === effectiveSymbol);
  const isForeignAsset = !!overviewAsset && overviewAsset.currency !== 'EUR';

  const isPositive = profitOrLoss >= 0;
  const changeSign = isPositive ? '+' : '';

  const isDailyPositive = numericDailyChange >= 0;
  const dailyChangeSign = isDailyPositive ? '+' : '';

  const handleCopy = async () => {
    await Clipboard.setStringAsync(effectiveSymbol);
    showAlert('Copiato', 'Ticker copiato negli appunti!');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.canGoBack() ? router.back() : router.replace('/')}>
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle} numberOfLines={1}>{displayName}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
            <Text style={styles.headerSubtitle}>{effectiveSymbol}</Text>
            <TouchableOpacity onPress={handleCopy} style={{ marginLeft: 6, padding: 4 }}>
              <Copy size={14} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>
        <TouchableOpacity 
          style={styles.addButton} 
          onPress={() => {
            const groupsParam = activeGroups.length > 0 ? activeGroups.join(',') : (groupName || 'Generale');
            router.push({ pathname: '/add-transaction', params: { symbol: effectiveSymbol, name: displayName, preselectedGroups: groupsParam } })
          }}
        >
          <Plus size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.overview}>
        <CopyableText style={styles.overviewValue} valueToCopy={currentValue.toString()}>{currencySymbol}{formatNumber(currentValue)}</CopyableText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }}>
          {hasRealPrice ? (
            <>
              <MetricChip value={profitOrLoss} size="lg" style={{ marginRight: 8, marginBottom: 8 }}>
                Totale {formatSignedCurrency(profitOrLoss, currencySymbol)} ({changeSign}{formatNumber(profitOrLossPercent)}%)
              </MetricChip>
              {assetXirr.annualizedPercent !== null && (
                <MetricChip value={assetXirr.annualizedPercent} size="lg" style={{ marginRight: 8, marginBottom: 8 }}>
                  Annuo {assetXirr.annualizedPercent >= 0 ? '+' : ''}{formatNumber(assetXirr.annualizedPercent)}%{assetXirr.isExtrapolated ? '*' : ''}
                </MetricChip>
              )}
              {(numericDailyChange !== 0 || numericDailyChangePercent !== 0) && (
                <MetricChip value={numericDailyChange} size="lg" style={{ marginBottom: 8 }}>
                  Oggi {formatSignedCurrency(numericDailyChange, currencySymbol)} ({dailyChangeSign}{formatNumber(numericDailyChangePercent)}%)
                </MetricChip>
              )}
            </>
          ) : (
            <Text style={styles.unpricedNote}>Prezzo non disponibile: valore calcolato al prezzo medio di carico</Text>
          )}
        </View>
        {hasRealPrice && isForeignAsset && (
          <Text style={styles.fxNote}>
            {overviewAsset!.profitOrLossEur !== null && overviewAsset!.profitOrLossEur !== undefined && overviewAsset!.fxEffectEur !== null && overviewAsset!.fxEffectEur !== undefined
              ? `In euro ${formatSignedCurrency(overviewAsset!.profitOrLossEur)}, di cui ${formatSignedCurrency(overviewAsset!.fxEffectEur)} dovuti al cambio`
              : 'Guadagno in euro non calcolabile: aggiungi il cambio del giorno agli acquisti in valuta'}
          </Text>
        )}
        {hasRealPrice && assetXirr.isExtrapolated && assetXirr.annualizedPercent !== null && (
          <Text style={{ fontSize: 12, color: colors.textSecondary, textAlign: 'center', marginTop: 2, marginBottom: 8 }}>
            *Stima annua (XIRR) su {assetXirr.holdingDays} {assetXirr.holdingDays === 1 ? 'giorno' : 'giorni'} di storico, meno di un anno
          </Text>
        )}
      </View>

      <View style={styles.metricsRow}>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Quantità</Text>
          <CopyableText style={styles.metricValue} valueToCopy={totalQuantity.toString()}>{totalQuantity}</CopyableText>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Prezzo Medio</Text>
          <CopyableText style={styles.metricValue} valueToCopy={averagePrice.toString()}>{currencySymbol}{formatNumber(averagePrice)}</CopyableText>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Prezzo Attuale</Text>
          <CopyableText style={styles.metricValue} valueToCopy={numericCurrentPrice.toString()}>{currencySymbol}{formatNumber(numericCurrentPrice)}</CopyableText>
        </View>
      </View>

      {/* Classe di attivo: una riga ben visibile, non un link nascosto nell'intestazione */}
      <TouchableOpacity
        style={styles.categoryRow}
        onPress={() => setShowCategoryModal(true)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Classe di attivo: ${categoryInfo ? `${categoryInfo.category}${categoryInfo.source === 'scalable' ? ', proposta da Scalable' : ''}` : 'da impostare'}. Cambia`}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.categoryLabel}>Classe di attivo</Text>
          {categoryInfo?.source === 'scalable' && (
            <Text style={styles.categoryHint}>Proposta da Scalable: tocca per confermare o cambiare</Text>
          )}
        </View>
        <Text style={[styles.categoryValue, !categoryInfo && styles.categoryValueMissing]}>
          {categoryInfo?.category ?? 'Da impostare'}
        </Text>
        <ChevronRight size={16} color={colors.textSecondary} style={{ marginLeft: 4 }} />
      </TouchableOpacity>

      {/* Scalable Price Alerts (Punto 4: Price Alert Sincronizzati) */}
      {assetAlerts.map(alert => {
        const calc = calculateAlertStatus(alert, numericCurrentPrice);
        return (
          <View key={alert.id} style={styles.alertCard}>
            <View style={styles.alertHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <View style={styles.alertIconBadge}>
                  <Bell size={13} color={colors.scalable} />
                </View>
                <Text style={styles.alertTitle}>Alert Scalable</Text>
                <View style={[
                  styles.alertStatusBadge,
                  calc.statusBadge === 'triggered' && styles.alertStatusTriggered,
                  calc.statusBadge === 'approaching' && styles.alertStatusApproaching,
                  calc.statusBadge === 'active' && styles.alertStatusActive,
                ]}>
                  <Text style={[
                    styles.alertStatusText,
                    calc.statusBadge === 'triggered' && { color: colors.warning },
                    calc.statusBadge === 'approaching' && { color: colors.warning },
                    calc.statusBadge === 'active' && { color: colors.textSecondary },
                  ]}>
                    {calc.statusLabel}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.alertBodyRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                {alert.direction === 'BELOW' ? (
                  <TrendingDown size={15} color={colors.textSecondary} style={{ marginRight: 6 }} />
                ) : (
                  <TrendingUp size={15} color={colors.textSecondary} style={{ marginRight: 6 }} />
                )}
                <Text style={styles.alertThresholdText}>
                  {calc.directionLabel}: <Text style={{ fontWeight: '700', color: colors.text }}>{calc.targetPriceFormatted}</Text>
                </Text>
              </View>
              <Text style={[styles.alertDistanceText, calc.isTriggered && { color: colors.warning }]}>
                {calc.distanceDescription}
              </Text>
            </View>

            {alert.note && (
              <Text style={styles.alertNoteText}>{alert.note}</Text>
            )}
          </View>
        );
      })}

      <Text style={styles.sectionTitle}>Transazioni</Text>
      
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.positive} />
        </View>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={item => item.id!}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const isSell = item.type === 'SELL';
            const txInvested = item.quantity * item.purchasePrice;
            const txCurrent = item.quantity * numericCurrentPrice;
            const txPL = txCurrent - txInvested;
            const txPLPercent = txInvested > 0 ? (txPL / txInvested) * 100 : 0;
            const txIsPositive = txPL >= 0;
            
            return (
              <TouchableOpacity 
                style={[styles.transactionCard, isSell && { borderLeftWidth: 4, borderLeftColor: colors.textSecondary }]}
                onPress={() => router.push({ pathname: '/edit-transaction', params: {
                  id: item.id,
                  symbol: effectiveSymbol,
                  name: displayName,
                  quantity: item.quantity,
                  purchasePrice: item.purchasePrice,
                  date: item.date,
                  type: item.type || 'BUY',
                  groups: item.groups || (item.group ? [item.group] : ['Generale'])
                }})}
              >
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={styles.transactionDate}>{formatDate(item.date)}</Text>
                    {item.source === 'scalable_mcp' && (
                      <View style={{ backgroundColor: withAlpha(colors.scalable, 0.125), borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1, marginLeft: 6 }}>
                        <Text style={{ color: colors.scalable, fontSize: 11, fontWeight: '700', letterSpacing: 0.3 }}>SCALABLE</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.transactionQuantity}>
                    {isSell ? 'Vendita: ' : ''}{formatNumber(item.quantity)} quote a {currencySymbol}{formatNumber(item.purchasePrice)}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flexDirection: 'column', alignItems: 'flex-end' }}>
                    {isSell ? (
                      <Text style={[styles.transactionPrice, { color: colors.textSecondary }]}>{currencySymbol}{formatNumber(txInvested)}</Text>
                    ) : (
                      <>
                        <Text style={styles.transactionPrice}>{currencySymbol}{formatNumber(txCurrent)}</Text>
                        <Text style={[styles.transactionTotal, { color: txIsPositive ? colors.positive : colors.negative, fontWeight: '600' }]}>
                          {txIsPositive ? '+' : ''}{formatNumber(txPL)} ({txIsPositive ? '+' : ''}{formatNumber(txPLPercent)}%)
                        </Text>
                      </>
                    )}
                  </View>
                  <View style={{ justifyContent: 'center', marginLeft: 8 }}>
                    <ChevronRight size={20} color={colors.textSecondary} />
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Modal Categoria */}
      <Modal
        visible={showCategoryModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowCategoryModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowCategoryModal(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle} accessibilityRole="header">Classe di attivo</Text>
            {ASSET_CLASSES.map(cat => (
              <TouchableOpacity
                key={cat}
                style={[styles.modalOption, categoryInfo?.category === cat && styles.modalOptionSelected]}
                onPress={() => handleSelectCategory(cat)}
                accessibilityRole="radio"
                aria-checked={categoryInfo?.category === cat}
              >
                <Text style={[styles.modalOptionText, categoryInfo?.category === cat && styles.modalOptionTextSelected]}>
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  addButton: {
    padding: 8,
    marginRight: -8,
  },
  headerTitleContainer: {
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: 12,
  },
  fxNote: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 6,
    fontVariant: ['tabular-nums'],
  },
  headerTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    marginHorizontal: 20,
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.card,
  },
  categoryLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  categoryHint: {
    fontSize: 12,
    lineHeight: 16,
    color: colors.textSecondary,
    marginTop: 2,
  },
  categoryValue: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginLeft: 12,
  },
  categoryValueMissing: {
    color: colors.warning,
  },
  overview: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
    fontSize: 16,
  },
  unpricedNote: {
    fontSize: 13,
    color: colors.warning,
    textAlign: 'center',
    marginBottom: 8,
  },
  overviewValue: {
    color: colors.text,
    fontSize: 40,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  metricsRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  metricCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  metricLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    marginBottom: 8,
  },
  metricValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  changeGroupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    marginHorizontal: 20,
    padding: 16,
    borderRadius: 12,
    marginBottom: 32,
  },
  changeGroupText: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 12,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: 'bold',
    marginHorizontal: 20,
    marginBottom: 16,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  transactionCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  transactionDate: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  transactionQuantity: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  transactionPrice: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  transactionTotal: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
    width: '80%',
    maxWidth: 400,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalOption: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalOptionSelected: {
    backgroundColor: withAlpha(colors.primary, 0.125),
    borderRadius: 8,
    borderBottomWidth: 0,
    marginBottom: 4,
    marginTop: 4,
    paddingHorizontal: 12,
  },
  modalOptionText: {
    color: colors.text,
    fontSize: 16,
    textAlign: 'center',
  },
  modalOptionTextSelected: {
    color: colors.primary,
    fontWeight: 'bold',
  },
  alertCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: withAlpha(colors.scalable, 0.188),
  },
  alertHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  alertIconBadge: {
    backgroundColor: withAlpha(colors.scalable, 0.125),
    borderRadius: 6,
    padding: 4,
    marginRight: 6,
  },
  alertTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.scalable,
    marginRight: 8,
  },
  alertStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  alertStatusTriggered: {
    backgroundColor: withAlpha(colors.warning, 0.125),
  },
  alertStatusApproaching: {
    backgroundColor: withAlpha(colors.warning, 0.125),
  },
  alertStatusActive: {
    backgroundColor: colors.inputBackground,
  },
  alertStatusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  alertBodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  alertThresholdText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  alertDistanceText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  alertNoteText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginTop: 4,
  }
});

export default AssetDetailsScreen;
