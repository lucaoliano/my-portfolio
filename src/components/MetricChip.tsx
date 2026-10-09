import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { useAppTheme } from '../theme/ThemeContext';
import { withAlpha } from '../theme/colors';

interface MetricChipProps {
  /** Il segno del valore decide il colore: ≥ 0 guadagno, < 0 perdita. */
  value: number;
  /** "sm" header e gruppi della dashboard · "md" righe titolo · "lg" dettaglio titolo. */
  size?: 'sm' | 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

/**
 * Chip di rendimento (DESIGN.md › Chips › Metric chip): tinta al 12,5% del colore semantico,
 * testo dello stesso colore, cifre tabulari. Il testo deve contenere il segno esplicito,
 * così il significato non dipende solo dal colore.
 */
export const MetricChip: React.FC<MetricChipProps> = ({ value, size = 'sm', style, children }) => {
  const { colors } = useAppTheme();
  const tone = value >= 0 ? colors.positive : colors.negative;

  return (
    <View style={[styles.chip, size === 'md' && styles.chipMd, size === 'lg' && styles.chipLg, { backgroundColor: withAlpha(tone, 0.125) }, style]}>
      <Text style={[styles.text, size !== 'sm' && styles.textMd, { color: tone }]}>{children}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  chipMd: {
    paddingVertical: 3,
  },
  chipLg: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  textMd: {
    fontSize: 13,
  },
});
