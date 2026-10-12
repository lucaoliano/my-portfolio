import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, LayoutChangeEvent } from 'react-native';
import Svg, { Path, Line } from 'react-native-svg';
import { useAppTheme } from '../theme/ThemeContext';
import { ThemeColors } from '../theme/colors';
import { formatDate, formatNumber, formatSignedCurrency } from '../utils/formatters';
import { HistoryPoint } from '../hooks/usePortfolioHistory';

type Range = '7G' | '1M' | '1A' | 'Tutto';
const RANGES: { key: Range; days: number | null; label: string; spoken: string }[] = [
  { key: '7G', days: 7, label: '7 giorni fa', spoken: 'Ultimi 7 giorni' },
  { key: '1M', days: 30, label: 'un mese fa', spoken: 'Ultimo mese' },
  { key: '1A', days: 365, label: 'un anno fa', spoken: 'Ultimo anno' },
  { key: 'Tutto', days: null, label: "l'inizio dello storico", spoken: 'Tutto lo storico' },
];

const CHART_HEIGHT = 64;
const PAD = 4;

export interface LiveHistoryPoint {
  invested: number;
  costBasis: number;
}

interface PortfolioTrendChartProps {
  points: HistoryPoint[];
  /** Valori di adesso: l'ultimo punto è quello live, non la fotografia salvata */
  live: LiveHistoryPoint | null;
}

const dateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const daysAgoKey = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return dateKey(d);
};

/**
 * Andamento del guadagno (valore meno capitale versato): i versamenti del PAC non sembrano rendimento,
 * quindi verde e rosso tornano a voler dire guadagno e perdita, come nel resto dell'app.
 */
