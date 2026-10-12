import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, LayoutChangeEvent, ActivityIndicator } from 'react-native';
import Svg, { Path, Line, Circle } from 'react-native-svg';
import { useAppTheme } from '../theme/ThemeContext';
import { ThemeColors } from '../theme/colors';
import { formatNumber } from '../utils/formatters';
import type { WeeklySeries } from '../services/yahooFinance';
import { fetchDailyYear, fetchWeeklyFiveYears } from '../services/historicalPrices';

type Range = '1M' | '6M' | '1A' | '5A';
const RANGES: { key: Range; months: number; spoken: string; weekly: boolean }[] = [
  { key: '1M', months: 1, spoken: 'in un mese', weekly: false },
  { key: '6M', months: 6, spoken: 'in sei mesi', weekly: false },
  { key: '1A', months: 12, spoken: 'in un anno', weekly: false },
  { key: '5A', months: 60, spoken: 'in cinque anni', weekly: true },
];

const CHART_HEIGHT = 96;
const PAD = 6;

const dateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const monthsAgoKey = (months: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return dateKey(d);
};

interface AssetPriceChartProps {
  /** Simbolo con cui chiedere lo storico (ISIN per i titoli Scalable) */
  priceKey: string;
  /** Prezzo attuale nella valuta mostrata: lo storico viene riportato a questo livello */
  currentPrice: number | null;
  currencySymbol: string;
  /** Prezzo medio di carico, se il titolo è ancora in portafoglio */
  averagePrice: number | null;
  /** Date (YYYY-MM-DD) degli acquisti */
  purchaseDates: string[];
}

/**
 * Andamento del prezzo del titolo con il proprio prezzo medio tratteggiato e gli acquisti segnati:
 * a colpo d'occhio si vede se si è sopra o sotto e quando si è comprato.
 */
