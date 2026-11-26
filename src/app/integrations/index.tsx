import React from 'react';
import { View, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronRight, Lock } from 'lucide-react-native';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useAppTheme } from '../../theme/ThemeContext';
import { ThemeColors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { ThemedText } from '../../components/ui/ThemedText';
import { Card } from '../../components/ui/Card';
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
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScreenHeader title="Integrazioni broker" />

      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText variant="body" color={colors.textSecondary} style={styles.intro}>
          Collega un broker per importare in automatico transazioni, liquidità e piani di accumulo, senza inserirli a mano.
        </ThemedText>

        {loading ? (
          <ActivityIndicator color={colors.textSecondary} style={{ marginTop: spacing.xl }} />
        ) : (
          <Card
            variant="default"
            onPress={() => router.push('/integrations/scalable' as never)}
            style={styles.card}
            accessibilityLabel={`Scalable Capital, ${status.label}${lastSync ? `, ultima sincronizzazione ${lastSync}` : ''}`}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <ThemedText variant="headlineCard">Scalable Capital</ThemedText>
              <ThemedText variant="subheadBold" color={status.color} style={{ marginTop: 2 }}>
                {status.label}
              </ThemedText>
              <ThemedText variant="caption" color={colors.textSecondary} style={{ marginTop: 4 }}>
                {lastSync ? `Ultima sincronizzazione ${lastSync}` : 'Posizioni, movimenti, liquidità, piani e avvisi di prezzo.'}
              </ThemedText>
            </View>
            <ChevronRight size={20} color={colors.textSecondary} />
          </Card>
        )}

        <View style={styles.note}>
          <Lock size={16} color={colors.textSecondary} style={{ marginRight: spacing.sm, marginTop: 2 }} />
          <ThemedText variant="caption" color={colors.textSecondary} style={{ flex: 1, lineHeight: 18 }}>
            Le chiavi di accesso ai broker restano sui nostri server e non arrivano mai sul tuo dispositivo. L&apos;app legge i dati del conto e non invia ordini.
          </ThemedText>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.screenPaddingHorizontal, paddingBottom: spacing.huge },
  intro: { marginBottom: spacing.lg },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 72,
  },
  note: { flexDirection: 'row', alignItems: 'flex-start', marginTop: spacing.xxl },
});
