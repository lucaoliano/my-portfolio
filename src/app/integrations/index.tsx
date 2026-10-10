import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, ChevronRight, Lock } from 'lucide-react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { ThemeColors } from '../../theme/colors';
import { auth } from '../../config/firebase';
import { useScalableConfig } from '../../hooks/useScalableConfig';

/** Elenco dei broker collegabili. Per ora solo Scalable: niente promesse di broker non ancora decisi. */
export default function IntegrationsScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = getStyles(colors);
  const { config, loading } = useScalableConfig(auth.currentUser?.uid);

  const status = !config?.enabled
    ? { label: 'Non collegato', color: colors.textSecondary }
    : config.status === 'connected'
      ? { label: 'Collegato', color: colors.scalable }
      : { label: 'Da ricollegare', color: colors.warning };

  const lastSync = config?.status === 'connected' && config.lastSyncedAt
    ? new Date(config.lastSyncedAt).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          accessibilityRole="button"
          accessibilityLabel="Indietro"
        >
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} accessibilityRole="header">Integrazioni broker</Text>
        <View style={styles.iconButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>
          Collega un broker per importare in automatico transazioni, liquidità e piani di accumulo, senza inserirli a mano.
        </Text>

        {loading ? (
          <ActivityIndicator color={colors.textSecondary} style={{ marginTop: 24 }} />
        ) : (
          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push('/integrations/scalable' as never)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Scalable Capital, ${status.label}${lastSync ? `, ultima sincronizzazione ${lastSync}` : ''}`}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.title}>Scalable Capital</Text>
              <Text style={[styles.status, { color: status.color }]}>{status.label}</Text>
              <Text style={styles.muted}>
                {lastSync ? `Ultima sincronizzazione ${lastSync}` : 'Posizioni, movimenti, liquidità, piani e avvisi di prezzo.'}
              </Text>
            </View>
            <ChevronRight size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        )}

        <View style={styles.note}>
          <Lock size={16} color={colors.textSecondary} style={{ marginRight: 8, marginTop: 2 }} />
          <Text style={styles.noteText}>
            Le chiavi di accesso ai broker restano sui nostri server e non arrivano mai sul tuo dispositivo. L&apos;app legge i dati del conto e non invia ordini.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  content: { padding: 16, paddingBottom: 48 },
  intro: { fontSize: 15, lineHeight: 21, color: colors.textSecondary, marginBottom: 16 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    minHeight: 72,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: { fontSize: 17, fontWeight: '700', color: colors.text },
  status: { fontSize: 14, fontWeight: '600', marginTop: 2 },
  muted: { fontSize: 13, lineHeight: 18, color: colors.textSecondary, marginTop: 4 },
  note: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 24 },
  noteText: { flex: 1, fontSize: 13, lineHeight: 18, color: colors.textSecondary },
});
