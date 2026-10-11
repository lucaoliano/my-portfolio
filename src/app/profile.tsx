import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, User as UserIcon, LogOut } from 'lucide-react-native';
import { useAppTheme } from '../theme/ThemeContext';
import { ThemeColors } from '../theme/colors';
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
      console.warn("Errore logout:", error);
      setLogoutError('Uscita non riuscita. Riprova.');
    }
  };

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
        <Text style={styles.headerTitle} role="heading">Profilo</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.content}>
        <View style={styles.avatarContainer} aria-hidden>
          <UserIcon size={64} color={colors.textSecondary} />
        </View>

        <Text style={styles.emailText}>{auth.currentUser?.email || 'Utente'}</Text>

        <TouchableOpacity style={styles.settingsButton} onPress={() => router.push('/pac-calculator' as never)} accessibilityRole="button">
          <Text style={styles.settingsButtonText}>Simulatore PAC</Text>
          <ChevronRight size={20} color={colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.settingsButton} onPress={() => router.push('/settings' as never)} accessibilityRole="button">
          <Text style={styles.settingsButtonText}>Impostazioni</Text>
          <ChevronRight size={20} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* Uscire non è distruttivo: contorno neutro, non rosso (Meaning-Only Color) */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} accessibilityRole="button">
          <LogOut size={20} color={colors.text} style={{ marginRight: 12 }} />
          <Text style={styles.logoutText}>Esci dall&apos;account</Text>
        </TouchableOpacity>
        {logoutError && (
          <Text style={styles.errorText} role="alert">{logoutError}</Text>
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
    alignItems: 'center',
  },
  avatarContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emailText: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 48,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    paddingHorizontal: 24,
    height: 50,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    width: '100%',
    justifyContent: 'center',
    marginTop: 16,
  },
  errorText: {
    color: colors.negative,
    fontSize: 14,
    marginTop: 12,
    textAlign: 'center',
  },
  settingsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    width: '100%',
    marginBottom: 16,
  },
  settingsButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  logoutText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
});
