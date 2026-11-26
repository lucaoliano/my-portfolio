// Design system spacing layout tokens (see DESIGN.md)

export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,

  // Common Header layout tokens across all screens
  headerPaddingTop: 24,
  headerPaddingBottom: 10,
  headerPaddingHorizontal: 12,
  headerMinHeight: 56,
  headerButtonSize: 44,
  headerTitleSize: 18,

  // Standard Screen Edge Padding (consistent 16px rhythm)
  screenPaddingHorizontal: 16,
  screenPaddingVertical: 16,
} as const;

export type Spacing = typeof spacing;
