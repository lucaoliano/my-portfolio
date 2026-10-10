import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, PanResponder, useWindowDimensions, GestureResponderEvent } from 'react-native';
import Svg, { Rect, Line, Text as SvgText, G } from 'react-native-svg';
import { ThemeColors, withAlpha } from '../theme/colors';
import { useAppTheme } from '../theme/ThemeContext';
import { formatNumber, formatSignedCurrency, formatDecimal } from '../utils/formatters';
import { PacYearData } from '../utils/pacCalculator';

const SVG_FONT = 'system-ui, -apple-system, sans-serif';

interface PacGrowthChartProps {
  data: PacYearData[];
  initialAmount?: number;
  height?: number;
  hasWithdrawalPhase?: boolean;
  accumulationYears?: number;
  applyTaxes?: boolean;
  displayRealValues?: boolean;
  /** Etichetta del periodo della rata di prelievo, es. "/ mese", "/ trimestre" */
  withdrawalPeriodLabel?: string;
}

const formatCompactK = (num: number): string => {
  if (num >= 1000000) {
    return `${formatDecimal(num / 1000000, 1).replace(/[,.]0$/, '')}M`;
  }
  if (num >= 1000) {
    return `${Math.round(num / 1000)}k`;
  }
  return `${Math.round(num)}`;
};

