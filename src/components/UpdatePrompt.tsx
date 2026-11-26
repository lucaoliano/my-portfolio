import { ThemeColors } from '../theme/colors';
import { radii, continuousCurve } from '../theme/radius';
import { shadows } from '../theme/shadows';
import { spacing } from '../theme/spacing';
import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, ActivityIndicator, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Workbox } from 'workbox-window';
import { useAppTheme } from '../theme/ThemeContext';

// Sotto questa larghezza testo e pulsanti vanno in colonna
const NARROW_WIDTH = 400;

export const UpdatePrompt = () => {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [showPrompt, setShowPrompt] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [wb, setWb] = useState<Workbox | null>(null);
  // Ricarica solo se l'aggiornamento l'ha chiesto l'utente (non al primo controllo del SW)
  const updateRequested = useRef(false);

  useEffect(() => {
    // Il Service Worker è supportato solo su web e in produzione (build statica)
    if (Platform.OS !== 'web' || !('serviceWorker' in navigator) || __DEV__) {
      return;
    }

    const workbox = new Workbox('/service-worker.js');

    const handleWaiting = () => {
      // C'è un nuovo service worker in attesa
      setShowPrompt(true);
    };
    const handleControlling = () => {
      if (updateRequested.current) window.location.reload();
    };

    workbox.addEventListener('waiting', handleWaiting);
    workbox.addEventListener('controlling', handleControlling);

    workbox.register().then(() => {
      setWb(workbox);
    }).catch((error: unknown) => {
      console.warn('Service worker non registrato:', error);
    });

    return () => {
      workbox.removeEventListener('waiting', handleWaiting);
      workbox.removeEventListener('controlling', handleControlling);
    };
  }, []);

  const handleUpdate = () => {
    if (!wb || updating) return;
    updateRequested.current = true;
    setUpdating(true);
    // Il SW in attesa si attiva subito; al passaggio di controllo la pagina si ricarica
    wb.messageSkipWaiting();
  };

  const handleDismiss = () => {
    setShowPrompt(false);
  };

  if (!showPrompt) return null;

  const narrow = width < NARROW_WIDTH;

  return (
    <View
      style={[styles.container, narrow && styles.containerNarrow, { bottom: insets.bottom + 16 }]}
      role="status"
      aria-live="polite"
    >
      <Text style={[styles.text, narrow && styles.textNarrow]}>È disponibile una nuova versione.</Text>
      <View style={[styles.buttonContainer, narrow && styles.buttonContainerNarrow]}>
        <TouchableOpacity
          style={styles.buttonSecondary}
          onPress={handleDismiss}
          disabled={updating}
          accessibilityRole="button"
          aria-disabled={updating}
        >
          <Text style={styles.buttonTextSecondary}>Più tardi</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.buttonPrimary, updating && styles.buttonBusy]}
          onPress={handleUpdate}
          disabled={updating}
          accessibilityRole="button"
          aria-busy={updating}
          aria-label="Aggiorna"
        >
          {updating
            ? <ActivityIndicator size="small" color={colors.onAccent} />
            : <Text style={styles.buttonTextPrimary}>Aggiorna</Text>}
        </TouchableOpacity>
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
    padding: spacing.lg,
    borderRadius: radii.md,
    ...continuousCurve,
    borderWidth: 1,
    borderColor: colors.border,
    zIndex: 9999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    boxShadow: shadows.floating,
  },
  containerNarrow: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 12,
  },
  text: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
    flex: 1,
    marginRight: 16,
  },
  textNarrow: {
    flex: 0,
    marginRight: 0,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  buttonContainerNarrow: {
    justifyContent: 'flex-end',
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
    minWidth: 96,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: colors.positive,
  },
  buttonBusy: {
    opacity: 0.7,
  },
  buttonTextPrimary: {
    color: colors.onAccent,
    fontSize: 14,
    fontWeight: '600',
  },
});