export const AssetPriceChart: React.FC<AssetPriceChartProps> = ({ priceKey, currentPrice, currencySymbol, averagePrice, purchaseDates }) => {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);
  const [range, setRange] = useState<Range>('6M');
  const [width, setWidth] = useState(0);
  const selected = RANGES.find(r => r.key === range)!;
  const [data, setData] = useState<{ id: string; series: WeeklySeries | null; error: boolean } | null>(null);
  const requestId = `${priceKey}|${selected.weekly ? 'w' : 'd'}`;

  useEffect(() => {
    if (!priceKey) return;
    let cancelled = false;
    (selected.weekly ? fetchWeeklyFiveYears([priceKey]) : fetchDailyYear([priceKey]))
      .then(res => { if (!cancelled) setData({ id: requestId, series: res[priceKey] ?? null, error: false }); })
      .catch(err => {
        console.warn('Storico prezzi non disponibile:', err);
        if (!cancelled) setData({ id: requestId, series: null, error: true });
      });
    return () => { cancelled = true; };
  }, [priceKey, requestId, selected.weekly]);

  const current = data?.id === requestId ? data : null;

  const points = useMemo(() => {
    const raw = current?.series?.points ?? [];
    if (raw.length === 0) return [];
    const latest = raw[raw.length - 1].close;
    // La borsa di Yahoo può quotare a un livello diverso dal prezzo mostrato: si tiene la variazione, non il livello
    const scale = currentPrice && latest > 0 ? currentPrice / latest : 1;
    const from = monthsAgoKey(selected.months);
    const list = raw.filter(p => p.date >= from).map(p => ({ date: p.date, price: p.close * scale }));
    const today = dateKey(new Date());
    if (currentPrice && list.length > 0 && list[list.length - 1].date < today) list.push({ date: today, price: currentPrice });
    return list;
  }, [current, currentPrice, selected.months]);

  const first = points[0];
  const last = points[points.length - 1];
  const changePercent = first && last && first.price > 0 ? (last.price / first.price - 1) * 100 : null;
  const tone = (changePercent ?? 0) >= 0 ? colors.positive : colors.negative;

  const chart = useMemo(() => {
    if (points.length < 2 || width === 0) return null;
    const values = points.map(p => p.price);
    const showAverage = averagePrice !== null && averagePrice > 0;
    let min = Math.min(...values, ...(showAverage ? [averagePrice!] : []));
    let max = Math.max(...values, ...(showAverage ? [averagePrice!] : []));
    if (max - min < max * 0.01) {
      const mid = (max + min) / 2;
      min = mid * 0.995;
      max = mid * 1.005;
    }
    const toY = (v: number) => PAD + (1 - (v - min) / (max - min)) * (CHART_HEIGHT - PAD * 2);
    const toX = (i: number) => (i / (points.length - 1)) * width;
    const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(p.price).toFixed(1)}`).join(' ');
    // Ogni acquisto sul primo punto con data uguale o successiva
    const markers = Array.from(new Set(purchaseDates
      .filter(d => d >= points[0].date)
      .map(d => points.findIndex(p => p.date >= d))
      .filter(i => i >= 0)))
      .map(i => ({ x: toX(i), y: toY(points[i].price) }));
    return { path, markers, averageY: showAverage ? toY(averagePrice!) : null };
  }, [points, width, averagePrice, purchaseDates]);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title} accessibilityRole="header">Andamento del prezzo</Text>
        <View style={styles.rangeRow} accessibilityRole="tablist" aria-label="Periodo del grafico">
          {RANGES.map(r => (
            <TouchableOpacity
              key={r.key}
              onPress={() => setRange(r.key)}
              style={[styles.rangeButton, range === r.key && styles.rangeButtonActive]}
              accessibilityRole="tab"
              aria-selected={range === r.key}
              hitSlop={{ top: 8, bottom: 8, left: 2, right: 2 }}
            >
              <Text style={[styles.rangeText, range === r.key && styles.rangeTextActive]}>{r.key}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.chart} onLayout={onLayout}>
        {!current ? (
          <ActivityIndicator color={colors.textSecondary} />
        ) : chart ? (
          <View aria-hidden importantForAccessibility="no-hide-descendants">
            <Svg width={width} height={CHART_HEIGHT}>
              {chart.averageY !== null && (
                <Line x1={0} y1={chart.averageY} x2={width} y2={chart.averageY} stroke={colors.textSecondary} strokeWidth={1} strokeDasharray="4 4" />
              )}
              <Path d={chart.path} stroke={tone} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
              {chart.markers.map((m, i) => (
                <Circle key={i} cx={m.x} cy={m.y} r={3.5} fill={colors.background} stroke={colors.text} strokeWidth={1.5} />
              ))}
            </Svg>
          </View>
        ) : (
          <Text style={styles.empty}>
            {current.error ? 'Grafico non disponibile: prezzi storici non raggiungibili.' : 'Nessuno storico prezzi per questo titolo.'}
          </Text>
        )}
      </View>

      {chart && changePercent !== null && (
        <Text style={styles.caption}>
          <Text style={{ color: tone, fontWeight: '700' }}>{changePercent >= 0 ? '+' : ''}{formatNumber(changePercent)}%</Text>
          {` ${selected.spoken}`}
          {chart.averageY !== null ? ` · tratteggio: il tuo prezzo medio ${currencySymbol}${formatNumber(averagePrice!)}` : ''}
          {chart.markers.length > 0 ? ' · cerchi: i tuoi acquisti' : ''}
          {' · chiusure Yahoo Finance'}
        </Text>
      )}
    </View>
  );
};

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  rangeRow: {
    flexDirection: 'row',
    gap: 4,
  },
  rangeButton: {
    minHeight: 28,
    minWidth: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderRadius: 14,
  },
  rangeButtonActive: {
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rangeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  rangeTextActive: {
    color: colors.text,
  },
  chart: {
    height: CHART_HEIGHT,
    justifyContent: 'center',
  },
  empty: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  caption: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
    marginTop: 8,
    fontVariant: ['tabular-nums'],
  },
});
