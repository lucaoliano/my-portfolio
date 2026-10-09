import { ThemeColors } from '../theme/colors';
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useAppTheme } from '../theme/ThemeContext';
import { formatNumber, formatSignedCurrency, getCurrencySymbol } from '../utils/formatters';
import { CopyableText } from './CopyableText';
import { MetricChip } from './MetricChip';

interface AssetCardProps {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  changeAbsolute: number;
  dailyChange: number;
  dailyChangePercent: number;
  quantity: number;
  averagePrice: number;
  currency: string;
  annualizedReturn?: number | null;
  isAnnualizedExtrapolated?: boolean;
  /** false = nessuna quotazione: valore al costo, niente rendimento mostrato come reale */
  hasPrice?: boolean;
  /** false = la quotazione non ha la variazione di oggi */
  hasDailyChange?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  onPress?: () => void;
}

export const AssetCard: React.FC<AssetCardProps> = ({ 
  symbol, 
  name, 
  price, 
  changePercent, 
  changeAbsolute, 
  dailyChange,
  dailyChangePercent,
  quantity, 
  averagePrice, 
  currency, 
  annualizedReturn,
  isAnnualizedExtrapolated = false,
  hasPrice = true,
  hasDailyChange = true,
  isFirst = false,
  isLast = false,
  onPress 
}) => {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);
  const isPositive = changeAbsolute >= 0;
  const changeSign = isPositive ? '+' : '';

  const isDailyPositive = dailyChange >= 0;
  const dailyChangeColor = isDailyPositive ? colors.positive : colors.negative;
  const dailyChangeSign = isDailyPositive ? '+' : '';
  
  const currencySymbol = getCurrencySymbol(currency);

  const totalValue = price * quantity;
  const displaySymbol = getAvatarLabel(symbol, name);
  // Le quotazioni Scalable non riportano la variazione giornaliera: meglio non mostrare
  // un "+0,00%" che sembra un dato reale.
  const hasDailyData = hasPrice && hasDailyChange;
  const hasAnnualized = hasPrice && annualizedReturn !== undefined && annualizedReturn !== null;
  const accessibilityParts = [
    name,
    `valore ${currencySymbol}${formatNumber(totalValue)}`,
    hasPrice
      ? `rendimento totale ${formatSignedCurrency(changeAbsolute, currencySymbol)}, ${changeSign}${formatNumber(changePercent)}%`
      : 'prezzo non disponibile, valutato al costo',
    hasAnnualized ? `annuo ${formatNumber(annualizedReturn)}%${isAnnualizedExtrapolated ? ' stimato' : ''}` : null,
    hasDailyData ? `oggi ${dailyChangeSign}${formatNumber(dailyChangePercent)}%` : null,
  ];
  const annualizedColor = hasAnnualized && annualizedReturn >= 0 ? colors.positive : colors.negative;

  return (
    <TouchableOpacity 
      style={[
        styles.card,
        isFirst && styles.cardFirst,
        isLast && styles.cardLast,
        !isLast && styles.cardBorderBottom
      ]} 
      onPress={onPress} 
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={accessibilityParts.filter(Boolean).join(', ')}
    >
      <View style={styles.leftContent}>
        <View style={styles.symbolContainer}>
          <Text 
            style={styles.symbol} 
            adjustsFontSizeToFit 
            numberOfLines={1}
            minimumFontScale={0.5}
          >
            {displaySymbol}
          </Text>
        </View>
        <View style={styles.nameContainer}>
          <Text style={styles.name} numberOfLines={2}>{name}</Text>
          <Text style={styles.details}>
            {quantity} {quantity === 1 ? 'quota' : 'quote'}
          </Text>
          <Text style={styles.details}>
            Medio {currencySymbol}{formatNumber(averagePrice)}
          </Text>
          <Text style={styles.details}>
            {hasPrice ? `Attuale ${currencySymbol}${formatNumber(price)}` : 'Prezzo non disponibile'}
          </Text>
        </View>
      </View>
      <View style={styles.rightContent}>
        <CopyableText
          style={[styles.price, !hasPrice && styles.priceUnknown]}
          valueToCopy={totalValue ? totalValue.toString() : ''}
          onPress={onPress}
        >
          {currencySymbol}{totalValue ? formatNumber(totalValue) : '---'}
        </CopyableText>
        {hasPrice ? (
          <MetricChip value={changeAbsolute} size="md">
            {formatSignedCurrency(changeAbsolute, currencySymbol)} ({changeSign}{formatNumber(changePercent)}%)
          </MetricChip>
        ) : (
          <Text style={styles.unknownNote}>al costo</Text>
        )}
        {(hasAnnualized || hasDailyData) && (
          <Text style={styles.secondaryMetrics}>
            {hasAnnualized && (
              <Text style={{ color: annualizedColor }}>
                Annuo {annualizedReturn >= 0 ? '+' : ''}{formatNumber(annualizedReturn)}%{isAnnualizedExtrapolated ? '*' : ''}
              </Text>
            )}
            {hasAnnualized && hasDailyData && '  ·  '}
            {hasDailyData && (
              <Text style={{ color: dailyChangeColor }}>
                Oggi {dailyChangeSign}{formatNumber(dailyChangePercent)}%
              </Text>
            )}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

const ISIN_PATTERN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

/** Un ISIN troncato ("IE0...") non dice nulla: per gli ISIN usiamo le iniziali del nome. */
const getAvatarLabel = (symbol: string, name: string): string => {
  const base = symbol.split('.')[0];
  if (!ISIN_PATTERN.test(base)) return base;
  const initials = name
    .split(/\s+/)
    .filter(word => /^[A-Za-z0-9]/.test(word))
    .slice(0, 2)
    .map(word => word[0].toUpperCase())
    .join('');
  return initials || base.slice(0, 2);
};

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: colors.card,
  },
  cardFirst: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  cardLast: {
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  cardBorderBottom: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  leftContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  symbolContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    paddingHorizontal: 4,
    overflow: 'hidden',
  },
  symbol: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    width: '100%',
  },
  nameContainer: {
    flex: 1,
    marginRight: 12,
  },
  name: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
    marginBottom: 4,
  },
  details: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    fontVariant: ['tabular-nums'],
  },
  rightContent: {
    alignItems: 'flex-end',
    maxWidth: '55%',
  },
  price: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    marginBottom: 6,
  },
  priceUnknown: {
    color: colors.textSecondary,
  },
  unknownNote: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  secondaryMetrics: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    color: colors.textSecondary,
  },
});
