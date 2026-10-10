import { ThemeColors } from '../theme/colors';
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TrendingUp, Mail } from 'lucide-react-native';
import { useAppTheme } from '../theme/ThemeContext';
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

  // Se l'accesso è passato dal redirect (popup bloccato), un eventuale errore arriva qui al ritorno
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
        // Popup bloccato (succede spesso nella PWA installata su iOS): si ripiega sul redirect
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
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer} aria-hidden>
          <TrendingUp size={64} color={colors.text} />
        </View>
        <Text style={styles.title} role="heading">My Portfolio</Text>
        <Text style={styles.subtitle}>
          {isWeb
            ? 'Accedi per gestire il tuo portafoglio in modo sicuro e privato.'
            : "L'accesso con Google per ora è disponibile solo dal browser. Apri My Portfolio dal sito o dall'app installata dalla schermata Home."}
        </Text>

        {isWeb && (
          <TouchableOpacity
            style={[styles.loginButton, loading && { opacity: 0.7 }]}
            onPress={handleGoogleLogin}
            disabled={loading}
            accessibilityRole="button"
            aria-busy={loading}
            aria-label="Accedi con Google"
          >
            {loading ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <>
                <Mail size={20} color={colors.onAccent} style={{ marginRight: 12 }} />
                <Text style={styles.loginButtonText}>Accedi con Google</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {error && (
          <Text style={styles.errorText} role="alert">{error}</Text>
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
    padding: 32,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 48,
    lineHeight: 24,
  },
  loginButton: {
    flexDirection: 'row',
    backgroundColor: colors.positive,
    width: '100%',
    maxWidth: 420,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loginButtonText: {
    color: colors.onAccent,
    fontSize: 16,
    fontWeight: '600',
  },
  errorText: {
    color: colors.negative,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 16,
    textAlign: 'center',
  },
});

export default LoginScreen;
