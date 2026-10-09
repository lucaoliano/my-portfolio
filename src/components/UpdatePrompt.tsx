import { ThemeColors } from '../theme/colors';
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Workbox } from 'workbox-window';
import { useAppTheme } from '../theme/ThemeContext';

export const UpdatePrompt = () => {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);
  const [showPrompt, setShowPrompt] = useState(false);
  const [wb, setWb] = useState<Workbox | null>(null);

  useEffect(() => {
    // Il Service Worker è supportato solo su web e in produzione (build statica)
    if (Platform.OS !== 'web' || !('serviceWorker' in navigator) || __DEV__) {
      return;
    }

    const workbox = new Workbox('/service-worker.js');

    const handleUpdate = (_event: unknown) => {
      // Quando c'è un nuovo service worker "in attesa" (waiting)
      setShowPrompt(true);
    };

    workbox.addEventListener('waiting', handleUpdate);

    workbox.register().then(() => {
      setWb(workbox);
    }).catch(console.error);

    return () => {
      workbox.removeEventListener('waiting', handleUpdate);
    };
  }, []);

  const handleUpdate = () => {
    if (wb) {
      wb.addEventListener('controlling', () => {
        window.location.reload();
      });
      // Invia un messaggio al SW per attivarsi immediatamente
      wb.messageSkipWaiting();
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
  };

  if (!showPrompt) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.text}>È disponibile una nuova versione!</Text>
      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.buttonSecondary} onPress={handleDismiss}>
          <Text style={styles.buttonTextSecondary}>Ignora</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.buttonPrimary} onPress={handleUpdate}>
          <Text style={styles.buttonTextPrimary}>Aggiorna</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    zIndex: 9999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    flex: 1,
    marginRight: 16,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 8,
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
    color: colors.onAccent,
    fontSize: 14,
    fontWeight: '600',
  },
});
