import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ChevronLeft,
  RefreshCw,
  Receipt,
  ShieldCheck,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Calendar,
  Info,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  CheckCircle2,
  BookOpen,
} from 'lucide-react-native';

import { useAppTheme } from '../theme/ThemeContext';
import { ThemeColors } from '../theme/colors';
import { auth } from '../config/firebase';
import { useTransactions } from '../hooks/useTransactions';
import { useScalableTaxReport } from '../hooks/useScalableTaxReport';
import { formatNumber } from '../utils/formatters';
import { TaxLossBucket, RealizedTrade, TaxOptimizationTip } from '../types';

type ActiveTab = 'buckets' | 'trades' | 'strategies';

export default function TaxReportScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = getStyles(colors);

  const [activeTab, setActiveTab] = useState<ActiveTab>('buckets');

  const userId = auth.currentUser?.uid;
  const { transactions } = useTransactions(userId);
  const {
    taxReport,
    tips,
    loading,
    refreshing,
    refreshTaxReport,
  } = useScalableTaxReport(userId, transactions);

  const currentYear = new Date().getFullYear();

  const activeBuckets = useMemo(() => {
    return (taxReport?.buckets || []).filter((b) => b.status === 'ACTIVE');
  }, [taxReport]);

  const hasExpiringLosses = (taxReport?.lossesExpiringThisYear || 0) > 0;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Zainetto Fiscale</Text>
          <Text style={styles.headerSubtitle}>Minusvalenze & Compensazioni Fiscali</Text>
        </View>
        <TouchableOpacity
          onPress={refreshTaxReport}
          style={styles.refreshButton}
          disabled={refreshing}
          activeOpacity={0.7}
        >
          {refreshing ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <RefreshCw size={20} color={colors.textSecondary} />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Main KPI Hero Cards */}
        <View style={styles.heroRow}>
          {/* Active Minusvalenze Card */}
          <View style={[styles.kpiCard, styles.kpiCardHighlight]}>
            <View style={styles.kpiHeader}>
              <Receipt size={18} color={colors.primary} />
              <View style={styles.badgeSource}>
                <Text style={styles.badgeSourceText}>
                  {taxReport?.source === 'mcp'
                    ? 'SCALABLE MCP'
                    : taxReport?.source === 'hybrid'
                    ? 'IBRIDO MCP'
                    : 'CALCOLO FIFO'}
                </Text>
              </View>
            </View>
            <Text style={styles.kpiLabel}>Zainetto Fiscale Totale</Text>
            <Text style={styles.kpiValue}>
              €{formatNumber(taxReport?.totalActiveLosses || 0)}
            </Text>
            <Text style={styles.kpiSubtext}>Minusvalenze compensabili attive</Text>
          </View>

          {/* Potential Tax Savings Card */}
          <View style={styles.kpiCard}>
            <View style={styles.kpiHeader}>
              <ShieldCheck size={18} color="#10B981" />
              <View style={[styles.badgeSource, { backgroundColor: '#10B98120' }]}>
                <Text style={[styles.badgeSourceText, { color: '#10B981' }]}>
                  ALIQUOTA 26%
                </Text>
              </View>
            </View>
            <Text style={styles.kpiLabel}>Credito Fiscale Potenziale</Text>
            <Text style={[styles.kpiValue, { color: '#10B981' }]}>
              €{formatNumber(taxReport?.potentialTaxSavings || 0)}
            </Text>
            <Text style={styles.kpiSubtext}>Risparmio d&apos;imposta su future plusvalenze</Text>
          </View>
        </View>

        {/* Expiring Losses Alert Banner (if any) */}
        {hasExpiringLosses && (
          <View style={styles.urgentBanner}>
            <AlertTriangle size={24} color="#F59E0B" style={{ marginRight: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.urgentBannerTitle}>
                Attenzione: Minusvalenze in Scadenza il 31/12/{currentYear}
              </Text>
              <Text style={styles.urgentBannerText}>
                Hai €{formatNumber(taxReport?.lossesExpiringThisYear || 0)} di minusvalenze generate
                nel {currentYear - 4} che scadranno entro fine anno se non compensate con plusvalenze da
                azioni singole, ETC o certificates.
              </Text>
            </View>
          </View>
        )}

        {/* Realized P&L Current Year Strip */}
        <View style={styles.currentYearStrip}>
          <View style={styles.currentYearCol}>
            <Text style={styles.stripLabel}>Plusvalenze Realizzate {currentYear}</Text>
            <View style={styles.stripRow}>
              <ArrowUpRight size={14} color="#10B981" />
              <Text style={[styles.stripValue, { color: '#10B981' }]}>
                +€{formatNumber(taxReport?.realizedGainsCurrentYear || 0)}
              </Text>
            </View>
          </View>
          <View style={styles.stripDivider} />
          <View style={styles.currentYearCol}>
            <Text style={styles.stripLabel}>Minusvalenze Realizzate {currentYear}</Text>
            <View style={styles.stripRow}>
              <ArrowDownRight size={14} color="#EF4444" />
              <Text style={[styles.stripValue, { color: '#EF4444' }]}>
                -€{formatNumber(taxReport?.realizedLossesCurrentYear || 0)}
              </Text>
            </View>
          </View>
          <View style={styles.stripDivider} />
          <View style={styles.currentYearCol}>
            <Text style={styles.stripLabel}>Netto Realizzato</Text>
            <View style={styles.stripRow}>
              {(taxReport?.netRealizedCurrentYear || 0) >= 0 ? (
                <TrendingUp size={14} color="#10B981" />
              ) : (
                <TrendingDown size={14} color="#EF4444" />
              )}
              <Text
                style={[
                  styles.stripValue,
                  {
                    color:
                      (taxReport?.netRealizedCurrentYear || 0) >= 0 ? '#10B981' : '#EF4444',
                  },
                ]}
              >
                €{formatNumber(taxReport?.netRealizedCurrentYear || 0)}
              </Text>
            </View>
          </View>
        </View>

        {/* Tab Switcher */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'buckets' && styles.tabButtonActive]}
            onPress={() => setActiveTab('buckets')}
            activeOpacity={0.7}
          >
            <Clock
              size={16}
              color={activeTab === 'buckets' ? colors.primary : colors.textSecondary}
            />
            <Text
              style={[
                styles.tabButtonText,
                activeTab === 'buckets' && styles.tabButtonTextActive,
              ]}
            >
              Scadenziario ({activeBuckets.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'trades' && styles.tabButtonActive]}
            onPress={() => setActiveTab('trades')}
            activeOpacity={0.7}
          >
            <Receipt
              size={16}
              color={activeTab === 'trades' ? colors.primary : colors.textSecondary}
            />
            <Text
              style={[
                styles.tabButtonText,
                activeTab === 'trades' && styles.tabButtonTextActive,
              ]}
            >
              Trade Chiusi ({taxReport?.realizedTrades?.length || 0})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'strategies' && styles.tabButtonActive]}
            onPress={() => setActiveTab('strategies')}
            activeOpacity={0.7}
          >
            <Sparkles
              size={16}
              color={activeTab === 'strategies' ? colors.primary : colors.textSecondary}
            />
            <Text
              style={[
                styles.tabButtonText,
                activeTab === 'strategies' && styles.tabButtonTextActive,
              ]}
            >
              Strategie ({tips.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Tab 1: Scadenziario Annuale Buckets */}
        {activeTab === 'buckets' && (
          <View style={styles.tabContent}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Zainetto Fiscale per Anno Fiscale</Text>
              <Text style={styles.sectionHelper}>Regola quadriennale italiana (Anno + 4)</Text>
            </View>

            {loading ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ marginVertical: 32 }} />
            ) : (taxReport?.buckets || []).length === 0 ? (
              <View style={styles.emptyCard}>
                <CheckCircle2 size={36} color="#10B981" />
                <Text style={styles.emptyTitle}>Nessuna minusvalenza registrata</Text>
                <Text style={styles.emptySubtitle}>
                  Non hai perdite fiscali pregresse da compensare o il tuo zainetto è vuoto.
                </Text>
              </View>
            ) : (
              (taxReport?.buckets || []).map((bucket) => (
                <BucketCard key={bucket.yearCreated} bucket={bucket} colors={colors} styles={styles} />
              ))
            )}
          </View>
        )}

        {/* Tab 2: Operazioni Chiuse Realized Trades */}
        {activeTab === 'trades' && (
          <View style={styles.tabContent}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Storico Operazioni Concluse (FIFO)</Text>
              <Text style={styles.sectionHelper}>
                Calcolo plusvalenze e minusvalenze deterministico First-In, First-Out
              </Text>
            </View>

            {loading ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ marginVertical: 32 }} />
            ) : (taxReport?.realizedTrades || []).length === 0 ? (
              <View style={styles.emptyCard}>
                <Receipt size={36} color={colors.textSecondary} />
                <Text style={styles.emptyTitle}>Nessun trade di vendita registrato</Text>
                <Text style={styles.emptySubtitle}>
                  Quando venderai una posizione (o sincronizzerai vendite da Scalable MCP), il calcolo
                  FIFO mostrerà qui il guadagno o la perdita realizzata.
                </Text>
              </View>
            ) : (
              (taxReport?.realizedTrades || []).map((trade) => (
                <TradeCard key={trade.id} trade={trade} colors={colors} styles={styles} />
              ))
            )}
          </View>
        )}

        {/* Tab 3: Strategie & Guida Fiscale */}
        {activeTab === 'strategies' && (
          <View style={styles.tabContent}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Strategie di Ottimizzazione Fiscale</Text>
              <Text style={styles.sectionHelper}>
                Regole e consigli matematici per non sprecare minusvalenze
              </Text>
            </View>

            {/* Tips generated deterministically */}
            {tips.map((tip) => (
              <TipCard key={tip.id} tip={tip} colors={colors} styles={styles} />
            ))}

            {/* Reference Table: Che cosa compensa le minusvalenze */}
            <View style={styles.guideCard}>
              <View style={styles.guideHeader}>
                <BookOpen size={18} color={colors.primary} />
                <Text style={styles.guideTitle}>Guida Rapida: Compensabilità Fiscale</Text>
              </View>

              <View style={styles.guideRow}>
                <View style={[styles.guidePill, { backgroundColor: '#10B98120' }]}>
                  <Text style={[styles.guidePillText, { color: '#10B981' }]}>COMPENSA</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.guideRowTitle}>Redditi Diversi</Text>
                  <Text style={styles.guideRowDesc}>
                    Azioni singole, ETC su materie prime (es. Oro fisico), Certificati di investimento,
                    Crypto, opzioni e derivati.
                  </Text>
                </View>
              </View>

              <View style={styles.guideDivider} />

              <View style={styles.guideRow}>
                <View style={[styles.guidePill, { backgroundColor: '#EF444420' }]}>
                  <Text style={[styles.guidePillText, { color: '#EF4444' }]}>NON COMPENSA</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.guideRowTitle}>Redditi di Capitale (ETF UCITS & Cedole)</Text>
                  <Text style={styles.guideRowDesc}>
                    Plusvalenze da ETF armonizzati e dividendi. Vengono tassati al 26% separatamente senza
                    poter scalare lo zainetto pregresso. Nota: vendere un ETF in perdita genera comunque
                    minusvalenze!
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------- Bucket Card Component ----------------
function BucketCard({
  bucket,
  colors,
  styles,
}: {
  bucket: TaxLossBucket;
  colors: ThemeColors;
  styles: ReturnType<typeof getStyles>;
}) {
  const percentCompensated =
    bucket.initialAmount > 0
      ? Math.min(100, Math.round((bucket.compensatedAmount / bucket.initialAmount) * 100))
      : 0;

  const isExpiring = bucket.isExpiringThisYear && bucket.status === 'ACTIVE';

  return (
    <View style={[styles.bucketCard, isExpiring && styles.bucketCardExpiring]}>
      <View style={styles.bucketTopRow}>
        <View style={styles.bucketYearBadge}>
          <Calendar size={14} color={colors.primary} />
          <Text style={styles.bucketYearText}>Generata: {bucket.yearCreated}</Text>
        </View>

        <View
          style={[
            styles.statusPill,
            bucket.status === 'COMPENSATED'
              ? { backgroundColor: '#10B98120' }
              : bucket.status === 'EXPIRED'
              ? { backgroundColor: '#6B728020' }
              : isExpiring
              ? { backgroundColor: '#F59E0B20' }
              : { backgroundColor: '#3B82F620' },
          ]}
        >
          <Text
            style={[
              styles.statusPillText,
              bucket.status === 'COMPENSATED'
                ? { color: '#10B981' }
                : bucket.status === 'EXPIRED'
                ? { color: '#6B7280' }
                : isExpiring
                ? { color: '#F59E0B' }
                : { color: '#3B82F6' },
            ]}
          >
            {bucket.status === 'COMPENSATED'
              ? 'COMPLETATA'
              : bucket.status === 'EXPIRED'
              ? 'SCADUTA'
              : isExpiring
              ? 'IN SCADENZA'
              : 'ATTIVA'}
          </Text>
        </View>
      </View>

      <View style={styles.bucketDetailsGrid}>
        <View style={styles.bucketDetailItem}>
          <Text style={styles.bucketDetailLabel}>Iniziale</Text>
          <Text style={styles.bucketDetailVal}>€{formatNumber(bucket.initialAmount)}</Text>
        </View>

        <View style={styles.bucketDetailItem}>
          <Text style={styles.bucketDetailLabel}>Compensato</Text>
          <Text style={[styles.bucketDetailVal, { color: '#10B981' }]}>
            €{formatNumber(bucket.compensatedAmount)}
          </Text>
        </View>

        <View style={styles.bucketDetailItem}>
          <Text style={styles.bucketDetailLabel}>Residuo da Usare</Text>
          <Text style={[styles.bucketDetailVal, { color: colors.text, fontWeight: '700' }]}>
            €{formatNumber(bucket.remainingAmount)}
          </Text>
        </View>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <View style={[styles.progressBar, { width: `${percentCompensated}%` }]} />
      </View>

      <View style={styles.bucketFooterRow}>
        <Text style={styles.bucketExpiryText}>
          Scadenza limite: 31 Dicembre {bucket.yearExpires}
        </Text>
        <Text style={styles.bucketPercentText}>{percentCompensated}% compensato</Text>
      </View>
    </View>
  );
}

