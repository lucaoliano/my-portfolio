import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter, Href } from 'expo-router';
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Info,
  ArrowRight,
  ChevronRight,
  TrendingUp,
  PieChart,
  Coins,
  Scale,
  Lightbulb,
} from 'lucide-react-native';
import { useAppTheme } from '../theme/ThemeContext';
import { ThemeColors, withAlpha } from '../theme/colors';
import { formatNumber } from '../utils/formatters';
import { PortfolioHealthCheckResult, HealthCheckRuleResult, HealthCheckLevel } from '../utils/portfolioHealthCheck';

// Il tono è informativo, non da consulente: niente "rischio elevato" o "critico" sotto i tuoi soldi.
const LEVEL_LABELS: Record<HealthCheckLevel, string> = {
  excellent: 'Eccellente',
  good: 'Solido',
  warning: 'Da ottimizzare',
  critical: 'Da rivedere',
  incomplete: 'Incompleta',
};

const STATUS_LABELS: Record<HealthCheckRuleResult['status'], string> = {
  PASS: 'In linea',
  INFO: 'Info',
  WARNING: 'Da valutare',
  ALERT: 'Fuori soglia',
};

const levelColor = (colors: ThemeColors, level: HealthCheckLevel) => {
  switch (level) {
    case 'excellent':
    case 'good':
      return colors.positive;
    case 'warning':
      return colors.warning;
    case 'critical':
      return colors.negative;
    case 'incomplete':
      return colors.textSecondary;
  }
};

const statusColor = (colors: ThemeColors, status: HealthCheckRuleResult['status']) => {
  switch (status) {
    case 'PASS':
      return colors.positive;
    case 'INFO':
      return colors.info;
    case 'WARNING':
      return colors.warning;
    case 'ALERT':
      return colors.negative;
  }
};

const StatusIcon = ({ status, color }: { status: HealthCheckRuleResult['status']; color: string }) => {
  switch (status) {
    case 'PASS':
      return <CheckCircle2 size={12} color={color} style={{ marginRight: 4 }} />;
    case 'INFO':
      return <Info size={12} color={color} style={{ marginRight: 4 }} />;
    case 'WARNING':
      return <AlertTriangle size={12} color={color} style={{ marginRight: 4 }} />;
    case 'ALERT':
      return <AlertCircle size={12} color={color} style={{ marginRight: 4 }} />;
  }
};

const RuleIcon = ({ category, color }: { category: HealthCheckRuleResult['category']; color: string }) => {
  switch (category) {
    case 'concentration':
      return <Scale size={16} color={color} />;
    case 'liquidity':
      return <Coins size={16} color={color} />;
    case 'diversification':
      return <PieChart size={16} color={color} />;
    case 'rebalancing':
      return <TrendingUp size={16} color={color} />;
    case 'costs':
      return <ShieldCheck size={16} color={color} />;
  }
};

/** Riga compatta per la dashboard: punteggio e livello, il dettaglio si apre in una schermata dedicata. */
export const HealthCheckSummaryRow: React.FC<{ healthCheck: PortfolioHealthCheckResult; onPress: () => void }> = ({
  healthCheck,
  onPress,
}) => {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);
  const color = levelColor(colors, healthCheck.overallLevel);
  const label = LEVEL_LABELS[healthCheck.overallLevel];
  const incomplete = healthCheck.overallLevel === 'incomplete';
  const { withData, total } = healthCheck.coverage;
  const pending = healthCheck.incompleteAssets;
  const pendingLabel = pending > 0 ? `${pending} ${pending === 1 ? 'titolo' : 'titoli'} senza prezzo` : null;

  return (
    <TouchableOpacity
      style={styles.summaryRow}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={incomplete
        ? `Salute del portafoglio: analisi incompleta, ${withData} indicatori su ${total} con dati`
        : `Salute del portafoglio: ${healthCheck.overallScore} su 100, ${label}${pendingLabel ? `, provvisoria: ${pendingLabel}` : ''}`}
      accessibilityHint="Apre l'analisi dettagliata"
    >
      <ShieldCheck size={18} color={colors.textSecondary} style={{ marginRight: 10 }} />
      <Text style={styles.summaryRowTitle}>Salute del portafoglio</Text>
      {incomplete ? (
        <Text style={styles.summaryRowLevel}>Incompleta · {withData} di {total}</Text>
      ) : (
        <>
          <Text style={[styles.summaryRowScore, { color }]}>{healthCheck.overallScore}</Text>
          <Text style={styles.summaryRowLevel}>
            {' · '}{pendingLabel ? 'Provvisoria' : label}{!pendingLabel && withData < total ? ` (${withData} di ${total})` : ''}
          </Text>
        </>
      )}
      <ChevronRight size={16} color={colors.textSecondary} style={{ marginLeft: 4 }} />
    </TouchableOpacity>
  );
};

interface PortfolioHealthCheckCardProps {
  healthCheck: PortfolioHealthCheckResult;
  /** false = Scalable non collegato: la quota di liquidità non è nota e non va mostrata come 0% */
  hasCashData?: boolean;
}

