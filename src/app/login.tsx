import { ThemeColors } from '../theme/colors';
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TrendingUp, Mail } from 'lucide-react-native';
import { useAppTheme } from '../theme/ThemeContext';
import { auth } from '../config/firebase';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';

const isPopupCancellationError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const code = (error as { code?: string }).code;
  return code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request';
};

export const LoginScreen = () => {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      if (Platform.OS === 'web') {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        await signInWithPopup(auth, provider);
      } else {
        Alert.alert(
          'Non supportato', 
          'Il login con Google popup è supportato solo su Web/PWA al momento. Usa la PWA per testare.'
        );
      }
    } catch (error: unknown) {
      if (isPopupCancellationError(error)) {
        return;
      }

      console.error('Errore login:', error);
      const message = error instanceof Error ? error.message : 'Errore sconosciuto durante il login.';
      Alert.alert('Errore di Accesso', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <TrendingUp size={64} color={colors.positive} />
        </View>
        <Text style={styles.title}>My Portfolio</Text>
        <Text style={styles.subtitle}>
          Accedi per gestire il tuo portafoglio in modo sicuro e privato.
        </Text>

        <TouchableOpacity 
          style={[styles.loginButton, loading && { opacity: 0.7 }]} 
          onPress={handleGoogleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#000" />
          ) : (
            <>
              <Mail size={20} color="#000" style={{ marginRight: 12 }} />
              <Text style={styles.loginButtonText}>Accedi con Google</Text>
            </>
          )}
        </TouchableOpacity>
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
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loginButtonText: {
    color: '#000',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default LoginScreen;
