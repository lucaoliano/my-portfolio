/**
 * Standard CSS boxShadow tokens across the app.
 * Follows Expo native UI guidelines (never use legacy shadow/elevation props).
 */
export const shadows = {
  none: undefined,
  card: '0 1px 2px rgba(0, 0, 0, 0.05)',
  segmentLift: '0 2px 2px rgba(0, 0, 0, 0.20)',
  raised: '0 4px 12px rgba(0, 0, 0, 0.10)',
  floating: '0 2px 8px rgba(0, 0, 0, 0.30)',
  overlay: '0 8px 24px rgba(0, 0, 0, 0.40)',
} as const;

export type Shadows = typeof shadows;
