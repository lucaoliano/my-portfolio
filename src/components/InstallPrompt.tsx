import { ThemeColors } from '../theme/colors';
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname } from 'expo-router';
import { useAppTheme } from '../theme/ThemeContext';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

type NavigatorWithStandalone = Navigator & { standalone?: boolean };
type WindowWithMSStream = Window & { MSStream?: unknown };

const DISMISSED_KEY = 'pwa_install_dismissed';

// iPadOS si presenta come "Macintosh": lo si riconosce dal touch
const isIOSDevice = () =>
  (/iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as WindowWithMSStream).MSStream)
  || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

export const InstallPrompt = () => {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSPrompt, setShowIOSPrompt] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    try {
      if (typeof window !== 'undefined' && window.localStorage?.getItem(DISMISSED_KEY) === 'true') {
        return;
      }
    } catch {
      // Storage non disponibile: si mostra comunque
    }

    // Già installata (modalità standalone)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
                         || (window.navigator as NavigatorWithStandalone).standalone;

    if (isStandalone) return;

    // Android / Chrome: beforeinstallprompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // iOS / iPadOS: istruzioni manuali
    if (isIOSDevice()) {
      const timer = setTimeout(() => {
        setShowIOSPrompt(true);
      }, 3000);
      return () => {
        window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        clearTimeout(timer);
      };
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
    } catch {
      // Il browser può rifiutare un secondo prompt: si chiude il banner comunque
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setDeferredPrompt(null);
    setShowIOSPrompt(false);
    try {
      if (typeof window !== 'undefined') {
        window.localStorage?.setItem(DISMISSED_KEY, 'true');
      }
    } catch {
      // Storage non scrivibile: il banner tornerà alla prossima apertura
    }
  };

  // Al login l'utente ha un altro compito: il banner aspetta la panoramica
  if (pathname === '/login') return null;
  if (!deferredPrompt && !showIOSPrompt) return null;

  return (
    <View
      style={[styles.container, { top: insets.top + 12 }]}
      role="dialog"
      aria-label="Installa My Portfolio"
      aria-live="polite"
    >
      <Text style={styles.text}>
        Installa My Portfolio sulla schermata Home per aprirla a schermo intero.
        {showIOSPrompt ? ' Tocca Condividi, poi “Aggiungi alla schermata Home”.' : ''}
      </Text>
      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.buttonSecondary} onPress={handleDismiss} accessibilityRole="button">
          <Text style={styles.buttonTextSecondary}>Non ora</Text>
        </TouchableOpacity>
        {!showIOSPrompt && (
          <TouchableOpacity style={styles.buttonPrimary} onPress={() => void handleInstallClick()} accessibilityRole="button">
            <Text style={styles.buttonTextPrimary}>Aggiungi alla schermata Home</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    maxWidth: 560,
    alignSelf: 'center',
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    zIndex: 9998, // Appena sotto a UpdatePrompt se dovessero esserci entrambi
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  text: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
  buttonContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 8,
  },
  buttonSecondary: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.inputBorder,
  },
  buttonTextSecondary: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  buttonPrimary: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: colors.positive,
  },
  buttonTextPrimary: {
    color: colors.onAccent,
    fontSize: 14,
    fontWeight: '600',
  },
});
