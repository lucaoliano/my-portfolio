export const radii = {
  none: 0,
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 9999,
  round: 9999,
} as const;

export const continuousCurve = {
  borderCurve: 'continuous' as const,
};

export type Radii = typeof radii;
