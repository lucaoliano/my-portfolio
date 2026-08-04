import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, PanResponder, useWindowDimensions, GestureResponderEvent } from 'react-native';
import Svg, { Path, Line, Text as SvgText, G, Circle } from 'react-native-svg';
import { ThemeColors } from '../theme/colors';
import { useAppTheme } from '../theme/ThemeContext';
import { formatNumber } from '../utils/formatters';
import { MonteCarloYearPoint } from '../utils/pacCalculator';

interface MonteCarloChartProps {
  data: MonteCarloYearPoint[];
  totalInvested: number;
  height?: number;
}

const formatCompactK = (num: number): string => {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1).replace('.0', '')}M`;
  }
  if (num >= 1000) {
    return `${Math.round(num / 1000)}k`;
  }
  return `${Math.round(num)}`;
};

export const MonteCarloChart: React.FC<MonteCarloChartProps> = ({
  data,
  height = 280,
}) => {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);
  const { width: screenWidth } = useWindowDimensions();
  const width = Math.max(300, screenWidth - 32);

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const chartLayout = useMemo(() => {
    if (!data || data.length === 0) return null;

    const maxVal = Math.max(...data.map((d) => d.p90));

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

    const pTop = 20;
    const pBottom = 35;
    const pLeft = 45;
    const pRight = 15;

    const innerWidth = width - pLeft - pRight;
    const innerHeight = height - pTop - pBottom;

    const gridTicks = [1, 0.75, 0.5, 0.25, 0].map((ratio) => ({
      val: yMax * ratio,
      y: pTop + innerHeight * (1 - ratio),
    }));

    const points = data.map((d, i) => {
      const x = pLeft + (i / Math.max(1, data.length - 1)) * innerWidth;
      const yP10 = pTop + innerHeight - (d.p10 / yMax) * innerHeight;
      const yP50 = pTop + innerHeight - (d.p50 / yMax) * innerHeight;
      const yP90 = pTop + innerHeight - (d.p90 / yMax) * innerHeight;

      return {
        x,
        yP10,
        yP50,
        yP90,
        year: d.year,
        p10: d.p10,
        p50: d.p50,
        p90: d.p90,
      };
    });

    const pathP90 = `M ${points[0].x},${points[0].yP90} ` + points.slice(1).map((p) => `L ${p.x},${p.yP90}`).join(' ');
    const pathP50 = `M ${points[0].x},${points[0].yP50} ` + points.slice(1).map((p) => `L ${p.x},${p.yP50}`).join(' ');
    const pathP10 = `M ${points[0].x},${points[0].yP10} ` + points.slice(1).map((p) => `L ${p.x},${p.yP10}`).join(' ');

    const fanAreaPath =
      pathP90 + ' ' + points.slice().reverse().map((p) => `L ${p.x},${p.yP10}`).join(' ') + ' Z';

    return {
      points,
      pathP90,
      pathP50,
      pathP10,
      fanAreaPath,
      gridTicks,
      pLeft,
      pRight,
      pTop,
      pBottom,
      innerWidth,
      innerHeight,
      yMax,
    };
  }, [data, width, height]);

  const handleTouch = useCallback(
    (touchX: number) => {
      if (!chartLayout) return;
      const { points, pLeft, innerWidth } = chartLayout;
      const relativeX = touchX - pLeft;
      const ratio = Math.max(0, Math.min(1, relativeX / innerWidth));
      const index = Math.min(points.length - 1, Math.max(0, Math.round(ratio * (points.length - 1))));
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
        <Text style={styles.emptyText}>Dati Monte Carlo non disponibili</Text>
      </View>
    );
  }

  const selectedPoint =
    selectedIndex !== null
      ? chartLayout.points[selectedIndex]
      : chartLayout.points[chartLayout.points.length - 1];

  return (
    <View style={styles.container}>
      {selectedPoint && (
        <View style={styles.tooltipContainer}>
          <Text style={styles.tooltipYear}>Anno {selectedPoint.year} (Fasce di Probabilità)</Text>
          <View style={styles.tooltipRow}>
            <View style={[styles.legendDot, { backgroundColor: '#10B981' }]} />
            <Text style={styles.tooltipLabel}>90° percentile (Ottimistico):</Text>
            <Text style={[styles.tooltipValue, { color: '#10B981' }]}>
              € {formatNumber(selectedPoint.p90)}
            </Text>
          </View>
          <View style={styles.tooltipRow}>
            <View style={[styles.legendDot, { backgroundColor: '#3B82F6' }]} />
            <Text style={styles.tooltipLabel}>50° percentile (Mediana):</Text>
            <Text style={[styles.tooltipValue, { color: '#3B82F6' }]}>
              € {formatNumber(selectedPoint.p50)}
            </Text>
          </View>
          <View style={styles.tooltipRow}>
            <View style={[styles.legendDot, { backgroundColor: '#EF4444' }]} />
            <Text style={styles.tooltipLabel}>10° percentile (Pessimistico):</Text>
            <Text style={[styles.tooltipValue, { color: '#EF4444' }]}>
              € {formatNumber(selectedPoint.p10)}
            </Text>
          </View>
        </View>
      )}

      <View {...panResponder.panHandlers} style={{ width, height }}>
        <Svg width={width} height={height}>
          {/* Grid lines */}
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
                fontSize="11"
                textAnchor="end"
              >
                {formatCompactK(tick.val)}
              </SvgText>
            </G>
          ))}

          {/* Fan area (between P10 and P90) */}
          <Path d={chartLayout.fanAreaPath} fill="rgba(59, 130, 246, 0.12)" />

          {/* Lines */}
          <Path d={chartLayout.pathP90} fill="none" stroke="#10B981" strokeWidth="2.5" />
          <Path d={chartLayout.pathP50} fill="none" stroke="#3B82F6" strokeWidth="3" />
          <Path d={chartLayout.pathP10} fill="none" stroke="#EF4444" strokeWidth="2" strokeDasharray="3 3" />

          {/* Selected Indicator */}
          {selectedPoint && (
            <G>
              <Line
                x1={selectedPoint.x}
                y1={chartLayout.pTop}
                x2={selectedPoint.x}
                y2={chartLayout.pTop + chartLayout.innerHeight}
                stroke={colors.textSecondary}
                strokeWidth="1"
                strokeDasharray="2 2"
              />
              <Circle cx={selectedPoint.x} cy={selectedPoint.yP90} r="4" fill="#10B981" />
              <Circle cx={selectedPoint.x} cy={selectedPoint.yP50} r="5" fill="#3B82F6" stroke="#FFFFFF" strokeWidth="1.5" />
              <Circle cx={selectedPoint.x} cy={selectedPoint.yP10} r="4" fill="#EF4444" />
            </G>
          )}

          {/* X Axis bottom line */}
          <Line
            x1={chartLayout.pLeft}
            y1={chartLayout.pTop + chartLayout.innerHeight}
            x2={width - chartLayout.pRight}
            y2={chartLayout.pTop + chartLayout.innerHeight}
            stroke={colors.border}
            strokeWidth="1.5"
          />

          {/* X Labels */}
          {chartLayout.points.length > 0 && (
            <>
              <SvgText
                x={chartLayout.pLeft}
                y={height - 12}
                fill={colors.textSecondary}
                fontSize="11"
                textAnchor="start"
              >
                Anno 1
              </SvgText>
              <SvgText
                x={width - chartLayout.pRight}
                y={height - 12}
                fill={colors.textSecondary}
                fontSize="11"
                textAnchor="end"
              >
                Anno {chartLayout.points[chartLayout.points.length - 1].year}
              </SvgText>
            </>
          )}
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
      backgroundColor: 'rgba(18, 18, 18, 0.95)',
      borderRadius: 10,
      padding: 10,
      zIndex: 20,
      minWidth: 200,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.15)',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
      elevation: 5,
    },
    tooltipYear: {
      color: '#FFF',
      fontSize: 12,
      fontWeight: 'bold',
      marginBottom: 6,
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
      color: '#AAA',
      fontSize: 11,
      flex: 1,
    },
    tooltipValue: {
      color: '#FFF',
      fontSize: 12,
      fontWeight: '600',
    },
  });
