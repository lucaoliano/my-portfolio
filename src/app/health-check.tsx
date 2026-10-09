import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useAppTheme } from '../theme/ThemeContext';
import { ThemeColors } from '../theme/colors';
import { auth } from '../config/firebase';
import { usePortfolioOverview } from '../hooks/usePortfolioOverview';
import { PortfolioHealthCheckCard } from '../components/PortfolioHealthCheckCard';
import { PortfolioSkeleton } from '../components/PortfolioSkeleton';

/** Analisi dettagliata della salute del portafoglio, aperta dalla riga compatta in dashboard. */
export default function HealthCheckScreen() {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);
  const router = useRouter();
  const userId = auth.currentUser?.uid;
  const { healthCheck, allAssets, isScalableConnected, isInitialLoading } = usePortfolioOverview(userId);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          accessibilityRole="button"
          accessibilityLabel="Indietro"
        >
          <ChevronLeft size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} accessibilityRole="header">Salute del portafoglio</Text>
        <View style={{ width: 44 }} />
      </View>

      {isInitialLoading ? (
        <PortfolioSkeleton />
      ) : allAssets.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Aggiungi almeno un titolo per vedere l&apos;analisi.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <PortfolioHealthCheckCard healthCheck={healthCheck} hasCashData={isScalableConnected} />
        </ScrollView>
      )}
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
  },
  content: {
    padding: 16,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 15,
    textAlign: 'center',
  },
});
