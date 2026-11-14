import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { Stack, useRouter, useSegments, ThemeProvider as ExpoThemeProvider, DefaultTheme, DarkTheme } from 'expo-router';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { View, Text, TouchableOpacity, AppState, AppStateStatus, ActivityIndicator, Platform } from 'react-native';
import { Lock } from 'lucide-react-native';

import '../global.css';
import { ThemeProvider, useAppTheme } from '../theme/ThemeContext';
import { auth, signOutAndClearData } from '../config/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { PortfolioSkeleton } from '../components/PortfolioSkeleton';
import { UpdatePrompt } from '../components/UpdatePrompt';
import { InstallPrompt } from '../components/InstallPrompt';
import { useBiometrics } from '../hooks/useBiometrics';

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
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background, paddingTop: 8 }}>
            <View style={{ width: 100, height: 100, borderRadius: 50, backgroundColor: colors.card, justifyContent: 'center', alignItems: 'center', marginBottom: 24 }} aria-hidden>
              <Lock size={48} color={colors.text} />
            </View>
            <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text, marginBottom: 12 }} role="heading">App bloccata</Text>
            <Text style={{ fontSize: 16, color: colors.textSecondary, marginBottom: 32, textAlign: 'center', paddingHorizontal: 32 }}>
              {Platform.OS === 'web'
                ? 'Usa la passkey di questo dispositivo per vedere il tuo portafoglio.'
                : 'Usa Face ID, impronta o il codice del dispositivo per vedere il tuo portafoglio.'}
            </Text>
            <View style={{ width: '100%', maxWidth: 420, paddingHorizontal: 24, gap: 12 }}>
              <TouchableOpacity
                style={{ backgroundColor: colors.positive, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', opacity: unlocking ? 0.7 : 1 }}
                onPress={() => void unlock()}
                disabled={unlocking}
                accessibilityRole="button"
                aria-busy={unlocking}
              >
                {unlocking
                  ? <ActivityIndicator color={colors.onAccent} />
                  : <Text style={{ color: colors.onAccent, fontSize: 16, fontWeight: '600' }}>Sblocca</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                style={{ height: 50, borderRadius: 25, borderWidth: 1, borderColor: colors.inputBorder, justifyContent: 'center', alignItems: 'center' }}
                onPress={() => void signOutFromLock()}
                disabled={unlocking}
                accessibilityRole="button"
              >
                <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>Esci dall&apos;account</Text>
              </TouchableOpacity>
              {unlockError && (
                <Text style={{ color: colors.negative, fontSize: 14, textAlign: 'center' }} role="alert">{unlockError}</Text>
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
