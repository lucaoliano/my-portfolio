import { TextStyle } from 'react-native';

/**
 * Platform typography ramp (Apple HIG / Material 3).
 * Mirroring native type styles so text hierarchy is coherent and native-feeling.
 */
export const typography = {
  display: {
    fontSize: 40,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  headline: {
    fontSize: 32,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.3,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  headlineCard: {
    fontSize: 17,
    fontWeight: '600',
  },
  body: {
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 22,
  },
  bodyMedium: {
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 22,
  },
  bodyBold: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
  },
  subhead: {
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
  },
  subheadMedium: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
  subheadBold: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  caption: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  captionSmall: {
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 14,
  },
  metric: {
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  metricMedium: {
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  metricLarge: {
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
} as const satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof typography;
