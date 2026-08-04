import { ThemeColors } from '../theme/colors';
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useAppTheme } from '../theme/ThemeContext';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

type NavigatorWithStandalone = Navigator & { standalone?: boolean };
type WindowWithMSStream = Window & { MSStream?: unknown };

export const InstallPrompt = () => {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSPrompt, setShowIOSPrompt] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    // Detect if dismissed previously in localStorage
    try {
      if (typeof window !== 'undefined' && window.localStorage?.getItem('pwa_install_dismissed') === 'true') {
        return;
      }
    } catch {
      // Ignore storage access error
    }

    // Detect if already installed (standalone mode)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches 
                         || (window.navigator as NavigatorWithStandalone).standalone;
    
    if (isStandalone) return;

    // Handle Android / Chrome beforeinstallprompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // iOS detection for manual prompt
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as WindowWithMSStream).MSStream;
    if (isIOS && !isStandalone) {
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
    
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      console.log('User accepted the A2HS prompt');
    } else {
      console.log('User dismissed the A2HS prompt');
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setDeferredPrompt(null);
    setShowIOSPrompt(false);
    try {
      if (typeof window !== 'undefined') {
        window.localStorage?.setItem('pwa_install_dismissed', 'true');
      }
    } catch {
      // Ignore storage write error
    }
  };

  if (!deferredPrompt && !showIOSPrompt) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.text}>
        {showIOSPrompt 
          ? "Installa l'app: tocca Condividi e poi 'Aggiungi alla schermata Home'"
          : "Aggiungi quest'app alla tua schermata Home per un'esperienza migliore!"}
      </Text>
      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.buttonSecondary} onPress={handleDismiss}>
          <Text style={styles.buttonTextSecondary}>Ignora</Text>
        </TouchableOpacity>
        {!showIOSPrompt && (
          <TouchableOpacity style={styles.buttonPrimary} onPress={handleInstallClick}>
            <Text style={styles.buttonTextPrimary}>Installa</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    position: 'absolute',
    top: 60, // mostriamolo in alto per differenziarlo dall'update prompt
    left: 20,
    right: 20,
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    zIndex: 9998, // Appena sotto a UpdatePrompt se dovessero esserci entrambi
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
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
    gap: 8,
    alignSelf: 'flex-end',
  },
  buttonSecondary: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonTextSecondary: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  buttonPrimary: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: colors.positive,
  },
  buttonTextPrimary: {
    color: '#000',
    fontSize: 14,
    fontWeight: '600',
  },
});
