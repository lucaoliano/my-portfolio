import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TrendingUp, Mail } from 'lucide-react-native';
import { useAppTheme } from '../theme/ThemeContext';
import { ThemeColors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { radii, continuousCurve } from '../theme/radius';
import { Button } from '../components/ui/Button';
import { ThemedText } from '../components/ui/ThemedText';
import { auth } from '../config/firebase';
import { GoogleAuthProvider, getRedirectResult, signInWithPopup, signInWithRedirect } from 'firebase/auth';

const errorCode = (error: unknown): string | undefined =>
  error && typeof error === 'object' ? (error as { code?: string }).code : undefined;

const isPopupCancellationError = (error: unknown): boolean => {
  const code = errorCode(error);
  return code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request';
};

/** Messaggio per l'utente: mai il testo grezzo di Firebase. */
const loginErrorMessage = (error: unknown): string => {
  switch (errorCode(error)) {
    case 'auth/popup-blocked':
      return 'Il browser ha bloccato la finestra di accesso. Consenti i popup e riprova.';
    case 'auth/network-request-failed':
      return 'Connessione assente. Riprova.';
    default:
      return 'Accesso non riuscito. Riprova.';
  }
};

const createProvider = () => {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
};

export const LoginScreen = () => {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let cancelled = false;
    getRedirectResult(auth).catch((err: unknown) => {
      if (cancelled || isPopupCancellationError(err)) return;
      console.warn('Errore login (redirect):', err);
      setError(loginErrorMessage(err));
    });
    return () => { cancelled = true; };
  }, []);

  const handleGoogleLogin = async () => {
    if (Platform.OS !== 'web') return;
    setLoading(true);
    setError(null);
    try {
      await signInWithPopup(auth, createProvider());
    } catch (err: unknown) {
      if (isPopupCancellationError(err)) {
        return;
      }
      if (errorCode(err) === 'auth/popup-blocked') {
        try {
          await signInWithRedirect(auth, createProvider());
          return;
        } catch (redirectErr: unknown) {
          console.warn('Errore login (redirect):', redirectErr);
        }
      }
      console.warn('Errore login:', err);
      setError(loginErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const isWeb = Platform.OS === 'web';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.content}>
        <View style={styles.iconContainer} aria-hidden>
          <TrendingUp size={64} color={colors.text} />
        </View>
        <ThemedText variant="headline" style={styles.title} role="heading">
          My Portfolio
        </ThemedText>
        <ThemedText variant="body" color={colors.textSecondary} style={styles.subtitle}>
          {isWeb
            ? 'Accedi per gestire il tuo portafoglio in modo sicuro e privato.'
            : "L'accesso con Google per ora è disponibile solo dal browser. Apri My Portfolio dal sito o dall'app installata dalla schermata Home."}
        </ThemedText>

        {isWeb && (
          <View style={styles.buttonWrapper}>
            <Button
              variant="primary"
              size="lg"
              fullWidth
              title="Accedi con Google"
              loading={loading}
              icon={<Mail size={20} color={colors.onAccent} />}
              onPress={handleGoogleLogin}
            />
          </View>
        )}

        {error && (
          <ThemedText variant="subhead" color={colors.negative} style={styles.errorText} role="alert">
            {error}
          </ThemedText>
        )}
      </View>
    </SafeAreaView>
  );
};

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xxxl,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: radii.round,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xxxl,
    ...continuousCurve,
  },
  title: {
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: spacing.huge,
    lineHeight: 24,
    maxWidth: 360,
  },
  buttonWrapper: {
    width: '100%',
    maxWidth: 420,
  },
  errorText: {
    marginTop: spacing.lg,
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default LoginScreen;