/** Analisi completa, mostrata nella schermata "Salute del portafoglio". */
export const PortfolioHealthCheckCard: React.FC<PortfolioHealthCheckCardProps> = ({
  healthCheck,
  hasCashData = true,
}) => {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);
  const router = useRouter();

  const { overallScore, overallLevel, overallSummary, rules, coverage } = healthCheck;
  const scoreColor = levelColor(colors, overallLevel);
  const incomplete = overallLevel === 'incomplete';

  return (
    <View>
      <View style={styles.cardContainer}>
        <View style={styles.headerRow}>
          <View style={styles.headerTextContainer}>
            <Text style={styles.cardTitle}>Punteggio complessivo</Text>
            <Text style={styles.cardSubtitle}>
              Calcolato su {coverage.withData} indicatori su {coverage.total}: quelli senza dati non contano
            </Text>
          </View>
          <View
            style={styles.scoreBadge}
            accessible
            accessibilityLabel={incomplete ? 'Punteggio non disponibile: analisi incompleta' : `${overallScore} su 100, ${LEVEL_LABELS[overallLevel]}`}
          >
            <Text style={[styles.scoreValue, { color: scoreColor }]}>{incomplete ? '—' : overallScore}</Text>
            <Text style={styles.scoreScale}>{incomplete ? 'troppi dati mancanti' : 'su 100'}</Text>
            <Text style={[styles.scoreLevelText, { color: scoreColor }]}>{LEVEL_LABELS[overallLevel]}</Text>
          </View>
        </View>

        <Text style={styles.summaryText}>{overallSummary}</Text>

        <View style={styles.kpiRow}>
          <View style={styles.kpiItem}>
            <Text style={styles.kpiLabel}>TER medio (stima)</Text>
            <Text style={styles.kpiValue}>{healthCheck.weightedTerPercent > 0 ? `${formatNumber(healthCheck.weightedTerPercent)}%` : 'N/D'}</Text>
          </View>
          <View style={styles.kpiDivider} />
          <View style={styles.kpiItem}>
            <Text style={styles.kpiLabel}>Liquidità sul patrimonio</Text>
            <Text style={styles.kpiValue}>{hasCashData ? `${formatNumber(healthCheck.cashAllocationPercent)}%` : 'N/D'}</Text>
          </View>
          <View style={styles.kpiDivider} />
          <View style={styles.kpiItem}>
            <Text style={styles.kpiLabel}>Primo titolo {healthCheck.weightsIncludeCash ? 'sul patrimonio' : "sull'investito"}</Text>
            <Text style={styles.kpiValue}>
              {healthCheck.topAsset ? `${formatNumber(healthCheck.topAsset.percentage)}%` : 'N/D'}
            </Text>
          </View>
        </View>
      </View>

      <Text style={styles.sectionLabel}>Indicatori</Text>
      {rules.map((rule) => {
        const color = rule.hasData ? statusColor(colors, rule.status) : colors.textSecondary;
        return (
          <View key={rule.id} style={styles.ruleItem}>
            <View style={styles.ruleHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <View style={styles.ruleIconContainer}>
                  <RuleIcon category={rule.category} color={colors.textSecondary} />
                </View>
                <Text style={styles.ruleTitle}>{rule.title}</Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: withAlpha(color, 0.125) }]}>
                <StatusIcon status={rule.hasData ? rule.status : 'INFO'} color={color} />
                <Text style={[styles.statusBadgeText, { color }]}>{rule.hasData ? STATUS_LABELS[rule.status] : 'Senza dati'}</Text>
              </View>
            </View>

            <Text style={styles.ruleSummary}>{rule.summary}</Text>
            <Text style={styles.ruleDetails}>{rule.details}</Text>

            {rule.recommendation && (
              <View style={styles.recommendationBox}>
                <Lightbulb size={14} color={colors.textSecondary} style={{ marginRight: 8, marginTop: 1 }} />
                <Text style={styles.recommendationText}>
                  <Text style={{ fontWeight: '700' }}>Da considerare: </Text>
                  {rule.recommendation}
                </Text>
              </View>
            )}

            {rule.actionRoute && rule.actionLabel && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => router.push(rule.actionRoute as Href)}
                accessibilityRole="button"
              >
                <Text style={styles.actionButtonText}>{rule.actionLabel}</Text>
                <ArrowRight size={14} color={colors.text} style={{ marginLeft: 4 }} />
              </TouchableOpacity>
            )}
          </View>
        );
      })}

      <Text style={styles.disclaimer}>
        Analisi automatica a scopo informativo, basata sui dati del portafoglio. Non è una consulenza finanziaria.
      </Text>
    </View>
  );
};

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryRowTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  summaryRowScore: {
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  summaryRowLevel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  cardContainer: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTextContainer: {
    flex: 1,
    marginRight: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  cardSubtitle: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
    marginTop: 4,
  },
  scoreBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.inputBackground,
    minWidth: 84,
  },
  scoreValue: {
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 32,
    fontVariant: ['tabular-nums'],
  },
  scoreScale: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  scoreLevelText: {
    fontSize: 12,
    fontWeight: '700',
  },
  summaryText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
    marginTop: 16,
  },
  kpiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: colors.inputBackground,
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 16,
  },
  kpiItem: {
    alignItems: 'center',
    flex: 1,
  },
  kpiLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  kpiValue: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  kpiDivider: {
    width: 1,
    height: 24,
    backgroundColor: colors.border,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8,
  },
  ruleItem: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ruleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  ruleIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: colors.inputBackground,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  ruleTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginLeft: 8,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  ruleSummary: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    lineHeight: 18,
  },
  ruleDetails: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
    lineHeight: 17,
  },
  recommendationBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.inputBackground,
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
  },
  recommendationText: {
    flex: 1,
    fontSize: 12,
    color: colors.text,
    lineHeight: 17,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  disclaimer: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
    marginTop: 4,
    marginBottom: 24,
  },
});
