import { ThemeColors } from '../theme/colors';
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useAppTheme } from '../theme/ThemeContext';
import { formatNumber, formatSignedCurrency, getCurrencySymbol } from '../utils/formatters';
import * as Clipboard from 'expo-clipboard';
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
  /** Valore in euro per i titoli in valuta estera; null = cambio non disponibile */
  valueInBase?: number | null;
  /** Classe di attivo (Azioni, Obbligazioni…); assente se non impostata */
  category?: string;
  /** Peso della posizione sul totale investito, in percentuale */
  weightPercent?: number | null;
  /** Unico dato di rendimento mostrato nella riga, scelto in alto nella panoramica */
  metric?: 'total' | 'daily' | 'annual' | 'period';
  /** Rendimento nel periodo scelto (metric = 'period'): guadagno in euro e TWR; null = non calcolabile */
  periodGain?: number | null;
  periodPercent?: number | null;
  periodLabel?: string;
  /** "Oggi" oppure "Chiusura ven 9 ott" se l'ultimo prezzo non è di oggi */
  dailyLabel?: string;
  /** Variazione di oggi stimata (percentuale Yahoo sul prezzo Scalable) */
  dailyEstimated?: boolean;
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
  valueInBase,
  weightPercent,
  category,
  metric = 'total',
  periodGain,
  periodPercent,
  periodLabel = '',
  dailyLabel = 'Oggi',
  dailyEstimated = false,
  isFirst = false,
  isLast = false,
  onPress 
}) => {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);
  const [copied, setCopied] = useState(false);
  const isPositive = changeAbsolute >= 0;
  const changeSign = isPositive ? '+' : '';

  const isDailyPositive = dailyChange >= 0;
  const dailyChangeSign = isDailyPositive ? '+' : '';
  
  const currencySymbol = getCurrencySymbol(currency);

  const totalValue = price * quantity;
  const displaySymbol = getAvatarLabel(symbol, name);
  // Le quotazioni Scalable non riportano la variazione giornaliera: meglio non mostrare
  // un "+0,00%" che sembra un dato reale.
  const hasDailyData = hasPrice && hasDailyChange;
  const hasAnnualized = hasPrice && annualizedReturn !== undefined && annualizedReturn !== null;
  const isForeign = currency.toUpperCase() !== 'EUR';
  const weightLabel = weightPercent === undefined || weightPercent === null
    ? null
    : weightPercent < 1 ? '<1%' : `${Math.round(weightPercent)}%`;
  const fxMissing = isForeign && valueInBase === null;
  const accessibilityParts = [
    name,
    category ?? null,
    `${quantity} ${quantity === 1 ? 'quota' : 'quote'}`,
    `valore ${currencySymbol}${formatNumber(totalValue)}`,
    isForeign && valueInBase ? `circa ${formatNumber(valueInBase)} euro` : null,
    fxMissing ? 'cambio non disponibile, escluso dai totali' : null,
    weightPercent !== undefined && weightPercent !== null ? `${formatNumber(weightPercent)}% del portafoglio` : null,
    `prezzo medio ${currencySymbol}${formatNumber(averagePrice)}`,
    hasPrice
      ? `rendimento totale ${formatSignedCurrency(changeAbsolute, currencySymbol)}, ${changeSign}${formatNumber(changePercent)}%`
      : 'prezzo non disponibile, valutato al costo',
    hasAnnualized ? `annuo ${formatNumber(annualizedReturn)}%${isAnnualizedExtrapolated ? ' stimato' : ''}` : null,
    hasDailyData ? `oggi ${dailyChangeSign}${formatNumber(dailyChangePercent)}%` : null,
  ];

  // La copia del valore è un'azione della riga (pressione lunga o azione VoiceOver), non un controllo annidato
  const copyValue = async () => {
    await Clipboard.setStringAsync(totalValue ? totalValue.toString() : '');
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const renderMetric = () => {
    if (!hasPrice) {
      return <Text style={styles.unknownNote}>{fxMissing ? 'escluso dai totali' : 'al costo'}</Text>;
    }
    if (metric === 'period') {
      if (periodGain === undefined) return <Text style={styles.unknownNote}>…</Text>;
      if (periodGain === null || periodPercent === null || periodPercent === undefined) {
        return <Text style={styles.unknownNote}>{periodLabel} n/d</Text>;
      }
      return (
        <MetricChip value={periodGain} size="md">
          {formatSignedCurrency(periodGain)} ({periodPercent >= 0 ? '+' : ''}{formatNumber(periodPercent)}%)
        </MetricChip>
      );
    }
    if (metric === 'daily') {
      if (!hasDailyData) return <Text style={styles.unknownNote}>{dailyLabel} n/d</Text>;
      return (
        <MetricChip value={dailyChange} size="md">
          {dailyEstimated ? '≈ ' : ''}{formatSignedCurrency(dailyChange, currencySymbol)} ({dailyChangeSign}{formatNumber(dailyChangePercent)}%)
        </MetricChip>
      );
    }
    if (metric === 'annual') {
      if (!hasAnnualized) return <Text style={styles.unknownNote}>Annuo n/d</Text>;
      return (
        <MetricChip value={annualizedReturn} size="md">
          {annualizedReturn >= 0 ? '+' : ''}{formatNumber(annualizedReturn)}%{isAnnualizedExtrapolated ? '*' : ''} annuo
        </MetricChip>
      );
    }
    return (
      <MetricChip value={changeAbsolute} size="md">
        {formatSignedCurrency(changeAbsolute, currencySymbol)} ({changeSign}{formatNumber(changePercent)}%)
      </MetricChip>
    );
  };

  return (
    <TouchableOpacity 
      style={[
        styles.card,
        isFirst && styles.cardFirst,
        isLast && styles.cardLast,
        !isLast && styles.cardBorderBottom
      ]} 
      onPress={onPress}
      onLongPress={copyValue}
      delayLongPress={400}
      activeOpacity={0.7}
      accessibilityActions={[{ name: 'copy', label: 'Copia il valore' }]}
      onAccessibilityAction={e => { if (e.nativeEvent.actionName === 'copy') copyValue(); }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityParts.filter(Boolean).join(', ')}
    >
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
      {/* Righe a due colonne: il nome usa tutto lo spazio che il valore non occupa */}
      <View style={styles.body}>
        <View style={styles.row}>
          <View style={styles.nameColumn}>
            <Text style={styles.name} numberOfLines={2}>{name}</Text>
            {category && <Text style={styles.categoryText} numberOfLines={1}>{category}</Text>}
          </View>
          <View style={styles.valueColumn}>
            <Text style={[styles.price, !hasPrice && styles.priceUnknown]}>
              {copied ? 'Copiato' : `${currencySymbol}${totalValue ? formatNumber(totalValue) : '---'}`}
            </Text>
            {/* Sotto il valore, il suo peso: "72% del totale" (o il controvalore in euro per le valute estere) */}
            {/* Senza prezzo la nota "escluso dai totali" sotto basta: niente terza etichetta per lo stesso fatto */}
            {hasPrice && (weightLabel || (isForeign && valueInBase !== undefined)) && (
              <Text style={styles.baseValue}>
                {isForeign && valueInBase !== undefined
                  ? valueInBase === null ? 'cambio n/d' : `≈ €${formatNumber(valueInBase)}`
                  : null}
                {isForeign && valueInBase !== undefined && weightLabel ? ' · ' : null}
                {weightLabel ? `${weightLabel} del totale` : null}
              </Text>
            )}
          </View>
        </View>
        <View style={[styles.row, styles.rowSpaced]}>
          <Text style={styles.details} numberOfLines={1}>
            {hasPrice
              ? `${formatNumber(quantity).replace(/,00$/, '')} × ${currencySymbol}${formatNumber(price)}`
              : `${formatNumber(quantity).replace(/,00$/, '')} ${quantity === 1 ? 'quota' : 'quote'} · prezzo n/d`}
          </Text>
          {renderMetric()}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const ISIN_PATTERN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

/** Un ISIN troncato ("IE0...") non dice nulla: per gli ISIN usiamo le iniziali del nome. */
const getAvatarLabel = (symbol: string, name: string): string => {
  const base = symbol.split('.')[0];
  if (!ISIN_PATTERN.test(base)) return base.slice(0, 4);
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
    alignItems: 'flex-start',
    paddingVertical: 14,
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
  symbolContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    paddingHorizontal: 2,
    overflow: 'hidden',
  },
  symbol: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    width: '100%',
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  rowSpaced: {
    alignItems: 'center',
    marginTop: 6,
  },
  valueColumn: {
    alignItems: 'flex-end',
    marginLeft: 12,
  },
  nameColumn: {
    flex: 1,
    minWidth: 0,
  },
  categoryText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  name: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  details: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    fontVariant: ['tabular-nums'],
    marginRight: 8,
  },
  price: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  baseValue: {
    fontSize: 12,
    color: colors.textSecondary,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  priceUnknown: {
    color: colors.textSecondary,
  },
  unknownNote: {
    fontSize: 12,
    color: colors.textSecondary,
  },
});
