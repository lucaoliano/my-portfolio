import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '../components/ScreenHeader';
import { useAppTheme } from '../theme/ThemeContext';
import { ThemeColors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { ThemedText } from '../components/ui/ThemedText';
import { auth } from '../config/firebase';
import { usePortfolioOverview } from '../hooks/usePortfolioOverview';
import { PortfolioHealthCheckCard } from '../components/PortfolioHealthCheckCard';
import { PortfolioSkeleton } from '../components/PortfolioSkeleton';
import { formatNumber } from '../utils/formatters';

/** Analisi dettagliata della salute del portafoglio, aperta dalla riga compatta in dashboard. */
export default function HealthCheckScreen() {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);
  const userId = auth.currentUser?.uid;
  const { healthCheck, allAssets, isScalableConnected, scalableCash, includeCashInTotal, isInitialLoading } = usePortfolioOverview(userId);
  const investedValue = allAssets.reduce((sum, a) => sum + a.currentTotalValue, 0);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScreenHeader title="Salute del portafoglio" />

      {isInitialLoading ? (
        <PortfolioSkeleton />
      ) : allAssets.length === 0 ? (
        <View style={styles.empty}>
          <ThemedText variant="body" color={colors.textSecondary} style={{ textAlign: 'center' }}>
            Aggiungi almeno un titolo per vedere l&apos;analisi.
          </ThemedText>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText variant="caption" color={colors.textSecondary} tabular style={styles.scope}>
            Pesi calcolati su €{formatNumber(healthCheck.weightBase)}
            {scalableCash > 0
              ? includeCashInTotal
                ? ` (investito €${formatNumber(investedValue)} + liquidità €${formatNumber(scalableCash)}), come nella panoramica`
                : ' (solo investito, liquidità esclusa come nella panoramica)'
              : ''}
            {healthCheck.incompleteAssets > 0
              ? `. ${healthCheck.incompleteAssets === 1 ? '1 titolo senza prezzo o cambio aggiornato non è pesato correttamente' : `${healthCheck.incompleteAssets} titoli senza prezzo o cambio aggiornato non sono pesati correttamente`}: i pesi sono provvisori.`
              : ''}
          </ThemedText>
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
  content: {
    padding: spacing.screenPaddingHorizontal,
    paddingBottom: spacing.huge,
  },
  scope: {
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
  },
});
