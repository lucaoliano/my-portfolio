import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, AlertCircle } from 'lucide-react-native';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';

import { useAppTheme } from '../theme/ThemeContext';
import { ThemeColors } from '../theme/colors';
import { auth, db } from '../config/firebase';
import { usePortfolioOverview } from '../hooks/usePortfolioOverview';
import { usePeriodSeries } from '../hooks/usePeriodSeries';
import { formatDate, formatNumber } from '../utils/formatters';
import { makePriceAt, nowEurByPriceKey } from '../utils/periodPerformance';
import { CASH_FLAT_TAX, CASH_THRESHOLD, WEALTH_TAX_RATE, WealthTaxEstimate, WealthTaxRegime, estimateWealthTax } from '../utils/wealthTax';
import { Transaction } from '../types';

type BrokerId = 'scalable' | 'manual';
const BROKERS: { id: BrokerId; label: string }[] = [
  { id: 'scalable', label: 'Scalable Capital' },
  { id: 'manual', label: 'Transazioni inserite a mano' },
];
const brokerOf = (t: Transaction): BrokerId => (t.source === 'scalable_mcp' ? 'scalable' : 'manual');

const REGIMES: { key: WealthTaxRegime; label: string }[] = [
  { key: 'bollo', label: 'Broker italiano' },
  { key: 'ivafe', label: 'Broker estero' },
];

const eur = (value: number) => `€${formatNumber(value)}`;
const pct = (rate: number) => `${formatNumber(rate * 100)}%`;

/**
 * Imposta di bollo e IVAFE stimate, per intermediario.
 * Stessa aliquota, ma chi la versa cambia: il broker italiano la trattiene, con uno estero la dichiari tu.
 */
