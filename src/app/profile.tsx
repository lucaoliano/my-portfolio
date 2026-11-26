import React, { useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronRight, User as UserIcon, LogOut, Calculator, Settings } from 'lucide-react-native';
import { ScreenHeader } from '../components/ScreenHeader';
import { useAppTheme } from '../theme/ThemeContext';
import { ThemeColors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { radii, continuousCurve } from '../theme/radius';
import { ThemedText } from '../components/ui/ThemedText';
import { Button } from '../components/ui/Button';
import { auth, signOutAndClearData } from '../config/firebase';

export default function ProfileScreen() {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);
  const router = useRouter();
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const handleLogout = async () => {
    setLogoutError(null);
    try {
      await signOutAndClearData();
      router.replace('/login');
    } catch (error) {
      console.warn('Errore logout:', error);
      setLogoutError('Uscita non riuscita. Riprova.');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScreenHeader title="Profilo" />

      <View style={styles.content}>
        <View style={styles.avatarContainer} aria-hidden>
          <UserIcon size={56} color={colors.textSecondary} />
        </View>

        <ThemedText variant="title" style={styles.emailText}>
          {auth.currentUser?.email || 'Utente'}
        </ThemedText>

        <View style={styles.menuCard}>
          <Pressable
            style={({ pressed }) => [
              styles.menuRow,
              { backgroundColor: pressed ? colors.inputBackground : colors.card },
            ]}
            onPress={() => router.push('/pac-calculator' as never)}
            accessibilityRole="button"
          >
            <View style={styles.menuLeft}>
              <Calculator size={20} color={colors.textSecondary} style={{ marginRight: spacing.md }} />
              <ThemedText variant="bodyMedium">Simulatore PAC</ThemedText>
            </View>
            <ChevronRight size={20} color={colors.textSecondary} />
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.menuRow,
              { borderBottomWidth: 0, backgroundColor: pressed ? colors.inputBackground : colors.card },
            ]}
            onPress={() => router.push('/settings' as never)}
            accessibilityRole="button"
          >
            <View style={styles.menuLeft}>
              <Settings size={20} color={colors.textSecondary} style={{ marginRight: spacing.md }} />
              <ThemedText variant="bodyMedium">Impostazioni</ThemedText>
            </View>
            <ChevronRight size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.buttonWrapper}>
          <Button
            variant="secondary"
            size="lg"
            fullWidth
            title="Esci dall'account"
            icon={<LogOut size={20} color={colors.text} />}
            onPress={handleLogout}
          />
        </View>

        {logoutError && (
          <ThemedText variant="caption" color={colors.negative} style={styles.errorText} role="alert">
            {logoutError}
          </ThemedText>
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
  content: {
    flex: 1,
    paddingHorizontal: spacing.screenPaddingHorizontal,
    paddingTop: spacing.xxl,
    alignItems: 'center',
  },
  avatarContainer: {
    width: 104,
    height: 104,
    borderRadius: radii.round,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...continuousCurve,
  },
  emailText: {
    marginBottom: spacing.xxxl,
    textAlign: 'center',
  },
  menuCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.card,
    borderRadius: radii.md,
    ...continuousCurve,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: spacing.xxl,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  menuLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  buttonWrapper: {
    width: '100%',
    maxWidth: 420,
  },
  errorText: {
    marginTop: spacing.md,
    textAlign: 'center',
  },
});
