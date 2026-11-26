import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Switch, ActivityIndicator, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check } from 'lucide-react-native';
import { ScreenHeader } from '../components/ScreenHeader';
import { useAppTheme, ThemePreference } from '../theme/ThemeContext';
import { ThemeColors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { radii, continuousCurve } from '../theme/radius';
import { ThemedText } from '../components/ui/ThemedText';
import { useBiometrics } from '../hooks/useBiometrics';
import { auth } from '../config/firebase';

export default function SettingsScreen() {
  const { colors, preference, setPreference } = useAppTheme();
  const { isSupported, isEnabled, toggleBiometric } = useBiometrics(auth.currentUser?.uid);
  const styles = getStyles(colors);
  const [biometricPending, setBiometricPending] = useState(false);
  const [biometricError, setBiometricError] = useState<string | null>(null);

  const options: { label: string; value: ThemePreference }[] = [
    { label: 'Scuro (predefinito)', value: 'dark' },
    { label: 'Chiaro', value: 'light' },
    { label: 'Come il sistema', value: 'automatic' },
  ];

  const onToggleBiometric = async (value: boolean) => {
    if (biometricPending) return;
    setBiometricPending(true);
    setBiometricError(null);
    const ok = await toggleBiometric(value);
    setBiometricPending(false);
    if (!ok) {
      setBiometricError(value
        ? 'Blocco non attivato. Riprova.'
        : 'Blocco non disattivato. Riprova.');
    }
  };

  const lockDescription = Platform.OS === 'web'
    ? (isEnabled
      ? "All'apertura l'app chiede la passkey. Disattivandolo, la passkey viene dimenticata solo su questo dispositivo."
      : "All'apertura l'app chiede la passkey di questo dispositivo.")
    : "All'apertura l'app chiede Face ID, impronta o il codice del dispositivo.";

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScreenHeader title="Impostazioni" />

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
      >
        <ThemedText variant="subheadBold" color={colors.textSecondary} style={styles.sectionTitle} role="heading">
          Aspetto
        </ThemedText>

        <View style={styles.optionsCard} accessibilityRole="radiogroup" aria-label="Aspetto">
          {options.map((option, index) => {
            const selected = preference === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.optionRow,
                  index === options.length - 1 && { borderBottomWidth: 0 }
                ]}
                onPress={() => setPreference(option.value)}
                accessibilityRole="radio"
                aria-checked={selected}
              >
                <ThemedText variant="bodyMedium">{option.label}</ThemedText>
                {selected && (
                  <Check size={20} color={colors.text} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {isSupported && (
          <>
            <ThemedText variant="subheadBold" color={colors.textSecondary} style={[styles.sectionTitle, { marginTop: spacing.xl }]} role="heading">
              Sicurezza
            </ThemedText>
            <View style={styles.optionsCard}>
              <View style={[styles.optionRow, { borderBottomWidth: 0 }]}>
                <View style={styles.optionLabel}>
                  <ThemedText variant="bodyMedium">Blocca l&apos;app con Face ID o passkey</ThemedText>
                  <ThemedText variant="subhead" color={colors.textSecondary} style={styles.optionDescription}>
                    {lockDescription}
                  </ThemedText>
                </View>
                {biometricPending
                  ? <ActivityIndicator color={colors.textSecondary} style={styles.switchSpinner} />
                  : (
                    <Switch
                      value={isEnabled}
                      onValueChange={(val) => { void onToggleBiometric(val); }}
                      trackColor={{ false: colors.inputBorder, true: colors.positive }}
                      thumbColor={colors.card}
                      {...({ activeThumbColor: colors.onAccent } as object)}
                      accessibilityLabel="Blocca l'app con Face ID o passkey"
                      aria-checked={isEnabled}
                    />
                  )}
              </View>
            </View>
            {biometricError && (
              <ThemedText variant="caption" color={colors.negative} style={styles.errorText} role="alert">
                {biometricError}
              </ThemedText>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.screenPaddingHorizontal,
    paddingTop: spacing.lg,
    paddingBottom: spacing.huge,
  },
  sectionTitle: {
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  optionsCard: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    ...continuousCurve,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 52,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  optionLabel: {
    flex: 1,
    marginRight: spacing.md,
  },
  optionDescription: {
    marginTop: spacing.xs,
  },
  switchSpinner: {
    width: 51,
  },
  errorText: {
    marginTop: spacing.sm,
    marginLeft: spacing.xs,
  },
});
