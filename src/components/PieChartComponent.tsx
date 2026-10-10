import { ThemeColors, withAlpha } from '../theme/colors';
import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { PieChart } from 'react-native-chart-kit';
import { useAppTheme } from '../theme/ThemeContext';

interface PieChartData {
  label: string;
  value: number;
}

interface PieChartComponentProps {
  data: PieChartData[];
  title?: string;
}

// Colori per classe di attivo, leggibili (≥3:1) sia su card scura sia su card bianca
const CATEGORY_COLORS: Record<'dark' | 'light', Record<string, string>> = {
  dark: {
    'Azioni': '#F87171',
    'Obbligazioni': '#60A5FA',
    'Materie prime': '#FACC15',
    'Criptovalute': '#A78BFA',
    'Liquidità': '#34D399',
    'Altro': '#9CA3AF',
  },
  light: {
    'Azioni': '#DC2626',
    'Obbligazioni': '#2563EB',
    'Materie prime': '#A16207',
    'Criptovalute': '#7C3AED',
    'Liquidità': '#047857',
    'Altro': '#6B7280',
  },
};
const FALLBACK_COLORS: Record<'dark' | 'light', string[]> = {
  dark: ['#FB923C', '#F472B6', '#22D3EE', '#FBBF24'],
  light: ['#B45309', '#BE185D', '#0E7490', '#C2410C'],
};

export const PieChartComponent: React.FC<PieChartComponentProps> = ({ data, title }) => {
  const { colors, theme } = useAppTheme();
  const styles = getStyles(colors);
  const { width: screenWidth } = useWindowDimensions();
  const mode = theme;

  if (!data || data.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>Dati non disponibili</Text>
      </View>
    );
  }

  const chartData = data.map((item, index) => {
    const color = CATEGORY_COLORS[mode][item.label] || FALLBACK_COLORS[mode][index % FALLBACK_COLORS[mode].length];
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
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 0,
    marginBottom: 16,
    alignItems: 'center',
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  emptyContainer: {
    padding: 20,
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
    marginTop: 16,
    width: '100%',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
    marginBottom: 8,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 6,
  },
  legendText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  }
});
