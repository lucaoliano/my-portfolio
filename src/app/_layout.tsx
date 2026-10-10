import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { Stack, useRouter, useSegments, ThemeProvider as ExpoThemeProvider, DefaultTheme, DarkTheme } from 'expo-router';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { View, Text, TouchableOpacity, AppState, AppStateStatus } from 'react-native';
import { Lock } from 'lucide-react-native';

import '../global.css';
import { ThemeProvider, useAppTheme } from '../theme/ThemeContext';
import { auth } from '../config/firebase';
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

  React.useEffect(() => {
    if (isLocked) {
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

  if (loading || biometricLoading) {
    return (
      <SafeAreaProvider style={{ flex: 1, backgroundColor: colors.background }}>
        <SafeAreaView style={{ flex: 1 }}>
          <PortfolioSkeleton />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  if (isLocked) {
    return (
      <SafeAreaProvider style={{ flex: 1, backgroundColor: colors.background }}>
        <ExpoThemeProvider value={CustomTheme}>
          <StatusBar style={theme === 'dark' ? "light" : "dark"} />
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
            <View style={{ width: 100, height: 100, borderRadius: 50, backgroundColor: colors.card, justifyContent: 'center', alignItems: 'center', marginBottom: 24 }}>
              <Lock size={48} color={colors.text} />
            </View>
            <Text style={{ fontSize: 24, fontWeight: 'bold', color: colors.text, marginBottom: 12 }}>App Bloccata</Text>
            <Text style={{ fontSize: 16, color: colors.textSecondary, marginBottom: 32, textAlign: 'center', paddingHorizontal: 32 }}>
              Usa la biometria per sbloccare l&apos;app e accedere ai tuoi dati finanziari.
            </Text>
            <TouchableOpacity 
              style={{ backgroundColor: colors.positive, paddingHorizontal: 32, paddingVertical: 16, borderRadius: 28 }}
              onPress={async () => {
                const success = await authenticate();
                if (success) {
                  setIsUnlocked(true);
                }
              }}
            >
              <Text style={{ color: colors.onAccent, fontSize: 18, fontWeight: 'bold' }}>Sblocca App</Text>
            </TouchableOpacity>
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
