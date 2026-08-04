import React, { useMemo } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Path, Line, Text as SvgText, G } from 'react-native-svg';
import { ThemeColors } from '../theme/colors';
import { useAppTheme } from '../theme/ThemeContext';
import { formatNumber } from '../utils/formatters';
import { PacParams, calculatePAC } from '../utils/pacCalculator';

interface FeeDragComparisonChartProps {
  baseParams: PacParams;
  lowCostTER?: number;
  highCostTER?: number;
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

export const FeeDragComparisonChart: React.FC<FeeDragComparisonChartProps> = ({
  baseParams,
  lowCostTER = 0.20,
  highCostTER = 1.80,
  height = 260,
}) => {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);
  const { width: screenWidth } = useWindowDimensions();
  const width = Math.max(300, screenWidth - 32);

  const chartData = useMemo(() => {
    const grossReturn = baseParams.expectedAnnualReturn;
    const lowReturn = Math.max(0, grossReturn - lowCostTER);
    const highReturn = Math.max(0, grossReturn - highCostTER);

    const lowRes = calculatePAC({ ...baseParams, expectedAnnualReturn: lowReturn, applyStampDuty: false });
    const highRes = calculatePAC({ ...baseParams, expectedAnnualReturn: highReturn, applyStampDuty: false });

    const lowYears = lowRes.yearlyData;
    const highYears = highRes.yearlyData;

    const maxVal = Math.max(...lowYears.map((d) => d.endBalance));

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

    const points = lowYears.map((d, i) => {
      const x = pLeft + (i / Math.max(1, lowYears.length - 1)) * innerWidth;
      const lowY = pTop + innerHeight - (d.endBalance / yMax) * innerHeight;
      const highY = pTop + innerHeight - ((highYears[i]?.endBalance || 0) / yMax) * innerHeight;

      return {
        x,
        lowY,
        highY,
        year: d.year,
        lowBalance: d.endBalance,
        highBalance: highYears[i]?.endBalance || 0,
      };
    });

    const lowPath = `M ${points[0].x},${points[0].lowY} ` + points.slice(1).map((p) => `L ${p.x},${p.lowY}`).join(' ');
    const highPath = `M ${points[0].x},${points[0].highY} ` + points.slice(1).map((p) => `L ${p.x},${p.highY}`).join(' ');

    const diffAreaPath =
      lowPath + ' ' + points.slice().reverse().map((p) => `L ${p.x},${p.highY}`).join(' ') + ' Z';

    const finalLow = points[points.length - 1]?.lowBalance || 0;
    const finalHigh = points[points.length - 1]?.highBalance || 0;
    const diff = finalLow - finalHigh;

    return {
      points,
      lowPath,
      highPath,
      diffAreaPath,
      gridTicks,
      pLeft,
      pRight,
      pTop,
      pBottom,
      finalLow,
      finalHigh,
      diff,
    };
  }, [baseParams, lowCostTER, highCostTER, width, height]);

  return (
    <View style={styles.container}>
      <View style={styles.summaryBox}>
        <View style={styles.summaryCol}>
          <Text style={styles.summaryLabel}>Con ETF ({lowCostTER}% TER):</Text>
          <Text style={[styles.summaryVal, { color: '#00D166' }]}>€ {formatNumber(chartData.finalLow)}</Text>
        </View>
        <View style={styles.summaryCol}>
          <Text style={styles.summaryLabel}>Con Fondo Banca ({highCostTER}% TER):</Text>
          <Text style={styles.summaryVal}>€ {formatNumber(chartData.finalHigh)}</Text>
        </View>
      </View>

      <View style={styles.lossBadge}>
        <Text style={styles.lossText}>
          💸 Denaro perso in commissioni a lungo termine: <Text style={{ fontWeight: 'bold' }}>-€ {formatNumber(chartData.diff)}</Text>
        </Text>
      </View>

      <Svg width={width} height={height}>
        {/* Grid lines */}
        {chartData.gridTicks.map((tick, idx) => (
          <G key={`tick-${idx}`}>
            <Line
              x1={chartData.pLeft}
              y1={tick.y}
              x2={width - chartData.pRight}
              y2={tick.y}
              stroke={colors.border}
              strokeWidth="1"
            />
            <SvgText
              x={chartData.pLeft - 8}
              y={tick.y + 4}
              fill={colors.textSecondary}
              fontSize="11"
              textAnchor="end"
            >
              {formatCompactK(tick.val)}
            </SvgText>
          </G>
        ))}

        {/* Shaded difference area (fee drag) */}
        <Path d={chartData.diffAreaPath} fill="rgba(239, 68, 68, 0.15)" />

        {/* Lines */}
        <Path d={chartData.lowPath} fill="none" stroke="#00D166" strokeWidth="3" />
        <Path d={chartData.highPath} fill="none" stroke="#EF4444" strokeWidth="2.5" strokeDasharray="4 4" />

        {/* X Axis bottom line */}
        <Line
          x1={chartData.pLeft}
          y1={chartData.pTop + height - chartData.pTop - chartData.pBottom}
          x2={width - chartData.pRight}
          y2={chartData.pTop + height - chartData.pTop - chartData.pBottom}
          stroke={colors.border}
          strokeWidth="1.5"
        />

        {/* X Labels */}
        <SvgText
          x={chartData.pLeft}
          y={height - 12}
          fill={colors.textSecondary}
          fontSize="11"
          textAnchor="start"
        >
          Anno 1
        </SvgText>
        <SvgText
          x={width - chartData.pRight}
          y={height - 12}
          fill={colors.textSecondary}
          fontSize="11"
          textAnchor="end"
        >
          Anno {chartData.points[chartData.points.length - 1]?.year}
        </SvgText>
      </Svg>
    </View>
  );
};

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      backgroundColor: colors.card,
      borderRadius: 16,
      paddingTop: 12,
      paddingBottom: 4,
      marginTop: 8,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    summaryBox: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      marginBottom: 8,
    },
    summaryCol: {
      flex: 1,
    },
    summaryLabel: {
      color: colors.textSecondary,
      fontSize: 12,
      marginBottom: 2,
    },
    summaryVal: {
      color: colors.text,
      fontSize: 15,
      fontWeight: 'bold',
    },
    lossBadge: {
      backgroundColor: 'rgba(239, 68, 68, 0.12)',
      borderRadius: 8,
      marginHorizontal: 16,
      paddingVertical: 8,
      paddingHorizontal: 12,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: 'rgba(239, 68, 68, 0.3)',
    },
    lossText: {
      color: '#EF4444',
      fontSize: 13,
      textAlign: 'center',
    },
  });