export const PacGrowthChart: React.FC<PacGrowthChartProps> = ({
  data,
  height = 280,
  hasWithdrawalPhase = false,
  accumulationYears = 25,
  applyTaxes = false,
  displayRealValues = false,
  withdrawalPeriodLabel = '/ mese',
}) => {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);
  const { width: screenWidth } = useWindowDimensions();
  const width = Math.max(300, screenWidth - 32);

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const chartLayout = useMemo(() => {
    if (!data || data.length === 0) return null;

    const maxVal = Math.max(
      ...data.map((d) => {
        const bal = displayRealValues
          ? (applyTaxes && d.realNetEndBalance !== undefined ? d.realNetEndBalance : d.realEndBalance)
          : (applyTaxes && d.netEndBalance !== undefined ? d.netEndBalance : d.endBalance);
        const withdrawn = displayRealValues ? d.realTotalWithdrawn : d.totalWithdrawn;
        return Math.max(bal, withdrawn + bal);
      })
    );

    let yMax = 500000;
    if (maxVal > 0) {
      const magnitude = Math.pow(10, Math.floor(Math.log10(maxVal)));
      const normalized = maxVal / magnitude;
      let niceNorm = 1;
      if (normalized <= 1) niceNorm = 1;
      else if (normalized <= 2) niceNorm = 2;
      else if (normalized <= 5) niceNorm = 5;
      else niceNorm = 10;
      yMax = Math.max(maxVal * 1.15, niceNorm * magnitude);
    }

    const pTop = 24;
    const pBottom = 40;
    const pLeft = 48;
    const pRight = 15;

    const innerWidth = width - pLeft - pRight;
    const innerHeight = height - pTop - pBottom;

    const gridTicks = [1, 0.75, 0.5, 0.25, 0].map((ratio) => ({
      val: yMax * ratio,
      y: pTop + innerHeight * (1 - ratio),
    }));

    const barCount = data.length;
    const totalSlotWidth = innerWidth / barCount;
    const barWidth = Math.max(2.5, Math.min(16, totalSlotWidth * 0.68));

    let splitX: number | null = null;

    const bars = data.map((d, i) => {
      const x = pLeft + i * totalSlotWidth + (totalSlotWidth - barWidth) / 2;
      const isAccumulation = d.phase === 'accumulation';
      
      if (d.year === accumulationYears) {
        splitX = x + barWidth + totalSlotWidth / 4;
      }

      const effectiveBal = displayRealValues
        ? (applyTaxes && d.realNetEndBalance !== undefined ? d.realNetEndBalance : d.realEndBalance)
        : (applyTaxes && d.netEndBalance !== undefined ? d.netEndBalance : d.endBalance);

      const effectiveInvested = displayRealValues ? d.realTotalInvested : d.totalInvested;

      const totalInvestedHeight = Math.max(0, (effectiveInvested / yMax) * innerHeight);
      const totalBalanceHeight = Math.max(0, (effectiveBal / yMax) * innerHeight);
      const interestHeight = Math.max(0, totalBalanceHeight - totalInvestedHeight);

      const investedY = pTop + innerHeight - totalInvestedHeight;
      const interestY = pTop + innerHeight - totalBalanceHeight;
      const balanceY = pTop + innerHeight - totalBalanceHeight;

      return {
        x,
        barWidth,
        isAccumulation,
        investedY,
        investedHeight: totalInvestedHeight,
        interestY,
        interestHeight,
        balanceY,
        balanceHeight: totalBalanceHeight,
        year: d.year,
        age: d.age,
        dateLabel: d.dateLabel,
        totalInvested: d.totalInvested,
        realTotalInvested: d.realTotalInvested,
        totalInterest: d.totalInterest,
        effectiveInvested,
        totalWithdrawn: d.totalWithdrawn,
        realTotalWithdrawn: d.realTotalWithdrawn,
        withdrawalsThisYear: d.withdrawalsThisYear,
        realWithdrawalsThisYear: d.realWithdrawalsThisYear,
        endBalance: d.endBalance,
        realEndBalance: d.realEndBalance,
        netEndBalance: d.netEndBalance,
        effectiveBalance: effectiveBal,
        monthlyWithdrawalNominal: d.monthlyWithdrawalNominal,
        monthlyWithdrawalReal: d.monthlyWithdrawalReal,
        phase: d.phase,
      };
    });

    const today = new Date();
    const startYear = today.getFullYear();
    const months = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
    const monthName = months[today.getMonth()];
    const day = today.getDate();
    const startDateLabel = `${day} ${monthName} ${startYear}`;
    const endDateLabel = `${day} ${monthName} ${startYear + barCount}`;

    return {
      bars,
      gridTicks,
      pLeft,
      pRight,
      pTop,
      pBottom,
      innerWidth,
      innerHeight,
      yMax,
      splitX,
      startDateLabel,
      endDateLabel,
    };
  }, [data, width, height, accumulationYears, applyTaxes, displayRealValues]);

  const handleTouch = useCallback(
    (touchX: number) => {
      if (!chartLayout) return;
      const { bars, pLeft, innerWidth } = chartLayout;
      const relativeX = touchX - pLeft;
      const ratio = Math.max(0, Math.min(1, relativeX / innerWidth));
      const index = Math.min(bars.length - 1, Math.max(0, Math.floor(ratio * bars.length)));
      setSelectedIndex(index);
    },
    [chartLayout]
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt: GestureResponderEvent) => {
          handleTouch(evt.nativeEvent.locationX);
        },
        onPanResponderMove: (evt: GestureResponderEvent) => {
          handleTouch(evt.nativeEvent.locationX);
        },
        onPanResponderRelease: () => {},
      }),
    [handleTouch]
  );

  if (!chartLayout) {
    return (
      <View style={[styles.container, { height }]}>
        <Text style={styles.emptyText}>Dati non disponibili</Text>
      </View>
    );
  }

  const selectedPoint =
    selectedIndex !== null
      ? chartLayout.bars[selectedIndex]
      : chartLayout.bars[chartLayout.bars.length - 1];

  const colorInvested = colors.chartInvested;
  const colorInterest = colors.chartGrowth;
  const colorWithdrawalBalance = colors.info;
  const colorWithdrawn = colors.chartWithdrawal;

  const lastBar = chartLayout.bars[chartLayout.bars.length - 1];
  const peakBar = chartLayout.bars.find((b) => b.year === accumulationYears) ?? lastBar;
  const summary =
    `Grafico a barre${displayRealValues ? ' in euro di oggi' : ''}: a fine accumulo (${peakBar.dateLabel ?? ''}) valore stimato €${formatNumber(peakBar.effectiveBalance)}, ` +
    `versato €${formatNumber(peakBar.effectiveInvested)}` +
    (hasWithdrawalPhase
      ? `; dopo i prelievi (${lastBar.dateLabel ?? ''}) capitale residuo €${formatNumber(lastBar.effectiveBalance)}.`
      : '.');

  return (
    <View style={styles.container}>
      {selectedPoint && (
        <View style={styles.tooltipContainer}>
          <View style={styles.tooltipHeaderRow}>
            <Text style={styles.tooltipYear}>
              Anno {selectedPoint.year} ({selectedPoint.dateLabel || ''}){selectedPoint.age ? ` • ${selectedPoint.age} anni` : ''}
            </Text>
            <View style={styles.phaseBadge}>
              <Text style={styles.phaseBadgeText}>
                {selectedPoint.phase === 'accumulation' ? 'Accumulo' : 'Prelievo'}
              </Text>
            </View>
          </View>

          {selectedPoint.phase === 'accumulation' ? (
            <>
              <View style={styles.tooltipRow}>
                <View style={[styles.legendDot, { backgroundColor: colorInvested }]} />
                <Text style={styles.tooltipLabel}>Versato:</Text>
                <Text style={styles.tooltipValue}>€{formatNumber(selectedPoint.effectiveInvested)}</Text>
              </View>
              <View style={styles.tooltipRow}>
                <View style={[styles.legendDot, { backgroundColor: colorInterest }]} />
                <Text style={styles.tooltipLabel}>{applyTaxes ? 'Rendimento netto:' : 'Rendimento:'}</Text>
                <Text style={styles.tooltipValue}>
                  {formatSignedCurrency(selectedPoint.effectiveBalance - selectedPoint.effectiveInvested)}
                </Text>
              </View>
            </>
          ) : (
            <>
              <View style={styles.tooltipRow}>
                <View style={[styles.legendDot, { backgroundColor: colorWithdrawn }]} />
                <Text style={styles.tooltipLabel}>Prelievi lordi totali:</Text>
                <Text style={styles.tooltipValue}>
                  €{formatNumber(displayRealValues ? selectedPoint.realTotalWithdrawn : selectedPoint.totalWithdrawn)}
                </Text>
              </View>
              {selectedPoint.monthlyWithdrawalNominal !== undefined && selectedPoint.monthlyWithdrawalNominal > 0 && (
                <View style={styles.tooltipRow}>
                  <Text style={styles.tooltipLabel}>
                    Rata: €{formatNumber(selectedPoint.monthlyWithdrawalNominal)} {withdrawalPeriodLabel} (oggi: €{formatNumber(selectedPoint.monthlyWithdrawalReal ?? 0)})
                  </Text>
                </View>
              )}
              <View style={styles.tooltipRow}>
                <View style={[styles.legendDot, { backgroundColor: colorWithdrawalBalance }]} />
                <Text style={styles.tooltipLabel}>
                  {applyTaxes ? 'Residuo netto:' : 'Capitale residuo:'}
                </Text>
                <Text style={styles.tooltipValue}>€{formatNumber(selectedPoint.effectiveBalance)}</Text>
              </View>
              {applyTaxes && (
                <View style={styles.tooltipRow}>
                  <Text style={styles.tooltipLabel}>
                    (lordo: €{formatNumber(displayRealValues ? selectedPoint.realEndBalance : selectedPoint.endBalance)})
                  </Text>
                </View>
              )}
            </>
          )}

          <View
            style={[
              styles.tooltipRow,
              {
                marginTop: 4,
                paddingTop: 4,
                borderTopWidth: 1,
                borderTopColor: colors.tooltipBorder,
              },
            ]}
          >
            <Text style={[styles.tooltipLabel, { fontWeight: 'bold' }]}>
              {displayRealValues
                ? 'Patrimonio reale di oggi:'
                : selectedPoint.phase === 'accumulation'
                ? applyTaxes ? 'Totale netto:' : 'Totale accumulato:'
                : applyTaxes ? 'Patrimonio residuo netto:' : 'Patrimonio residuo:'}
            </Text>
            <Text style={[styles.tooltipValue, { fontWeight: 'bold' }]}>
              €{formatNumber(selectedPoint.effectiveBalance)}
            </Text>
          </View>
        </View>
      )}

      <View {...panResponder.panHandlers} style={{ width, height }} role="img" aria-label={summary}>
        <Svg width={width} height={height}>
          {/* Grid lines and Y axis labels */}
          {chartLayout.gridTicks.map((tick, idx) => (
            <G key={`tick-${idx}`}>
              <Line
                x1={chartLayout.pLeft}
                y1={tick.y}
                x2={width - chartLayout.pRight}
                y2={tick.y}
                stroke={colors.border}
                strokeWidth="1"
              />
              <SvgText
                x={chartLayout.pLeft - 8}
                y={tick.y + 4}
                fill={colors.textSecondary}
                fontSize="12"
            fontFamily={SVG_FONT}
                textAnchor="end"
              >
                {formatCompactK(tick.val)}
              </SvgText>
            </G>
          ))}

          {/* Phase Divider Vertical Line */}
          {hasWithdrawalPhase && chartLayout.splitX !== null && (
            <G>
              <Line
                x1={chartLayout.splitX}
                y1={chartLayout.pTop}
                x2={chartLayout.splitX}
                y2={chartLayout.pTop + chartLayout.innerHeight}
                stroke={colors.textSecondary}
                strokeWidth="1.5"
                strokeDasharray="4 3"
              />
              <SvgText
                x={chartLayout.splitX}
                y={chartLayout.pTop - 8}
                fill={colors.textSecondary}
                fontSize="12"
                fontFamily={SVG_FONT}
                fontWeight="bold"
                textAnchor="middle"
              >
                Inizio prelievi
              </SvgText>
            </G>
          )}

          {/* Bars */}
          {chartLayout.bars.map((bar, idx) => {
            const isSelected = selectedIndex === idx;

            if (bar.isAccumulation) {
              return (
                <G key={`bar-${idx}`}>
                  <Rect
                    x={bar.x}
                    y={bar.investedY}
                    width={bar.barWidth}
                    height={bar.investedHeight}
                    fill={colorInvested}
                    opacity={isSelected ? 1 : 0.85}
                    rx={2}
                  />
                  {bar.interestHeight > 0 && (
                    <Rect
                      x={bar.x}
                      y={bar.interestY}
                      width={bar.barWidth}
                      height={bar.interestHeight}
                      fill={colorInterest}
                      opacity={isSelected ? 1 : 0.85}
                      rx={2}
                    />
                  )}
                  {isSelected && (
                    <Rect
                      x={bar.x - 2}
                      y={bar.interestY - 2}
                      width={bar.barWidth + 4}
                      height={bar.investedHeight + bar.interestHeight + 4}
                      fill="none"
                      stroke={colors.text}
                      strokeWidth="1.5"
                      rx={4}
                    />
                  )}
                </G>
              );
            } else {
              return (
                <G key={`bar-${idx}`}>
                  <Rect
                    x={bar.x}
                    y={bar.balanceY}
                    width={bar.barWidth}
                    height={bar.balanceHeight}
                    fill={colorWithdrawalBalance}
                    opacity={isSelected ? 1 : 0.85}
                    rx={2}
                  />
                  {isSelected && (
                    <Rect
                      x={bar.x - 2}
                      y={bar.balanceY - 2}
                      width={bar.barWidth + 4}
                      height={bar.balanceHeight + 4}
                      fill="none"
                      stroke={colors.text}
                      strokeWidth="1.5"
                      rx={4}
                    />
                  )}
                </G>
              );
            }
          })}

          {/* X Axis bottom line */}
          <Line
            x1={chartLayout.pLeft}
            y1={chartLayout.pTop + chartLayout.innerHeight}
            x2={width - chartLayout.pRight}
            y2={chartLayout.pTop + chartLayout.innerHeight}
            stroke={colors.border}
            strokeWidth="1.5"
          />

          {/* X Axis Date labels */}
          <SvgText
            x={chartLayout.pLeft}
            y={height - 12}
            fill={colors.textSecondary}
            fontSize="12"
            fontFamily={SVG_FONT}
            fontWeight="500"
            textAnchor="start"
          >
            {chartLayout.startDateLabel}
          </SvgText>
          <SvgText
            x={width - chartLayout.pRight}
            y={height - 12}
            fill={colors.textSecondary}
            fontSize="12"
            fontFamily={SVG_FONT}
            fontWeight="500"
            textAnchor="end"
          >
            {chartLayout.endDateLabel}
          </SvgText>
        </Svg>
      </View>
    </View>
  );
};

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      backgroundColor: colors.card,
      borderRadius: 16,
      paddingTop: 8,
      paddingBottom: 4,
      marginTop: 8,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
      position: 'relative',
    },
    emptyText: {
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: 20,
    },
    tooltipContainer: {
      position: 'absolute',
      top: 8,
      right: 12,
      backgroundColor: colors.tooltipBackground,
      borderRadius: 10,
      padding: 10,
      zIndex: 20,
      minWidth: 200,
      borderWidth: 1,
      borderColor: colors.tooltipBorder,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
      elevation: 5,
    },
    tooltipHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 6,
    },
    tooltipYear: {
      color: colors.tooltipText,
      fontSize: 12,
      fontWeight: 'bold',
    },
    phaseBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      marginLeft: 8,
      backgroundColor: withAlpha(colors.tooltipTextSecondary, 0.15),
    },
    phaseBadgeText: {
      fontSize: 12,
      fontWeight: 'bold',
      color: colors.tooltipText,
    },
    tooltipRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 3,
    },
    legendDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginRight: 6,
    },
    tooltipLabel: {
      color: colors.tooltipTextSecondary,
      fontSize: 12,
      flex: 1,
      marginRight: 8,
    },
    tooltipValue: {
      color: colors.tooltipText,
      fontSize: 12,
      fontWeight: '600',
      fontVariant: ['tabular-nums'],
    },
  });
