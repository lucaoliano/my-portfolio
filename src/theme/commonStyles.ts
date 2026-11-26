import { StyleSheet } from 'react-native';
import { ThemeColors } from './colors';
import { spacing } from './spacing';
import { radii, continuousCurve } from './radius';

/**
 * Common reusable styles across screens and components.
 * Guarantees visual consistency for containers, cards, and primary buttons.
 */
export const createCommonStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screenContainer: {
      flex: 1,
      backgroundColor: colors.background,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: radii.lg,
      ...continuousCurve,
      padding: spacing.lg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cardTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
      marginBottom: spacing.xs,
    },
    buttonPrimary: {
      backgroundColor: colors.positive,
      height: 50,
      borderRadius: radii.pill,
      ...continuousCurve,
      justifyContent: 'center',
      alignItems: 'center',
      flexDirection: 'row',
      paddingHorizontal: spacing.xl,
    },
    buttonPrimaryText: {
      color: colors.onAccent,
      fontSize: 16,
      fontWeight: '600',
    },
    buttonSecondary: {
      backgroundColor: colors.inputBackground,
      height: 50,
      borderRadius: radii.pill,
      ...continuousCurve,
      justifyContent: 'center',
      alignItems: 'center',
      flexDirection: 'row',
      paddingHorizontal: spacing.xl,
      borderWidth: 1,
      borderColor: colors.border,
    },
    buttonSecondaryText: {
      color: colors.text,
      fontSize: 16,
      fontWeight: '600',
    },
  });
