import { ThemeColors } from '../theme/colors';
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

// Pre-defined category colors
const categoryColors: Record<string, string> = {
  'Azioni': '#EF4444', // Red
  'Obbligazioni': '#3B82F6', // Blue
  'Materie prime': '#EAB308', // Yellow
  'Criptovalute': '#8B5CF6', // Purple
  'Liquidità': '#10B981', // Green
  'Altro': '#6B7280', // Gray
};

const generateColors = (count: number, colors: ThemeColors) => {
  const baseColors = [
    colors.primary,
    '#3B82F6', // Blue
    colors.positive,
    colors.negative,
    '#F59E0B', // Amber
    '#8B5CF6', // Purple
    '#EC4899', // Pink
    '#14B8A6', // Teal
    '#06B6D4', // Cyan
    '#F97316', // Orange
  ];
  
  return Array.from({ length: count }).map((_, i) => baseColors[i % baseColors.length]);
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

  const chartColors = generateColors(data.length, colors);
  
  const chartData = data.map((item, index) => {
    const color = categoryColors[item.label] || chartColors[index];
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
          color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
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