// ---------------- Trade Card Component ----------------
function TradeCard({
  trade,
  colors,
  styles,
}: {
  trade: RealizedTrade;
  colors: ThemeColors;
  styles: ReturnType<typeof getStyles>;
}) {
  const pnlPercent =
    trade.costBasis > 0
      ? Math.round((trade.realizedGainOrLoss / trade.costBasis) * 10000) / 100
      : 0;

  const dateStr = new Date(trade.date).toLocaleDateString('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  return (
    <View style={styles.tradeCard}>
      <View style={styles.tradeTopRow}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={styles.tradeSymbol}>{trade.symbol}</Text>
          <Text style={styles.tradeName} numberOfLines={1}>
            {trade.name}
          </Text>
        </View>

        <View style={styles.tradePnlContainer}>
          <Text
            style={[
              styles.tradePnlValue,
              { color: trade.realizedGainOrLoss >= 0 ? '#10B981' : '#EF4444' },
            ]}
          >
            {trade.realizedGainOrLoss >= 0 ? '+' : ''}€{formatNumber(trade.realizedGainOrLoss)}
          </Text>
          <Text
            style={[
              styles.tradePnlPercent,
              { color: trade.realizedGainOrLoss >= 0 ? '#10B981' : '#EF4444' },
            ]}
          >
            {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
          </Text>
        </View>
      </View>

      <View style={styles.tradeDivider} />

      <View style={styles.tradeMetaRow}>
        <Text style={styles.tradeMetaText}>Data: {dateStr}</Text>
        <Text style={styles.tradeMetaText}>Qtà: {trade.quantity}</Text>
        <Text style={styles.tradeMetaText}>PMC: €{formatNumber(trade.costBasis / (trade.quantity || 1))}</Text>
        <Text style={styles.tradeMetaText}>Vendita: €{formatNumber(trade.salePrice)}</Text>
      </View>
    </View>
  );
}

// ---------------- Tip Card Component ----------------
function TipCard({
  tip,
  colors,
  styles,
}: {
  tip: TaxOptimizationTip;
  colors: ThemeColors;
  styles: ReturnType<typeof getStyles>;
}) {
  const isHigh = tip.priority === 'HIGH';

  return (
    <View
      style={[
        styles.tipCard,
        isHigh && { borderColor: '#F59E0B', borderWidth: 1.5 },
      ]}
    >
      <View style={styles.tipHeader}>
        {tip.type === 'EXPIRING_LOSSES' ? (
          <AlertTriangle size={18} color="#F59E0B" />
        ) : tip.type === 'HARVESTING_OPPORTUNITY' ? (
          <Sparkles size={18} color={colors.primary} />
        ) : (
          <Info size={18} color="#3B82F6" />
        )}
        <Text style={styles.tipTitle}>{tip.title}</Text>
      </View>
      <Text style={styles.tipDesc}>{tip.description}</Text>
      {tip.impactEur !== undefined && (
        <View style={styles.tipImpactBadge}>
          <Text style={styles.tipImpactText}>
            Impatto fiscale stimato: €{formatNumber(tip.impactEur)}
          </Text>
        </View>
      )}
    </View>
  );
}

// ---------------- Styles ----------------
const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.card,
    },
    backButton: {
      padding: 8,
      borderRadius: 8,
    },
    headerTitleContainer: {
      flex: 1,
      marginHorizontal: 8,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
    },
    headerSubtitle: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    refreshButton: {
      padding: 8,
      borderRadius: 8,
    },
    scrollContent: {
      padding: 16,
      paddingBottom: 48,
    },
    heroRow: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 16,
    },
    kpiCard: {
      flex: 1,
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    kpiCardHighlight: {
      borderColor: colors.primary + '50',
    },
    kpiHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    badgeSource: {
      backgroundColor: colors.primary + '20',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
    },
    badgeSourceText: {
      fontSize: 9,
      fontWeight: '700',
      color: colors.primary,
    },
    kpiLabel: {
      fontSize: 12,
      color: colors.textSecondary,
      marginBottom: 4,
    },
    kpiValue: {
      fontSize: 20,
      fontWeight: '800',
      color: colors.text,
      marginBottom: 4,
    },
    kpiSubtext: {
      fontSize: 11,
      color: colors.textSecondary,
      lineHeight: 14,
    },
    urgentBanner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: '#F59E0B15',
      borderColor: '#F59E0B',
      borderWidth: 1,
      borderRadius: 12,
      padding: 14,
      marginBottom: 16,
    },
    urgentBannerTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: '#D97706',
      marginBottom: 4,
    },
    urgentBannerText: {
      fontSize: 12,
      color: colors.text,
      lineHeight: 17,
    },
    currentYearStrip: {
      flexDirection: 'row',
      backgroundColor: colors.card,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 16,
      alignItems: 'center',
    },
    currentYearCol: {
      flex: 1,
      alignItems: 'center',
    },
    stripDivider: {
      width: 1,
      height: 28,
      backgroundColor: colors.border,
      marginHorizontal: 8,
    },
    stripLabel: {
      fontSize: 10,
      color: colors.textSecondary,
      marginBottom: 4,
      textAlign: 'center',
    },
    stripRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    stripValue: {
      fontSize: 13,
      fontWeight: '700',
    },
    tabContainer: {
      flexDirection: 'row',
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 4,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 16,
      gap: 4,
    },
    tabButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      paddingHorizontal: 6,
      borderRadius: 8,
      gap: 6,
    },
    tabButtonActive: {
      backgroundColor: colors.primary + '15',
    },
    tabButtonText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    tabButtonTextActive: {
      color: colors.primary,
    },
    tabContent: {
      gap: 12,
    },
    sectionHeaderRow: {
      marginBottom: 4,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
    },
    sectionHelper: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    bucketCard: {
      backgroundColor: colors.card,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    bucketCardExpiring: {
      borderColor: '#F59E0B',
      borderWidth: 1.5,
    },
    bucketTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    bucketYearBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    bucketYearText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text,
    },
    statusPill: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
    },
    statusPillText: {
      fontSize: 10,
      fontWeight: '700',
    },
    bucketDetailsGrid: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    bucketDetailItem: {
      flex: 1,
    },
    bucketDetailLabel: {
      fontSize: 11,
      color: colors.textSecondary,
      marginBottom: 2,
    },
    bucketDetailVal: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
    progressContainer: {
      height: 6,
      backgroundColor: colors.border,
      borderRadius: 3,
      overflow: 'hidden',
      marginBottom: 8,
    },
    progressBar: {
      height: '100%',
      backgroundColor: '#10B981',
      borderRadius: 3,
    },
    bucketFooterRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    bucketExpiryText: {
      fontSize: 11,
      color: colors.textSecondary,
    },
    bucketPercentText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    emptyCard: {
      backgroundColor: colors.card,
      borderRadius: 14,
      padding: 24,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    emptyTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
      marginTop: 10,
      marginBottom: 4,
    },
    emptySubtitle: {
      fontSize: 12,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 18,
    },
    tradeCard: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    tradeTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    tradeSymbol: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text,
    },
    tradeName: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 2,
    },
    tradePnlContainer: {
      alignItems: 'flex-end',
    },
    tradePnlValue: {
      fontSize: 14,
      fontWeight: '700',
    },
    tradePnlPercent: {
      fontSize: 11,
      fontWeight: '600',
      marginTop: 1,
    },
    tradeDivider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: 8,
    },
    tradeMetaRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    tradeMetaText: {
      fontSize: 11,
      color: colors.textSecondary,
    },
    tipCard: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    tipHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 6,
    },
    tipTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.text,
      flex: 1,
    },
    tipDesc: {
      fontSize: 12,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    tipImpactBadge: {
      marginTop: 8,
      alignSelf: 'flex-start',
      backgroundColor: '#10B98115',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
    tipImpactText: {
      fontSize: 11,
      fontWeight: '700',
      color: '#10B981',
    },
    guideCard: {
      backgroundColor: colors.card,
      borderRadius: 14,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      marginTop: 8,
    },
    guideHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 12,
    },
    guideTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text,
    },
    guideRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    guidePill: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    guidePillText: {
      fontSize: 9,
      fontWeight: '800',
    },
    guideRowTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 2,
    },
    guideRowDesc: {
      fontSize: 11,
      color: colors.textSecondary,
      lineHeight: 16,
    },
    guideDivider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: 12,
    },
  });
