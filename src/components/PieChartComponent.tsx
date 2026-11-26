import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { PieChart } from 'react-native-chart-kit';
import { ThemeColors, withAlpha } from '../theme/colors';
import { useAppTheme } from '../theme/ThemeContext';
import { radii, continuousCurve } from '../theme/radius';
import { spacing } from '../theme/spacing';

interface PieChartData {
  label: string;
  value: number;
}

interface PieChartComponentProps {
  data: PieChartData[];
  title?: string;
}

// Colori per classe di attivo centralizzati nel tema (src/theme/colors.ts)
const getCategoryColor = (label: string, colors: ThemeColors, index: number): string => {
  switch (label) {
    case 'Azioni':
      return colors.assetStocks;
    case 'Obbligazioni':
      return colors.assetBonds;
    case 'Materie prime':
      return colors.assetCommodities;
    case 'Criptovalute':
      return colors.assetCrypto;
    case 'Liquidità':
      return colors.assetCash;
    case 'Altro':
      return colors.assetOther;
    default:
      return colors.assetPalette[index % colors.assetPalette.length];
  }
};

export const PieChartComponent: React.FC<PieChartComponentProps> = ({ data, title }) => {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);
  const { width: screenWidth } = useWindowDimensions();

  if (!data || data.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>Dati non disponibili</Text>
      </View>
    );
  }

  const chartData = data.map((item, index) => {
    const color = getCategoryColor(item.label, colors, index);
    return {
      name: item.label,
      population: item.value,
      color: color,
      legendFontColor: 'transparent',
      legendFontSize: 0
    };
  });

  const chartWidth = Math.max(200, Math.min(screenWidth - 32, 400));

  return (
    <View style={styles.container}>
      {title && <Text style={styles.title}>{title}</Text>}
      <PieChart
        data={chartData}
        width={chartWidth}
        height={200}
        chartConfig={{
          backgroundColor: colors.card,
          backgroundGradientFrom: colors.card,
          backgroundGradientTo: colors.card,
          color: (opacity = 1) => withAlpha(colors.text, opacity),
        }}
        accessor={"population"}
        backgroundColor={"transparent"}
        hasLegend={false}
        paddingLeft={chartWidth / 4 + ""}
        center={[0, 0]}
        absolute
      />
      <View style={styles.legendContainer}>
        {chartData.map((item, index) => (
          <View key={index} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: item.color }]} />
            <Text style={styles.legendText}>
              {item.population}% {item.name}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    ...continuousCurve,
    paddingVertical: spacing.lg,
    paddingHorizontal: 0,
    marginBottom: spacing.lg,
    alignItems: 'center',
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: spacing.lg,
    alignSelf: 'flex-start',
  },
  emptyContainer: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  legendContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: spacing.lg,
    width: '100%',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: spacing.lg,
    marginBottom: spacing.sm,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: radii.xs,
    marginRight: 6,
  },
  legendText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  }
});