export default function WealthTaxScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = getStyles(colors);
  const userId = auth.currentUser?.uid;
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const isCurrentYear = year === currentYear;

  const { transactions, aggregation, scalableCash, isScalableConnected, isInitialLoading } = usePortfolioOverview(userId);
  const nowEurByKey = useMemo(() => nowEurByPriceKey(aggregation.globalAssets, transactions), [aggregation.globalAssets, transactions]);
  // L'anno scorso si valuta al 31/12: servono le chiusure storiche, scaricate solo se lo si apre
  const { series, loading: seriesLoading, error: seriesError } = usePeriodSeries(transactions, !isCurrentYear);

  // Tipo di broker scelto dall'utente. Scalable opera in Italia come sostituto d'imposta: di partenza "italiano"
  const [regimes, setRegimes] = useState<Partial<Record<BrokerId, WealthTaxRegime>>>({});
  useEffect(() => {
    if (!userId) return;
    return onSnapshot(doc(db, 'portfolios', userId, 'settings', 'wealth_tax'), snap => {
      setRegimes((snap.data()?.regimes as Partial<Record<BrokerId, WealthTaxRegime>>) ?? {});
    }, err => console.warn('Preferenze bollo non disponibili:', err));
  }, [userId]);
  const regimeOf = (id: BrokerId): WealthTaxRegime | null => regimes[id] ?? (id === 'scalable' ? 'bollo' : null);
  const changeRegime = (id: BrokerId, regime: WealthTaxRegime) => {
    setRegimes(prev => ({ ...prev, [id]: regime }));
    if (userId) {
      setDoc(doc(db, 'portfolios', userId, 'settings', 'wealth_tax'), { regimes: { [id]: regime } }, { merge: true })
        .catch(err => console.warn('Salvataggio non riuscito:', err));
    }
  };

  const estimates = useMemo(() => {
    if (!isCurrentYear && !series) return null;
    const priceAt = (key: string, txs: Transaction[]) => {
      const nowEur = nowEurByKey[key] ?? null;
      if (isCurrentYear) return nowEur;
      return makePriceAt(txs, series!, key, nowEur)(`${year}-12-31`);
    };
    return BROKERS
      .map(b => {
        const txs = transactions.filter(t => brokerOf(t) === b.id && t.date.slice(0, 10) <= `${year}-12-31`);
        // Del saldo di liquidità conosciamo solo quello di oggi
        const cash = b.id === 'scalable' && isScalableConnected && isCurrentYear ? scalableCash : null;
        if (txs.length === 0 && !cash) return null;
        return { ...b, estimate: estimateWealthTax(txs, year, priceAt, cash) };
      })
      .filter((b): b is { id: BrokerId; label: string; estimate: WealthTaxEstimate } => b !== null && (b.estimate.lines.length > 0 || b.estimate.cash !== null || b.estimate.missing.length > 0));
  }, [isCurrentYear, series, nowEurByKey, transactions, year, isScalableConnected, scalableCash]);

  const header = (
    <View style={styles.header}>
      <TouchableOpacity
        style={styles.iconButton}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        accessibilityRole="button"
        accessibilityLabel="Indietro"
      >
        <ChevronLeft size={26} color={colors.text} />
      </TouchableOpacity>
      <Text style={styles.headerTitle} accessibilityRole="header">Bollo e IVAFE</Text>
      <View style={styles.iconButton} />
    </View>
  );

  const withheld = estimates?.filter(b => regimeOf(b.id) === 'bollo').reduce((s, b) => s + b.estimate.total, 0) ?? 0;
  const toPay = estimates?.filter(b => regimeOf(b.id) === 'ivafe').reduce((s, b) => s + b.estimate.total, 0) ?? 0;
  const total = estimates?.reduce((s, b) => s + b.estimate.total, 0) ?? 0;

  return (
    <SafeAreaView style={styles.container}>
      {header}
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.disclaimer}>
          {isCurrentYear
            ? `Stima ${year} sui prezzi di oggi, come se tenessi i titoli fino al 31 dicembre. `
            : `Stima ${year} sui prezzi di chiusura del 31 dicembre (Yahoo Finance). `}
          Non è consulenza fiscale: fanno fede il rendiconto del broker e la tua dichiarazione.
        </Text>

        <View style={styles.segmented} accessibilityRole="tablist" aria-label="Anno">
          {[currentYear, currentYear - 1].map(y => (
            <TouchableOpacity
              key={y}
              style={[styles.segment, year === y && styles.segmentActive]}
              onPress={() => setYear(y)}
              accessibilityRole="tab"
              aria-selected={year === y}
            >
              <Text style={[styles.segmentText, year === y && styles.segmentTextActive]}>
                {y === currentYear ? `${y} (in corso)` : `${y}`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {isInitialLoading || (!isCurrentYear && seriesLoading) ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.textSecondary} />
            <Text style={styles.muted}>{isCurrentYear ? 'Carico i prezzi…' : 'Carico i prezzi al 31 dicembre…'}</Text>
          </View>
        ) : !estimates ? (
          <View style={styles.notice} accessibilityRole="alert">
            <AlertCircle size={16} color={colors.warning} style={styles.noticeIcon} />
            <Text style={styles.noticeText}>
              {seriesError ? 'Prezzi storici non raggiungibili: riprova più tardi.' : 'Prezzi storici non disponibili.'}
            </Text>
          </View>
        ) : estimates.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Nessun titolo nel {year}</Text>
            <Text style={styles.muted}>Bollo e IVAFE si calcolano sui titoli e sulla liquidità posseduti nell&apos;anno.</Text>
          </View>
        ) : (
          <>
            <View style={styles.hero}>
              <Text style={styles.heroLabel}>Imposte stimate {year}</Text>
              <Text style={styles.heroValue}>{eur(total)}</Text>
              {total > 0 && (
                <Text style={styles.heroNote}>
                  {[
                    withheld > 0 ? `${eur(withheld)} trattenuti dai broker` : null,
                    toPay > 0 ? `${eur(toPay)} da versare tu con la dichiarazione` : null,
                    total - withheld - toPay > 0.005 ? `${eur(total - withheld - toPay)} da broker di cui manca il tipo` : null,
                  ].filter(Boolean).join(' · ')}
                </Text>
              )}
            </View>

            {estimates.map(({ id, label, estimate }) => {
              const regime = regimeOf(id);
              return (
                <View key={id} style={styles.card}>
                  <Text style={styles.cardTitle}>{label}</Text>

                  <View style={[styles.segmented, styles.regimeChooser]} accessibilityRole="radiogroup" aria-label={`Tipo di broker per ${label}`}>
                    {REGIMES.map(r => (
                      <TouchableOpacity
                        key={r.key}
                        style={[styles.segment, regime === r.key && styles.segmentActive]}
                        onPress={() => changeRegime(id, r.key)}
                        accessibilityRole="radio"
                        aria-checked={regime === r.key}
                      >
                        <Text style={[styles.segmentText, regime === r.key && styles.segmentTextActive]}>{r.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>
                      {regime === 'bollo' ? 'Imposta di bollo' : regime === 'ivafe' ? 'IVAFE' : 'Bollo o IVAFE'}
                    </Text>
                    <Text style={styles.totalValue}>{eur(estimate.total)}</Text>
                  </View>
                  <Text style={styles.cardNote}>
                    {regime === 'bollo'
                      ? 'La trattiene il broker dal conto: non devi versarla tu.'
                      : regime === 'ivafe'
                        ? `Da indicare nel quadro RW e versare con il saldo IRPEF (di solito entro il 30 giugno ${year + 1}).`
                        : 'Indica se il broker è italiano o estero per sapere chi la versa: l’importo non cambia.'}
                  </Text>

                  <View style={styles.row}>
                    <Text style={styles.rowLabel}>Titoli · {pct(WEALTH_TAX_RATE)} su {eur(estimate.securitiesValue)}</Text>
                    <Text style={styles.rowValue}>{eur(estimate.securitiesTax)}</Text>
                  </View>
                  {estimate.cash && (
                    <View style={styles.row}>
                      <Text style={styles.rowLabel}>
                        Liquidità {eur(estimate.cash.balance)} · {estimate.cash.tax > 0
                          ? `${eur(CASH_FLAT_TAX)} se la giacenza media resta sopra ${eur(CASH_THRESHOLD)}`
                          : `nulla sotto ${eur(CASH_THRESHOLD)} di giacenza media`}
                      </Text>
                      <Text style={styles.rowValue}>{eur(estimate.cash.tax)}</Text>
                    </View>
                  )}

                  {estimate.missing.length > 0 && (
                    <View style={[styles.notice, { marginTop: 12, marginBottom: 0 }]}>
                      <AlertCircle size={16} color={colors.warning} style={styles.noticeIcon} />
                      <Text style={styles.noticeText}>
                        Esclusi perché senza prezzo{isCurrentYear ? '' : ' al 31 dicembre'} o senza cambio: {estimate.missing.join(', ')}.
                      </Text>
                    </View>
                  )}

                  {estimate.lines.length > 0 && (
                    <View style={styles.lines}>
                      {estimate.lines.map(line => (
                        <View key={line.key} style={styles.line}>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={styles.lineName} numberOfLines={2}>{line.name}</Text>
                            <Text style={styles.lineMeta}>
                              {eur(line.value)}
                              {line.closedOn ? ` alla vendita del ${formatDate(line.closedOn)}` : ''}
                              {line.days < 365 ? ` · ${line.days} giorni` : ''}
                            </Text>
                          </View>
                          <Text style={styles.lineValue}>{eur(line.tax)}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </>
        )}

        <Text style={styles.sectionTitle}>Come si calcola</Text>
        <View style={styles.ruleCard}>
          <Text style={styles.ruleTitle}>Titoli: {pct(WEALTH_TAX_RATE)} l&apos;anno</Text>
          <Text style={styles.ruleText}>
            Sul valore di mercato al 31 dicembre, oppure alla vendita se chiudi la posizione prima, in proporzione ai giorni di possesso. Vale per azioni, ETF, fondi, obbligazioni ed ETC.
          </Text>
        </View>
        <View style={styles.ruleCard}>
          <Text style={styles.ruleTitle}>Liquidità: {eur(CASH_FLAT_TAX)} l&apos;anno</Text>
          <Text style={styles.ruleText}>
            Su conti e depositi, solo se la giacenza media annua supera {eur(CASH_THRESHOLD)}. L&apos;app conosce solo il saldo di oggi, quindi questa riga è indicativa.
          </Text>
        </View>
        <View style={styles.ruleCard}>
          <Text style={styles.ruleTitle}>Bollo o IVAFE?</Text>
          <Text style={styles.ruleText}>
            Con un intermediario italiano o che opera come sostituto d&apos;imposta paghi l&apos;imposta di bollo, trattenuta dal broker. Con uno estero paghi l&apos;IVAFE: la calcoli e la versi tu con la dichiarazione. Le attività in Stati a fiscalità privilegiata pagano lo 0,4%: qui non è considerato.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
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
  center: { alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  content: { padding: 16, paddingBottom: 48 },
  disclaimer: { fontSize: 12, lineHeight: 17, color: colors.textSecondary, marginBottom: 16 },
  muted: { fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  emptyCard: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: 16, padding: 20, marginBottom: 24, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.inputBackground,
    borderRadius: 10,
    padding: 3,
    marginBottom: 16,
  },
  segment: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 8, paddingHorizontal: 8 },
  segmentActive: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  segmentText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  segmentTextActive: { color: colors.text },
  regimeChooser: { marginTop: 12, marginBottom: 12 },
  hero: { marginBottom: 16 },
  heroLabel: { fontSize: 14, color: colors.textSecondary, marginBottom: 4 },
  heroValue: { fontSize: 32, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  heroNote: { fontSize: 14, lineHeight: 20, color: colors.textSecondary, marginTop: 6 },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.warningSurface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  noticeIcon: { marginRight: 8, marginTop: 2 },
  noticeText: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.text },
  card: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: 16, padding: 16, marginBottom: 20 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  totalLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
  totalValue: { fontSize: 22, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  cardNote: { fontSize: 13, lineHeight: 18, color: colors.textSecondary, marginTop: 4, marginBottom: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 10, gap: 12 },
  rowLabel: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  rowValue: { fontSize: 15, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  lines: { marginTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  lineName: { fontSize: 14, fontWeight: '600', color: colors.text },
  lineMeta: { fontSize: 12, lineHeight: 17, color: colors.textSecondary, marginTop: 2, fontVariant: ['tabular-nums'] },
  lineValue: { fontSize: 14, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: 8, marginBottom: 12 },
  ruleCard: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: 14, padding: 14, marginBottom: 10 },
  ruleTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  ruleText: { fontSize: 14, lineHeight: 20, color: colors.textSecondary, marginTop: 6 },
});
