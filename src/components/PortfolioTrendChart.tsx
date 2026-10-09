import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, LayoutChangeEvent } from 'react-native';
import Svg, { Path, Line } from 'react-native-svg';
import { useAppTheme } from '../theme/ThemeContext';
import { ThemeColors } from '../theme/colors';
import { formatDate, formatNumber, formatSignedCurrency } from '../utils/formatters';
import { HistoryPoint } from '../hooks/usePortfolioHistory';

type Range = '7G' | '1M' | '1A' | 'Tutto';
const RANGES: { key: Range; days: number | null; label: string }[] = [
  { key: '7G', days: 7, label: '7 giorni fa' },
  { key: '1M', days: 30, label: 'un mese fa' },
  { key: '1A', days: 365, label: 'un anno fa' },
  { key: 'Tutto', days: null, label: "l'inizio dello storico" },
];

const CHART_HEIGHT = 64;

interface PortfolioTrendChartProps {
  points: HistoryPoint[];
  /** Stessa scelta del bilancio: la liquidità entra nel valore? */
  includeCash: boolean;
}

const daysAgoKey = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Andamento del valore nel tempo: una linea sottile, colorata solo dal segno della variazione nel periodo.
 * Il valore include i versamenti, quindi lo diciamo: non è un rendimento.
 */
export const PortfolioTrendChart: React.FC<PortfolioTrendChartProps> = ({ points, includeCash }) => {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);
  const [range, setRange] = useState<Range>('1M');
  const [width, setWidth] = useState(0);

  const series = useMemo(() => {
    const selected = RANGES.find(r => r.key === range)!;
    const from = selected.days ? daysAgoKey(selected.days) : null;
    return points
      .filter(p => !from || p.date >= from)
      .map(p => ({ date: p.date, value: p.invested + (includeCash ? p.cash : 0), complete: p.complete }));
  }, [points, range, includeCash]);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const first = series[0];
  const last = series[series.length - 1];
  const delta = first && last ? last.value - first.value : 0;
  const deltaPercent = first && first.value > 0 ? (delta / first.value) * 100 : 0;
  const tone = delta >= 0 ? colors.positive : colors.negative;
  const rangeLabel = RANGES.find(r => r.key === range)!.label;
  const hasIncomplete = series.some(p => !p.complete);

  const path = useMemo(() => {
    if (series.length < 2 || width === 0) return null;
    const values = series.map(p => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const pad = 4;
    return series
      .map((p, i) => {
        const x = (i / (series.length - 1)) * width;
        const y = pad + (1 - (p.value - min) / span) * (CHART_HEIGHT - pad * 2);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [series, width]);

  return (
    <View style={styles.container}>
      <View style={styles.rangeRow} accessibilityRole="tablist">
        {RANGES.map(r => (
          <TouchableOpacity
            key={r.key}
            onPress={() => setRange(r.key)}
            style={[styles.rangeButton, range === r.key && styles.rangeButtonActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: range === r.key }}
            accessibilityLabel={r.key === 'Tutto' ? 'Tutto lo storico' : `Ultimi ${r.label.replace(' fa', '')}`}
            hitSlop={{ top: 8, bottom: 8 }}
          >
            <Text style={[styles.rangeText, range === r.key && styles.rangeTextActive]}>{r.key}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.chart} onLayout={onLayout}>
        {path ? (
          // Il grafico è decorativo per gli screen reader: il dato è nella didascalia qui sotto
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Svg width={width} height={CHART_HEIGHT}>
              <Line x1={0} y1={CHART_HEIGHT - 1} x2={width} y2={CHART_HEIGHT - 1} stroke={colors.border} strokeWidth={1} />
              <Path d={path} stroke={tone} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            </Svg>
          </View>
        ) : (
          <Text style={styles.empty}>
            {points.length === 0
              ? "L'andamento si costruisce da oggi: ogni giorno in cui apri l'app aggiunge un punto."
              : 'Serve almeno un altro giorno di storico per disegnare il grafico.'}
          </Text>
        )}
      </View>

      {path && (
        <Text
          style={styles.caption}
          accessibilityLabel={`Valore ${delta >= 0 ? 'aumentato' : 'diminuito'} di ${formatNumber(Math.abs(delta))} euro rispetto a ${rangeLabel}, versamenti inclusi`}
        >
          <Text style={{ color: tone, fontWeight: '700' }}>
            {formatSignedCurrency(delta)} ({delta >= 0 ? '+' : ''}{formatNumber(deltaPercent)}%)
          </Text>
          {` rispetto ${range === 'Tutto' ? `al ${formatDate(first.date)}` : `a ${rangeLabel}`} · valore, versamenti inclusi`}
          {hasIncomplete ? ' · alcuni giorni con dati incompleti' : ''}
        </Text>
      )}
    </View>
  );
};

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    marginTop: 16,
  },
  rangeRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  rangeButton: {
    minHeight: 28,
    paddingHorizontal: 10,
    justifyContent: 'center',
    borderRadius: 14,
  },
  rangeButtonActive: {
    backgroundColor: colors.inputBackground,
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
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },
  caption: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
    marginTop: 6,
    fontVariant: ['tabular-nums'],
  },
});
