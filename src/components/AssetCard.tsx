import { ThemeColors } from '../theme/colors';
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useAppTheme } from '../theme/ThemeContext';
import { formatNumber, getCurrencySymbol } from '../utils/formatters';
import { CopyableText } from './CopyableText';

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
  isFirst = false,
  isLast = false,
  onPress 
}) => {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);
  const isPositive = changeAbsolute >= 0;
  const changeColor = isPositive ? colors.positive : colors.negative;
  const changeSign = isPositive ? '+' : '';

  const isDailyPositive = dailyChange >= 0;
  const dailyChangeColor = isDailyPositive ? colors.positive : colors.negative;
  const dailyChangeSign = isDailyPositive ? '+' : '';
  
  const currencySymbol = getCurrencySymbol(currency);

  const totalValue = price * quantity;
  const displaySymbol = symbol.split('.')[0];

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
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          <Text style={styles.details}>
            {quantity} {quantity === 1 ? 'quota' : 'quote'}
          </Text>
          <Text style={styles.details}>
            P. Medio {currencySymbol}{formatNumber(averagePrice)}
          </Text>
          <Text style={styles.details}>
            Attuale {currencySymbol}{formatNumber(price)}
          </Text>
        </View>
      </View>
      <View style={styles.rightContent}>
        <CopyableText style={styles.price} valueToCopy={totalValue ? totalValue.toString() : ''}>{currencySymbol}{totalValue ? formatNumber(totalValue) : '---'}</CopyableText>
        <View style={{ alignItems: 'flex-end', marginTop: 4 }}>
          <View style={[styles.changeContainer, { backgroundColor: changeColor + '20', marginBottom: 4 }]}>
            <Text style={[styles.change, { color: changeColor }]}>
              Tot: {changeSign}{formatNumber(changeAbsolute)} ({changeSign}{formatNumber(changePercent)}%)
            </Text>
          </View>
          {annualizedReturn !== undefined && annualizedReturn !== null && (
            <View style={[styles.changeContainer, { backgroundColor: (annualizedReturn >= 0 ? colors.positive : colors.negative) + '20', marginBottom: 4 }]}>
              <Text style={[styles.change, { color: annualizedReturn >= 0 ? colors.positive : colors.negative, fontSize: 11 }]}>
                Ann: {annualizedReturn >= 0 ? '+' : ''}{formatNumber(annualizedReturn)}%{isAnnualizedExtrapolated ? '*' : ''}
              </Text>
            </View>
          )}
          <View style={[styles.changeContainer, { backgroundColor: dailyChangeColor + '20' }]}>
            <Text style={[styles.change, { color: dailyChangeColor, fontSize: 11 }]}>
              Oggi: {dailyChangeSign}{formatNumber(dailyChange)} ({dailyChangeSign}{formatNumber(dailyChangePercent)}%)
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
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
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  details: {
    color: colors.textSecondary,
    fontSize: 11,
  },
  rightContent: {
    alignItems: 'flex-end',
  },
  price: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  changeContainer: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 6,
  },
  change: {
    fontSize: 12,
    fontWeight: '700',
  },
});
