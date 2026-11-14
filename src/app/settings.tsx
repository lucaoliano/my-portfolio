import { ThemeColors } from '../theme/colors';
import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, Check } from 'lucide-react-native';
import { useAppTheme, ThemePreference } from '../theme/ThemeContext';
import { useBiometrics } from '../hooks/useBiometrics';
import { auth } from '../config/firebase';

export default function SettingsScreen() {
  const router = useRouter();
  const { colors, preference, setPreference } = useAppTheme();
  const { isSupported, isEnabled, toggleBiometric } = useBiometrics(auth.currentUser?.uid);
  const styles = getStyles(colors);
  const [biometricPending, setBiometricPending] = useState(false);
  const [biometricError, setBiometricError] = useState<string | null>(null);

  const options: { label: string; value: ThemePreference }[] = [
    { label: 'Come il sistema', value: 'automatic' },
    { label: 'Chiaro', value: 'light' },
    { label: 'Scuro', value: 'dark' },
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
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.canGoBack() ? router.back() : router.replace('/')}
          accessibilityRole="button"
          aria-label="Indietro"
        >
          <ChevronLeft size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} role="heading">Impostazioni</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.content}>
        <Text style={styles.sectionTitle} role="heading">Aspetto</Text>

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
                <Text style={styles.optionText}>{option.label}</Text>
                {selected && (
                  <Check size={20} color={colors.text} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {isSupported && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 24 }]} role="heading">Sicurezza</Text>
            <View style={styles.optionsCard}>
              <View style={[styles.optionRow, { borderBottomWidth: 0 }]}>
                <View style={styles.optionLabel}>
                  <Text style={styles.optionText}>Blocca l&apos;app con Face ID o passkey</Text>
                  <Text style={styles.optionDescription}>{lockDescription}</Text>
                </View>
                {biometricPending
                  ? <ActivityIndicator color={colors.textSecondary} style={styles.switchSpinner} />
                  : (
                    <Switch
                      value={isEnabled}
                      onValueChange={(val) => { void onToggleBiometric(val); }}
                      trackColor={{ false: colors.inputBorder, true: colors.selection }}
                      thumbColor={colors.card}
                      // react-native-web usa activeThumbColor per il pallino acceso
                      {...({ activeThumbColor: colors.onStrong } as object)}
                      accessibilityLabel="Blocca l'app con Face ID o passkey"
                      aria-checked={isEnabled}
                    />
                  )}
              </View>
            </View>
            {biometricError && (
              <Text style={styles.errorText} role="alert">{biometricError}</Text>
            )}
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerSpacer: {
    width: 44,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 24,
  },
  sectionTitle: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
    marginLeft: 8,
  },
  optionsCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 52,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  optionText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '500',
  },
  optionLabel: {
    flex: 1,
    marginRight: 12,
  },
  optionDescription: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 4,
  },
  switchSpinner: {
    width: 51,
  },
  errorText: {
    color: colors.negative,
    fontSize: 14,
    marginTop: 8,
    marginLeft: 8,
  },
});
