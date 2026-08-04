import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter, Href } from 'expo-router';
import { 
  ShieldCheck, 
  ChevronDown, 
  ChevronUp, 
  CheckCircle2, 
  AlertTriangle, 
  AlertCircle, 
  Info, 
  ArrowRight,
  TrendingUp,
  PieChart,
  Coins,
  Scale
} from 'lucide-react-native';
import { useAppTheme } from '../theme/ThemeContext';
import { ThemeColors } from '../theme/colors';
import { PortfolioHealthCheckResult, HealthCheckRuleResult } from '../utils/portfolioHealthCheck';

interface PortfolioHealthCheckCardProps {
  healthCheck: PortfolioHealthCheckResult;
  title?: string;
  subtitle?: string;
}

export const PortfolioHealthCheckCard: React.FC<PortfolioHealthCheckCardProps> = ({
  healthCheck,
  title = 'Health Check del Portafoglio',
  subtitle = 'Analisi deterministica di rischio, costi e allocazione',
}) => {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);
  const router = useRouter();
  const [expanded, setExpanded] = useState<boolean>(false);

  const { overallScore, overallLevel, overallSummary, rules } = healthCheck;

  const getScoreColor = () => {
    switch (overallLevel) {
      case 'excellent':
        return colors.positive;
      case 'good':
        return '#28EBCF';
      case 'warning':
        return '#F59E0B';
      case 'critical':
        return colors.negative;
    }
  };

  const getLevelLabel = () => {
    switch (overallLevel) {
      case 'excellent':
        return 'Eccellente';
      case 'good':
        return 'Solido';
      case 'warning':
        return 'Da Ottimizzare';
      case 'critical':
        return 'Rischio Elevato';
    }
  };

  const renderRuleIcon = (category: HealthCheckRuleResult['category']) => {
    switch (category) {
      case 'concentration':
        return <Scale size={16} color="#28EBCF" />;
      case 'liquidity':
        return <Coins size={16} color="#28EBCF" />;
      case 'diversification':
        return <PieChart size={16} color="#28EBCF" />;
      case 'rebalancing':
        return <TrendingUp size={16} color="#28EBCF" />;
      case 'costs':
        return <ShieldCheck size={16} color="#28EBCF" />;
    }
  };

  const renderStatusBadge = (status: HealthCheckRuleResult['status']) => {
    switch (status) {
      case 'PASS':
        return (
          <View style={[styles.statusBadge, { backgroundColor: colors.positive + '20' }]}>
            <CheckCircle2 size={12} color={colors.positive} style={{ marginRight: 4 }} />
            <Text style={[styles.statusBadgeText, { color: colors.positive }]}>OTTIMALE</Text>
          </View>
        );
      case 'INFO':
        return (
          <View style={[styles.statusBadge, { backgroundColor: '#3B82F620' }]}>
            <Info size={12} color="#3B82F6" style={{ marginRight: 4 }} />
            <Text style={[styles.statusBadgeText, { color: '#3B82F6' }]}>INFO</Text>
          </View>
        );
      case 'WARNING':
        return (
          <View style={[styles.statusBadge, { backgroundColor: '#F59E0B20' }]}>
            <AlertTriangle size={12} color="#F59E0B" style={{ marginRight: 4 }} />
            <Text style={[styles.statusBadgeText, { color: '#F59E0B' }]}>ATTENZIONE</Text>
          </View>
        );
      case 'ALERT':
        return (
          <View style={[styles.statusBadge, { backgroundColor: colors.negative + '20' }]}>
            <AlertCircle size={12} color={colors.negative} style={{ marginRight: 4 }} />
            <Text style={[styles.statusBadgeText, { color: colors.negative }]}>CRITICO</Text>
          </View>
        );
    }
  };

  const scoreColor = getScoreColor();

  return (
    <View style={styles.cardContainer}>
      {/* Header with Health Score Gauge */}
      <View style={styles.headerRow}>
        <View style={styles.headerTextContainer}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={styles.iconCircle}>
              <ShieldCheck size={18} color="#28EBCF" />
            </View>
            <Text style={styles.cardTitle}>{title}</Text>
          </View>
          <Text style={styles.cardSubtitle}>{subtitle}</Text>
        </View>

        {/* Score Ring / Pill */}
        <View style={[styles.scoreBadge, { borderColor: scoreColor + '60' }]}>
          <Text style={[styles.scoreValue, { color: scoreColor }]}>{overallScore}</Text>
          <Text style={styles.scoreScale}>/100</Text>
          <View style={[styles.scoreLevelPill, { backgroundColor: scoreColor + '20' }]}>
            <Text style={[styles.scoreLevelText, { color: scoreColor }]}>{getLevelLabel()}</Text>
          </View>
        </View>
      </View>

      {/* Summary Narrative */}
      <View style={styles.summaryBox}>
        <Text style={styles.summaryText}>{overallSummary}</Text>
      </View>

      {/* Quick KPIs Row */}
      <View style={styles.kpiRow}>
        <View style={styles.kpiItem}>
          <Text style={styles.kpiLabel}>TER Medio</Text>
          <Text style={styles.kpiValue}>{healthCheck.weightedTerPercent}%</Text>
        </View>
        <View style={styles.kpiDivider} />
        <View style={styles.kpiItem}>
          <Text style={styles.kpiLabel}>Cassa Libera</Text>
          <Text style={styles.kpiValue}>{healthCheck.cashAllocationPercent}%</Text>
        </View>
        <View style={styles.kpiDivider} />
        <View style={styles.kpiItem}>
          <Text style={styles.kpiLabel}>Top Asset</Text>
          <Text style={styles.kpiValue}>
            {healthCheck.topAsset ? `${healthCheck.topAsset.percentage}%` : 'N/D'}
          </Text>
        </View>
      </View>

      {/* Toggle Detailed Breakdown Button */}
      <TouchableOpacity
        style={styles.expandButton}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <Text style={styles.expandButtonText}>
          {expanded ? 'Nascondi analisi dettagliata' : 'Vedi analisi dettagliata (5 indicatori)'}
        </Text>
        {expanded ? (
          <ChevronUp size={16} color="#28EBCF" />
        ) : (
          <ChevronDown size={16} color="#28EBCF" />
        )}
      </TouchableOpacity>

      {/* Detailed Rules List */}
      {expanded && (
        <View style={styles.rulesList}>
          {rules.map((rule) => (
            <View key={rule.id} style={styles.ruleItem}>
              <View style={styles.ruleHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                  <View style={styles.ruleIconContainer}>
                    {renderRuleIcon(rule.category)}
                  </View>
                  <Text style={styles.ruleTitle}>{rule.title}</Text>
                </View>
                {renderStatusBadge(rule.status)}
              </View>

              <Text style={styles.ruleSummary}>{rule.summary}</Text>
              <Text style={styles.ruleDetails}>{rule.details}</Text>

              {rule.recommendation && (
                <View style={styles.recommendationBox}>
                  <Text style={styles.recommendationText}>
                    💡 <Text style={{ fontWeight: '700' }}>Suggerimento:</Text> {rule.recommendation}
                  </Text>
                </View>
              )}

              {rule.actionRoute && rule.actionLabel && (
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => router.push(rule.actionRoute as Href)}
                >
                  <Text style={styles.actionButtonText}>{rule.actionLabel}</Text>
                  <ArrowRight size={14} color="#000" style={{ marginLeft: 4 }} />
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  cardContainer: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 20,
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
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#28EBCF20',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  cardSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 3,
    marginLeft: 36,
  },
  scoreBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: colors.inputBackground,
    borderWidth: 1.5,
    minWidth: 78,
  },
  scoreValue: {
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 24,
  },
  scoreScale: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: -2,
    marginBottom: 4,
  },
  scoreLevelPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  scoreLevelText: {
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  summaryBox: {
    backgroundColor: colors.inputBackground,
    borderRadius: 10,
    padding: 10,
    marginTop: 14,
    borderLeftWidth: 3,
    borderLeftColor: '#28EBCF',
  },
  summaryText: {
    fontSize: 12,
    color: colors.text,
    lineHeight: 17,
  },
  kpiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: colors.inputBackground,
    borderRadius: 10,
    paddingVertical: 10,
    marginTop: 10,
  },
  kpiItem: {
    alignItems: 'center',
    flex: 1,
  },
  kpiLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  kpiValue: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  kpiDivider: {
    width: 1,
    height: 22,
    backgroundColor: colors.border,
  },
  expandButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    marginTop: 6,
  },
  expandButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#28EBCF',
    marginRight: 4,
  },
  rulesList: {
    marginTop: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  ruleItem: {
    backgroundColor: colors.inputBackground,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ruleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  ruleIconContainer: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: '#28EBCF15',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  ruleTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  ruleSummary: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
    marginTop: 2,
  },
  ruleDetails: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 4,
    lineHeight: 16,
  },
  recommendationBox: {
    backgroundColor: colors.card,
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#28EBCF30',
  },
  recommendationText: {
    fontSize: 11,
    color: colors.text,
    lineHeight: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#28EBCF',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 12,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  actionButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#000',
  },
});
