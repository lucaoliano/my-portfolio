import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, ChevronRight, ShieldCheck, CheckCircle2, AlertCircle, Cpu, Zap, Landmark } from 'lucide-react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { ThemeColors, withAlpha } from '../../theme/colors';
import { auth } from '../../config/firebase';
import { subscribeScalableConfig } from '../../services/scalableMcp';
import { ScalableMcpConfig } from '../../types';

export default function IntegrationsScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = getStyles(colors);

  const [scalableConfig, setScalableConfig] = useState<ScalableMcpConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const userId = auth.currentUser?.uid;
    if (!userId) {
      const timeoutId = setTimeout(() => setLoading(false), 0);
      return () => clearTimeout(timeoutId);
    }

    const unsubscribe = subscribeScalableConfig(userId, (cfg) => {
      setScalableConfig(cfg);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const isScalableConnected = scalableConfig?.enabled && scalableConfig?.status === 'connected';
  const isScalableError = scalableConfig?.enabled && scalableConfig?.status === 'error';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => router.canGoBack() ? router.back() : router.replace('/')}
        >
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Integrazioni Broker</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.introCard}>
          <View style={styles.introHeaderRow}>
            <Zap size={22} color={colors.primary} style={{ marginRight: 8 }} />
            <Text style={styles.introTitle}>Connessione Diretta Broker</Text>
          </View>
          <Text style={styles.introText}>
            Collega i tuoi broker per sincronizzare in automatico titoli, liquidità, PAC ed eseguiti senza inserire le transazioni a mano.
          </Text>
        </View>

        <Text style={styles.sectionHeader}>Disponibili</Text>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : (
          <TouchableOpacity 
            style={[styles.integrationCard, isScalableConnected && styles.cardActiveBorder]}
            onPress={() => router.push('/integrations/scalable' as never)}
            activeOpacity={0.7}
          >
            <View style={styles.cardHeader}>
              <View style={styles.brandRow}>
                <View style={[styles.brandIconContainer, { backgroundColor: colors.scalableSurface }]}>
                  <Cpu size={24} color={colors.scalable} />
                </View>
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={styles.brandTitle}>Scalable Capital</Text>
                    <View style={styles.mcpBadge}>
                      <Text style={styles.mcpBadgeText}>MCP PROTOCOL</Text>
                    </View>
                  </View>
                  <Text style={styles.brandSubtitle}>Agentic Investing (Model Context Protocol)</Text>
                </View>
              </View>

              <View style={styles.statusRow}>
                {isScalableConnected ? (
                  <View style={[styles.statusBadge, { backgroundColor: withAlpha(colors.positive, 0.125) }]}>
                    <CheckCircle2 size={13} color={colors.positive} style={{ marginRight: 4 }} />
                    <Text style={[styles.statusText, { color: colors.positive }]}>Connesso</Text>
                  </View>
                ) : isScalableError ? (
                  <View style={[styles.statusBadge, { backgroundColor: withAlpha(colors.negative, 0.125) }]}>
                    <AlertCircle size={13} color={colors.negative} style={{ marginRight: 4 }} />
                    <Text style={[styles.statusText, { color: colors.negative }]}>Attenzione</Text>
                  </View>
                ) : (
                  <View style={[styles.statusBadge, { backgroundColor: colors.inputBackground }]}>
                    <Text style={[styles.statusText, { color: colors.textSecondary }]}>Da configurare</Text>
                  </View>
                )}
                <ChevronRight size={20} color={colors.textSecondary} style={{ marginLeft: 8 }} />
              </View>
            </View>

            <Text style={styles.cardDescription}>
              Connetti l&apos;endpoint MCP ufficiale per importare posizioni, visualizzare la liquidità remunerata e gestire i piani di accumulo (PAC).
            </Text>

            {isScalableConnected && scalableConfig?.lastTestedAt && (
              <View style={styles.syncMetaRow}>
                <Text style={styles.syncMetaText}>
                  Ultima verifica: {new Date(scalableConfig.lastTestedAt).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </Text>
                {scalableConfig.readOnly && (
                  <Text style={[styles.syncMetaText, { color: colors.primary }]}>• Sola Lettura Attiva</Text>
                )}
              </View>
            )}
          </TouchableOpacity>
        )}

        <Text style={[styles.sectionHeader, { marginTop: 24 }]}>In Arrivo</Text>

        {/* Directa */}
        <View style={[styles.integrationCard, styles.cardDisabled]}>
          <View style={styles.cardHeader}>
            <View style={styles.brandRow}>
              <View style={[styles.brandIconContainer, { backgroundColor: colors.warningSurface }]}>
                <Landmark size={24} color={colors.warning} />
              </View>
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={styles.brandTitle}>Directa</Text>
                <Text style={styles.brandSubtitle}>API & Open Banking</Text>
              </View>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: colors.inputBackground }]}>
              <Text style={[styles.statusText, { color: colors.textSecondary }]}>Prossimamente</Text>
            </View>
          </View>
          <Text style={styles.cardDescription}>
            Integrazione diretta per broker italiano a regime amministrato.
          </Text>
        </View>

        {/* Interactive Brokers */}
        <View style={[styles.integrationCard, styles.cardDisabled]}>
          <View style={styles.cardHeader}>
            <View style={styles.brandRow}>
              <View style={[styles.brandIconContainer, { backgroundColor: colors.infoSurface }]}>
                <Landmark size={24} color={colors.info} />
              </View>
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={styles.brandTitle}>Interactive Brokers</Text>
                <Text style={styles.brandSubtitle}>IBKR Flex Web Service</Text>
              </View>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: colors.inputBackground }]}>
              <Text style={[styles.statusText, { color: colors.textSecondary }]}>Prossimamente</Text>
            </View>
          </View>
          <Text style={styles.cardDescription}>
            Sincronizzazione avanzata multi-valuta e portafogli globali.
          </Text>
        </View>

        {/* Security Box */}
        <View style={styles.securityBox}>
          <ShieldCheck size={20} color={colors.positive} style={{ marginTop: 2, marginRight: 10 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.securityTitle}>Sicurezza e Riservatezza</Text>
            <Text style={styles.securityText}>
              Le credenziali e i token restano salvati nel tuo profilo Firebase privato. Le operazioni di compravendita sono disattivate di default in modalità Sola Lettura per garantirti il pieno controllo.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  introCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  introHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  introTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  introText: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
    marginLeft: 4,
  },
  loadingContainer: {
    padding: 24,
    alignItems: 'center',
  },
  integrationCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardActiveBorder: {
    borderColor: withAlpha(colors.scalable, 0.376),
  },
  cardDisabled: {
    opacity: 0.65,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  brandIconContainer: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  brandSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  mcpBadge: {
    backgroundColor: withAlpha(colors.scalable, 0.125),
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 6,
  },
  mcpBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.scalable,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  cardDescription: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  syncMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  syncMetaText: {
    fontSize: 11,
    color: colors.textSecondary,
    marginRight: 8,
  },
  securityBox: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    marginTop: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  securityTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  securityText: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17,
  },
});