export const PortfolioTrendChart: React.FC<PortfolioTrendChartProps> = ({ points, live }) => {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);
  const [range, setRange] = useState<Range>('1M');
  const [width, setWidth] = useState(0);

  // Il punto di oggi viene dai numeri live
  const allPoints = useMemo(() => {
    const today = dateKey(new Date());
    const past = points.filter(p => p.date !== today);
    const stored = points.find(p => p.date === today);
    const todayPoint = live
      ? { date: today, gain: live.invested - live.costBasis, costBasis: live.costBasis, complete: true, backfilled: false }
      : stored
        ? { date: today, gain: stored.invested - stored.costBasis, costBasis: stored.costBasis, complete: stored.complete, backfilled: false }
        : null;
    const mapped = past.map(p => ({ date: p.date, gain: p.invested - p.costBasis, costBasis: p.costBasis, complete: p.complete, backfilled: !!p.backfilled }));
    return todayPoint ? [...mapped, todayPoint] : mapped;
  }, [points, live]);

  // Un periodo più lungo dello storico disponibile disegnerebbe lo stesso grafico di quello prima: lo spegniamo
  const oldest = allPoints[0]?.date;
  const isRangeAvailable = (r: typeof RANGES[number], index: number) => {
    if (!oldest || r.days === null || index === 0) return true;
    const previous = RANGES[index - 1].days!;
    return oldest < daysAgoKey(previous);
  };
  const activeRange = RANGES.find((r, i) => r.key === range && isRangeAvailable(r, i)) ? range : '7G';

  const series = useMemo(() => {
    const selected = RANGES.find(r => r.key === activeRange)!;
    const from = selected.days ? daysAgoKey(selected.days) : null;
    return allPoints.filter(p => !from || p.date >= from);
  }, [allPoints, activeRange]);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const first = series[0];
  const last = series[series.length - 1];
  const delta = first && last ? last.gain - first.gain : 0;
  const tone = delta >= 0 ? colors.positive : colors.negative;
  const rangeLabel = RANGES.find(r => r.key === activeRange)!.label;
  const hasIncomplete = series.some(p => !p.complete);
  const hasBackfill = series.some(p => p.backfilled);

  const chart = useMemo(() => {
    if (series.length < 2 || width === 0) return null;
    const values = series.map(p => p.gain);
    let min = Math.min(...values);
    let max = Math.max(...values);
    // Scala minima pari al 2% del capitale versato: un movimento di pochi euro non deve sembrare un crollo
    const minSpan = Math.max(1, Math.abs(series[series.length - 1].costBasis) * 0.02);
    if (max - min < minSpan) {
      const mid = (max + min) / 2;
      min = mid - minSpan / 2;
      max = mid + minSpan / 2;
    }
    const span = max - min;
    const toY = (v: number) => PAD + (1 - (v - min) / span) * (CHART_HEIGHT - PAD * 2);
    const path = series
      .map((p, i) => {
        const x = (i / (series.length - 1)) * width;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${toY(p.gain).toFixed(1)}`;
      })
      .join(' ');
    // Linea del pareggio solo se il periodo la attraversa: sopra si guadagna, sotto si perde
    const zeroY = min < 0 && max > 0 ? toY(0) : null;
    return { path, zeroY };
  }, [series, width]);

  return (
    <View style={styles.container}>
      <View style={styles.rangeRow} accessibilityRole="tablist" aria-label="Periodo del grafico">
        {RANGES.map((r, index) => {
          const available = isRangeAvailable(r, index);
          const selected = activeRange === r.key;
          return (
            <TouchableOpacity
              key={r.key}
              onPress={() => setRange(r.key)}
              disabled={!available}
              style={[styles.rangeButton, selected && styles.rangeButtonActive, !available && styles.rangeButtonDisabled]}
              accessibilityRole="tab"
              aria-selected={selected}
              aria-disabled={!available}
              accessibilityLabel={available ? r.spoken : `${r.spoken}: storico non ancora sufficiente`}
              hitSlop={{ top: 8, bottom: 8, left: 3, right: 3 }}
            >
              <Text style={[styles.rangeText, selected && styles.rangeTextActive]}>{r.key}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.chart} onLayout={onLayout}>
        {chart ? (
          // Decorativo per gli screen reader (anche sul web): il dato è nella didascalia
          <View aria-hidden importantForAccessibility="no-hide-descendants">
            <Svg width={width} height={CHART_HEIGHT}>
              {chart.zeroY !== null && (
                <Line x1={0} y1={chart.zeroY} x2={width} y2={chart.zeroY} stroke={colors.border} strokeWidth={1} strokeDasharray="4 4" />
              )}
              <Line x1={0} y1={CHART_HEIGHT - 1} x2={width} y2={CHART_HEIGHT - 1} stroke={colors.border} strokeWidth={1} />
              <Path d={chart.path} stroke={tone} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            </Svg>
          </View>
        ) : (
          <Text style={styles.empty}>
            {allPoints.length === 0
              ? "L'andamento del guadagno si costruisce da oggi: ogni giorno in cui apri l'app aggiunge un punto."
              : 'Serve almeno un altro giorno di storico per disegnare il grafico.'}
          </Text>
        )}
      </View>

      {chart && (
        <Text
          style={styles.caption}
          accessibilityLabel={`Guadagno ${delta >= 0 ? 'aumentato' : 'diminuito'} di ${formatNumber(Math.abs(delta))} euro rispetto a ${activeRange === 'Tutto' ? formatDate(first.date) : rangeLabel}, versamenti esclusi`}
        >
          <Text style={{ color: tone, fontWeight: '700' }}>{formatSignedCurrency(delta)}</Text>
          {` di guadagno rispetto ${activeRange === 'Tutto' ? `al ${formatDate(first.date)}` : `a ${rangeLabel}`} · versamenti esclusi`}
          {hasBackfill ? ' · giorni passati ricostruiti dai prezzi di chiusura' : ''}
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
    minWidth: 40,
    alignItems: 'center',
    paddingHorizontal: 10,
    justifyContent: 'center',
    borderRadius: 14,
  },
  rangeButtonActive: {
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rangeButtonDisabled: {
    opacity: 0.4,
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
