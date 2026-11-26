import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RefreshCw, AlertCircle, Info } from 'lucide-react-native';
import { ScreenHeader } from '../components/ScreenHeader';

import { useAppTheme } from '../theme/ThemeContext';
import { ThemeColors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { radii, continuousCurve } from '../theme/radius';
import { auth } from '../config/firebase';
import { useTransactions } from '../hooks/useTransactions';
import { useAssetCategories } from '../hooks/useAssetCategories';
import { useScalableConfig } from '../hooks/useScalableConfig';
import { useScalableTaxReport } from '../hooks/useScalableTaxReport';
import { formatDate, formatNumber, formatQuantity, formatSignedCurrency } from '../utils/formatters';
import { BrokerTaxReport, RealizedTrade, TaxLossBucket } from '../types';

type ActiveTab = 'years' | 'sales' | 'rules';

const TABS: { key: ActiveTab; label: string }[] = [
  { key: 'years', label: 'Per anno' },
  { key: 'sales', label: 'Vendite' },
  { key: 'rules', label: 'Regole' },
];

const eur = (value: number) => `€${formatNumber(value)}`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const BUCKET_STATUS: Record<TaxLossBucket['status'] | 'EXPIRING', string> = {
  ACTIVE: 'Disponibili',
  EXPIRING: 'In scadenza quest\'anno',
  COMPENSATED: 'Usate per intero',
  EXPIRED: 'Scadute',
};

const TREATMENT_NOTE: Record<NonNullable<RealizedTrade['treatment']>, string | null> = {
  diversi: null,
  capitale: 'ETF o fondo: il guadagno non compensa',
  stato: 'Titolo di Stato: conta per il 48,08%',
};

/**
 * Zainetto fiscale: una stima per intermediario, calcolata dalle transazioni.
 * Il numero può finire in una dichiarazione dei redditi: diciamo sempre come è calcolato e che fa fede il broker.
 */
export default function TaxReportScreen() {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);
  const [activeTab, setActiveTab] = useState<ActiveTab>('years');
  const [brokerId, setBrokerId] = useState<BrokerTaxReport['brokerId'] | null>(null);

  const userId = auth.currentUser?.uid;
  const { transactions, loading: transactionsLoading } = useTransactions(userId);
  const { assetMeta } = useAssetCategories(userId);
  const { config: scalableConfig } = useScalableConfig(userId);
  const isScalableConnected = !!scalableConfig?.enabled && scalableConfig?.status === 'connected';
  const { brokers, officialScalable, tips, loading, refreshing, refreshError, refreshTaxReport } =
    useScalableTaxReport(userId, transactions, { transactionsLoading, assetMeta });

  const currentYear = new Date().getFullYear();
  // Di partenza l'intermediario che ha vendite: un zainetto vuoto non è la prima cosa da mostrare
  const selected = brokers.find(b => b.brokerId === brokerId)
    ?? brokers.find(b => b.report.realizedTrades.length > 0 || (b.report.excludedTrades?.length ?? 0) > 0)
    ?? brokers[0]
    ?? null;
  const report = selected?.report ?? null;

  const header = (
    <ScreenHeader
      title="Zainetto fiscale"
      rightAction={
        isScalableConnected ? (
          <TouchableOpacity
            style={styles.iconButton}
            onPress={refreshTaxReport}
            disabled={refreshing}
            accessibilityRole="button"
            accessibilityLabel="Aggiorna da Scalable"
            aria-busy={refreshing}
          >
            {refreshing ? <ActivityIndicator size="small" color={colors.textSecondary} /> : <RefreshCw size={20} color={colors.text} />}
          </TouchableOpacity>
        ) : undefined
      }
    />
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        {header}
        <View style={styles.center}>
          <ActivityIndicator color={colors.textSecondary} />
          <Text style={styles.muted}>Calcolo dello zainetto dalle tue transazioni…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const hasSales = brokers.some(b => b.report.realizedTrades.length > 0 || (b.report.excludedTrades?.length ?? 0) > 0);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {header}
      <ScrollView contentContainerStyle={styles.content}>
        {/* Come è calcolato: prima del numero, non in fondo */}
        <Text style={styles.disclaimer}>
          Stima calcolata dalle transazioni presenti nell&apos;app: costo medio ponderato, commissioni incluse, importi in euro.
          Non è consulenza fiscale: fa fede il rendiconto del tuo intermediario.
        </Text>
        {refreshError && (
          <View style={styles.notice} accessibilityRole="alert">
            <AlertCircle size={16} color={colors.warning} style={styles.noticeIcon} />
            <Text style={styles.noticeText}>{refreshError}</Text>
          </View>
        )}

        {!hasSales || !report ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Nessuna vendita registrata</Text>
            <Text style={styles.muted}>
              Lo zainetto si forma quando vendi un titolo in perdita. Le vendite inserite o sincronizzate compariranno qui.
            </Text>
          </View>
        ) : (
          <>
            {brokers.length > 1 && (
              <View style={styles.segmented} accessibilityRole="tablist" aria-label="Intermediario">
                {brokers.map(b => {
                  const isSelected = b.brokerId === selected?.brokerId;
                  return (
                    <TouchableOpacity
                      key={b.brokerId}
                      style={[styles.segment, isSelected && styles.segmentActive]}
                      onPress={() => setBrokerId(b.brokerId)}
                      accessibilityRole="tab"
                      aria-selected={isSelected}
                    >
                      <Text style={[styles.segmentText, isSelected && styles.segmentTextActive]} numberOfLines={1}>
                        {b.brokerId === 'scalable' ? 'Scalable' : 'Inserite a mano'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* La risposta: quanto ho a disposizione */}
            <View style={styles.hero}>
              <Text style={styles.heroLabel}>Minusvalenze disponibili{brokers.length === 1 ? ` · ${selected!.label}` : ''}</Text>
              <Text style={styles.heroValue}>{eur(report.totalActiveLosses)}</Text>
              <Text style={styles.heroNote}>
                {report.totalActiveLosses > 0
                  ? `Possono evitare fino a ${eur(report.potentialTaxSavings)} di imposte (26%) su plusvalenze future compensabili presso questo intermediario.`
                  : 'Nessuna minusvalenza ancora utilizzabile.'}
              </Text>
              {selected!.brokerId === 'scalable' && officialScalable && Math.abs(officialScalable.totalActiveLosses - report.totalActiveLosses) > 0.5 && (
                <Text style={styles.heroNote}>
                  Scalable riporta {eur(officialScalable.totalActiveLosses)}: in caso di differenza fa fede il dato del broker.
                </Text>
              )}
            </View>

            {report.lossesExpiringThisYear > 0 && (
              <View style={styles.notice}>
                <AlertCircle size={16} color={colors.warning} style={styles.noticeIcon} />
                <Text style={styles.noticeText}>
                  {eur(report.lossesExpiringThisYear)} di minusvalenze del {currentYear - 4} scadono il 31 dicembre {currentYear}.
                </Text>
              </View>
            )}

            {(report.excludedTrades?.length ?? 0) > 0 && (
              <View style={styles.notice}>
                <AlertCircle size={16} color={colors.warning} style={styles.noticeIcon} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.noticeText}>
                    {plural(report.excludedTrades!.length, 'vendita non calcolata', 'vendite non calcolate')}: la stima potrebbe essere incompleta.
                  </Text>
                  {report.excludedTrades!.map(t => (
                    <Text key={t.id} style={styles.noticeDetail}>
                      {t.name}, {formatDate(t.date)}: {t.reason === 'fx'
                        ? 'manca il cambio in euro del giorno (aggiungilo nella transazione)'
                        : 'mancano gli acquisti corrispondenti'}
                    </Text>
                  ))}
                </View>
              </View>
            )}

            {/* L'anno in corso: cosa usa lo zainetto e cosa no */}
            <View style={styles.yearCard}>
              <Text style={styles.cardTitle}>{currentYear}</Text>
              <View style={styles.yearRow}>
                <Text style={styles.yearLabel}>Plusvalenze compensabili</Text>
                <Text style={styles.yearValue}>{eur(report.realizedGainsCurrentYear)}</Text>
              </View>
              <View style={styles.yearRow}>
                <Text style={styles.yearLabel}>Minusvalenze realizzate</Text>
                <Text style={styles.yearValue}>{eur(report.realizedLossesCurrentYear)}</Text>
              </View>
              {(report.fundGainsCurrentYear ?? 0) > 0 && (
                <View style={styles.yearRow}>
                  <Text style={styles.yearLabel}>Guadagni da ETF e fondi (non compensano)</Text>
                  <Text style={styles.yearValue}>{eur(report.fundGainsCurrentYear!)}</Text>
                </View>
              )}
            </View>

            <View style={styles.tabs} accessibilityRole="tablist">
              {TABS.map(tab => {
                const isSelected = activeTab === tab.key;
                return (
                  <TouchableOpacity
                    key={tab.key}
                    style={[styles.tab, isSelected && styles.tabActive]}
                    onPress={() => setActiveTab(tab.key)}
                    accessibilityRole="tab"
                    aria-selected={isSelected}
                  >
                    <Text style={[styles.tabText, isSelected && styles.tabTextActive]} numberOfLines={1}>{tab.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {activeTab === 'years' && (
              report.buckets.length === 0 ? (
                <Text style={styles.muted}>Nessuna vendita in perdita presso questo intermediario.</Text>
              ) : (
                report.buckets.map(bucket => <BucketCard key={bucket.yearCreated} bucket={bucket} styles={styles} />)
              )
            )}

            {activeTab === 'sales' && (
              report.realizedTrades.length === 0 ? (
                <Text style={styles.muted}>Nessuna vendita calcolata presso questo intermediario.</Text>
              ) : (
                [...report.realizedTrades].reverse().map(trade => (
                  <TradeRow key={trade.id} trade={trade} styles={styles} colors={colors} />
                ))
              )
            )}
          </>
        )}

        {(activeTab === 'rules' || !hasSales || !report) && (
          <View style={{ marginTop: 8 }}>
            {(!hasSales || !report) && <Text style={styles.sectionTitle}>Cosa compensa cosa</Text>}
            {tips.map(tip => (
              <View key={tip.id} style={styles.ruleCard}>
                <View style={styles.ruleHeader}>
                  {tip.type === 'EXPIRING_LOSSES'
                    ? <AlertCircle size={16} color={colors.warning} style={styles.noticeIcon} />
                    : <Info size={16} color={colors.textSecondary} style={styles.noticeIcon} />}
                  <Text style={styles.ruleTitle}>{tip.title}</Text>
                </View>
                <Text style={styles.ruleText}>{tip.description}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const BucketCard = ({ bucket, styles }: { bucket: TaxLossBucket; styles: ReturnType<typeof getStyles> }) => {
  const statusKey = bucket.isExpiringThisYear ? 'EXPIRING' : bucket.status;
  const usedShare = bucket.initialAmount > 0 ? Math.min(1, bucket.compensatedAmount / bucket.initialAmount) : 0;
  return (
    <View
      style={styles.bucketCard}
      accessible
      accessibilityLabel={`Minusvalenze ${bucket.yearCreated}: ${eur(bucket.initialAmount)}, usate ${eur(bucket.compensatedAmount)}, residue ${eur(bucket.remainingAmount)}. ${BUCKET_STATUS[statusKey]}, utilizzabili fino al 31 dicembre ${bucket.yearExpires}`}
    >
      <View style={styles.bucketHeader}>
        <Text style={styles.cardTitle}>Minusvalenze {bucket.yearCreated}</Text>
        <Text style={[styles.bucketStatus, statusKey === 'EXPIRING' && styles.bucketStatusWarning]}>{BUCKET_STATUS[statusKey]}</Text>
      </View>
      <View style={styles.bucketNumbers}>
        <View style={styles.bucketCol}>
          <Text style={styles.bucketLabel}>Generate</Text>
          <Text style={styles.bucketValue}>{eur(bucket.initialAmount)}</Text>
        </View>
        <View style={styles.bucketCol}>
          <Text style={styles.bucketLabel}>Usate</Text>
          <Text style={styles.bucketValue}>{eur(bucket.compensatedAmount)}</Text>
        </View>
        <View style={styles.bucketCol}>
          <Text style={styles.bucketLabel}>{bucket.status === 'EXPIRED' ? 'Perse' : 'Residue'}</Text>
          <Text style={styles.bucketValue}>{eur(bucket.remainingAmount)}</Text>
        </View>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.round(usedShare * 100)}%` }]} />
      </View>
      <Text style={styles.bucketExpiry}>Utilizzabili fino al 31 dicembre {bucket.yearExpires}</Text>
    </View>
  );
};

const TradeRow = ({ trade, styles, colors }: { trade: RealizedTrade; styles: ReturnType<typeof getStyles>; colors: ThemeColors }) => {
  const note = trade.treatment ? TREATMENT_NOTE[trade.treatment] : null;
  const percent = trade.costBasis > 0 ? (trade.realizedGainOrLoss / trade.costBasis) * 100 : null;
  return (
    <View style={styles.tradeRow}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.tradeName} numberOfLines={2}>{trade.name}</Text>
        <Text style={styles.tradeMeta}>
          {formatDate(trade.date)} · {formatQuantity(trade.quantity)} {trade.quantity === 1 ? 'quota' : 'quote'}
        </Text>
        <Text style={styles.tradeMeta}>
          Costo {eur(trade.costBasis)}{trade.proceeds !== undefined ? ` · Incasso ${eur(trade.proceeds)}` : ''}
        </Text>
        {note && <Text style={styles.tradeMeta}>{note}</Text>}
      </View>
      <View style={styles.tradeResult}>
        <Text style={[styles.tradeGain, { color: trade.realizedGainOrLoss >= 0 ? colors.positive : colors.negative }]}>
          {formatSignedCurrency(trade.realizedGainOrLoss)}
        </Text>
        {percent !== null && (
          <Text style={styles.tradeMeta}>{percent >= 0 ? '+' : ''}{formatNumber(percent)}%</Text>
        )}
      </View>
    </View>
  );
};

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xxl },
  content: { padding: spacing.screenPaddingHorizontal, paddingBottom: spacing.huge },
  disclaimer: { fontSize: 12, lineHeight: 17, color: colors.textSecondary, marginBottom: spacing.lg },
  muted: { fontSize: 14, lineHeight: 20, color: colors.textSecondary, textAlign: 'left' },
  emptyCard: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    ...continuousCurve,
    padding: spacing.xl,
    marginBottom: spacing.xxl,
    gap: spacing.sm,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.inputBackground,
    borderRadius: radii.sm,
    ...continuousCurve,
    padding: 3,
    marginBottom: spacing.lg,
  },
  segment: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radii.xs, ...continuousCurve, paddingHorizontal: 8 },
  segmentActive: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  segmentText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  segmentTextActive: { color: colors.text },
  hero: { marginBottom: spacing.lg },
  heroLabel: { fontSize: 14, color: colors.textSecondary, marginBottom: 4 },
  heroValue: { fontSize: 32, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  heroNote: { fontSize: 14, lineHeight: 20, color: colors.textSecondary, marginTop: 6 },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.warningSurface,
    borderRadius: radii.md,
    ...continuousCurve,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  noticeIcon: { marginRight: spacing.sm, marginTop: 2 },
  noticeText: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.text },
  noticeDetail: { fontSize: 13, lineHeight: 18, color: colors.text, marginTop: 4 },
  yearCard: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    ...continuousCurve,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  yearRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 10, gap: spacing.md },
  yearLabel: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  yearValue: { fontSize: 15, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.inputBackground,
    borderRadius: radii.sm,
    ...continuousCurve,
    padding: 3,
    marginBottom: spacing.lg,
  },
  tab: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radii.xs, ...continuousCurve, paddingHorizontal: 4 },
  tabActive: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  tabText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  tabTextActive: { color: colors.text },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  bucketCard: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: 16, padding: 16, marginBottom: 12 },
  bucketHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  bucketStatus: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  bucketStatusWarning: { color: colors.warning },
  bucketNumbers: { flexDirection: 'row', marginTop: 12 },
  bucketCol: { flex: 1 },
  bucketLabel: { fontSize: 12, color: colors.textSecondary, marginBottom: 2 },
  bucketValue: { fontSize: 15, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  // Quota usata: una barra neutra, non verde (non è un guadagno)
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: colors.border, marginTop: 12, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2, backgroundColor: colors.text },
  bucketExpiry: { fontSize: 12, color: colors.textSecondary, marginTop: 8 },
  tradeRow: { borderWidth: 1, borderColor: colors.border,
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  tradeName: { fontSize: 15, fontWeight: '600', color: colors.text },
  tradeMeta: { fontSize: 12, lineHeight: 17, color: colors.textSecondary, marginTop: 2, fontVariant: ['tabular-nums'] },
  tradeResult: { alignItems: 'flex-end' },
  tradeGain: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  ruleCard: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: 14, padding: 14, marginBottom: 10 },
  ruleHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  ruleTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  ruleText: { fontSize: 14, lineHeight: 20, color: colors.textSecondary, marginTop: 6 },
});
