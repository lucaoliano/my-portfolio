import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { Stack, useRouter, useSegments, ThemeProvider as ExpoThemeProvider, DefaultTheme, DarkTheme } from 'expo-router';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { View, AppState, AppStateStatus, ActivityIndicator, Platform } from 'react-native';
import { Lock } from 'lucide-react-native';

import '../global.css';
import { ThemeProvider, useAppTheme } from '../theme/ThemeContext';
import { spacing } from '../theme/spacing';
import { radii, continuousCurve } from '../theme/radius';
import { Button } from '../components/ui/Button';
import { ThemedText } from '../components/ui/ThemedText';
import { auth, signOutAndClearData, db } from '../config/firebase';
import { collection, doc, setDoc, addDoc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { PortfolioSkeleton } from '../components/PortfolioSkeleton';
import { UpdatePrompt } from '../components/UpdatePrompt';
import { InstallPrompt } from '../components/InstallPrompt';
import { useBiometrics } from '../hooks/useBiometrics';
import * as taxLossTracker from '../utils/taxLossTracker';
import * as wealthTax from '../utils/wealthTax';
import * as savingsPlansRebalance from '../utils/savingsPlansRebalance';
import * as periodPerformance from '../utils/periodPerformance';
import * as priceAlerts from '../utils/priceAlerts';
import * as xirr from '../utils/xirr';
import * as portfolioHealthCheck from '../utils/portfolioHealthCheck';
import * as priceHistory from '../utils/priceHistory';
import * as historyBackfill from '../utils/historyBackfill';
import * as portfolioManager from '../utils/portfolioManager';
import * as pacCalculator from '../utils/pacCalculator';
import * as cashInterest from '../utils/cashInterest';
import * as formatters from '../utils/formatters';
import * as webauthn from '../utils/webauthn';
import * as scalableMcp from '../services/scalableMcp';

if (typeof window !== 'undefined') {
  (window as unknown as { __FINANCE_UTILS__?: Record<string, unknown> }).__FINANCE_UTILS__ = {
    auth,
    db,
    firestore: { collection, doc, setDoc, addDoc, getDoc },
    taxLossTracker,
    wealthTax,
    savingsPlansRebalance,
    periodPerformance,
    priceAlerts,
    xirr,
    portfolioHealthCheck,
    priceHistory,
    historyBackfill,
    portfolioManager,
    pacCalculator,
    cashInterest,
    formatters,
    webauthn,
    scalableMcp,
  };
}

function InnerLayout() {
  const [user, setUser] = React.useState<User | null>(null);
  const [loading, setLoading] = React.useState(true);
  const router = useRouter();
  const segments = useSegments();
  const { colors, theme } = useAppTheme();

  const CustomTheme = {
    ...(theme === 'dark' ? DarkTheme : DefaultTheme),
    colors: {
      ...(theme === 'dark' ? DarkTheme.colors : DefaultTheme.colors),
      background: colors.background,
      card: colors.card,
      text: colors.text,
      border: colors.border,
    },
  };

  const { isEnabled, isLoading: biometricLoading, authenticate } = useBiometrics(user?.uid);
  const [isUnlocked, setIsUnlocked] = React.useState(false);
  const [unlocking, setUnlocking] = React.useState(false);
  const [unlockError, setUnlockError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsUnlocked(false);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  React.useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        if (isEnabled) {
          setIsUnlocked(false);
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [isEnabled]);

  const isLocked = Boolean(!loading && !biometricLoading && user && isEnabled && !isUnlocked);

  // Su iOS/Android il prompt biometrico parte da solo; sul web la passkey (WebAuthn) richiede un
  // gesto dell'utente, quindi si aspetta il tocco su "Sblocca"
  React.useEffect(() => {
    if (isLocked && Platform.OS !== 'web') {
      let isSubscribed = true;
      authenticate().then(success => {
        if (isSubscribed && success) {
          setIsUnlocked(true);
        }
      });
      return () => {
        isSubscribed = false;
      };
    }
  }, [isLocked, authenticate]);

  React.useEffect(() => {
    if (loading || biometricLoading) return;

    const inAuthGroup = (segments[0] as string) === '(auth)' || segments[0] === 'login';

    if (!user && !inAuthGroup) {
      router.replace('/login');
    } else if (user && inAuthGroup) {
      router.replace('/');
    }

  }, [user, loading, biometricLoading, segments, router]);

  const unlock = async () => {
    if (unlocking) return;
    setUnlocking(true);
    setUnlockError(null);
    const success = await authenticate();
    setUnlocking(false);
    if (success) {
      setIsUnlocked(true);
    } else {
      setUnlockError('Sblocco non riuscito. Riprova.');
    }
  };

  const signOutFromLock = async () => {
    setUnlockError(null);
    try {
      await signOutAndClearData();
    } catch (error) {
      console.warn('Errore logout:', error);
      setUnlockError('Uscita non riuscita. Riprova.');
    }
  };

  if (loading || biometricLoading) {
    // Utente già noto come disconnesso: niente scheletro del portafoglio, si sta andando al login
    const signedOut = !loading && !user;
    return (
      <SafeAreaProvider style={{ flex: 1, backgroundColor: colors.background }}>
        <SafeAreaView style={{ flex: 1, paddingTop: 16 }} edges={['top', 'left', 'right']}>
          {signedOut ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <ActivityIndicator color={colors.textSecondary} />
            </View>
          ) : (
            <PortfolioSkeleton />
          )}
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  if (isLocked) {
    return (
      <SafeAreaProvider style={{ flex: 1, backgroundColor: colors.background }}>
        <ExpoThemeProvider value={CustomTheme}>
          <StatusBar style={theme === 'dark' ? "light" : "dark"} />
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background, paddingHorizontal: spacing.lg }}>
            <View style={{ width: 96, height: 96, borderRadius: radii.round, backgroundColor: colors.card, justifyContent: 'center', alignItems: 'center', marginBottom: spacing.xl, ...continuousCurve }} aria-hidden>
              <Lock size={44} color={colors.text} />
            </View>
            <ThemedText variant="title" style={{ marginBottom: spacing.sm, textAlign: 'center' }} role="heading">
              App bloccata
            </ThemedText>
            <ThemedText variant="body" color={colors.textSecondary} style={{ marginBottom: spacing.xxxl, textAlign: 'center', maxWidth: 360, paddingHorizontal: spacing.lg }}>
              {Platform.OS === 'web'
                ? 'Usa la passkey di questo dispositivo per vedere il tuo portafoglio.'
                : 'Usa Face ID, impronta o il codice del dispositivo per vedere il tuo portafoglio.'}
            </ThemedText>
            <View style={{ width: '100%', maxWidth: 420, gap: spacing.md }}>
              <Button
                variant="primary"
                size="lg"
                fullWidth
                title="Sblocca"
                loading={unlocking}
                onPress={() => void unlock()}
              />
              <Button
                variant="secondary"
                size="lg"
                fullWidth
                title="Esci dall'account"
                disabled={unlocking}
                onPress={() => void signOutFromLock()}
              />
              {unlockError && (
                <ThemedText variant="caption" color={colors.negative} style={{ textAlign: 'center', marginTop: spacing.xs }} role="alert">
                  {unlockError}
                </ThemedText>
              )}
            </View>
          </View>
        </ExpoThemeProvider>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider style={{ flex: 1, backgroundColor: colors.background }}>
      <ExpoThemeProvider value={CustomTheme}>
        <StatusBar style={theme === 'dark' ? "light" : "dark"} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="login" />
          <Stack.Screen name="index" />
          <Stack.Screen name="search" options={{ presentation: 'modal' }} />
          <Stack.Screen name="manage-groups" options={{ presentation: 'modal' }} />
          <Stack.Screen name="manage-portfolios" options={{ presentation: 'modal' }} />
          <Stack.Screen name="add-transaction" options={{ presentation: 'modal' }} />
          <Stack.Screen name="edit-transaction" options={{ presentation: 'modal' }} />
          <Stack.Screen name="profile" options={{ presentation: 'modal' }} />
          <Stack.Screen name="settings" />
          <Stack.Screen name="pac-calculator" />
          <Stack.Screen name="health-check" />
          <Stack.Screen name="asset/[id]" />
        </Stack>
        <UpdatePrompt />
        <InstallPrompt />
      </ExpoThemeProvider>
    </SafeAreaProvider>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <InnerLayout />
    </ThemeProvider>
  );
}
