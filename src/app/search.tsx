import React, { useState, useEffect } from 'react';
import { View, TextInput, StyleSheet, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Plus } from 'lucide-react-native';
import { ScreenHeader } from '../components/ScreenHeader';
import { useAppTheme } from '../theme/ThemeContext';
import { ThemeColors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { radii, continuousCurve } from '../theme/radius';
import { ThemedText } from '../components/ui/ThemedText';
import { Button } from '../components/ui/Button';
import { searchSymbol, YahooSearchResult } from '../services/yahooFinance';

const QUOTE_TYPE_LABELS: Record<string, string> = {
  EQUITY: 'Azione',
  ETF: 'ETF',
  MUTUALFUND: 'Fondo',
};

const EXCHANGE_LABELS: Record<string, string> = {
  MIL: 'Borsa Italiana',
  GER: 'Xetra',
  FRA: 'Francoforte',
  STU: 'Stoccarda',
  MUN: 'Monaco',
  BER: 'Berlino',
  DUS: 'Düsseldorf',
  HAM: 'Amburgo',
  PAR: 'Euronext Parigi',
  AMS: 'Euronext Amsterdam',
  BRU: 'Euronext Bruxelles',
  LIS: 'Euronext Lisbona',
  MCE: 'Madrid',
  LSE: 'Londra',
  IOB: 'Londra (IOB)',
  EBS: 'Zurigo',
  VIE: 'Vienna',
  NMS: 'Nasdaq',
  NGM: 'Nasdaq',
  NCM: 'Nasdaq',
  NAS: 'Nasdaq',
  NYQ: 'NYSE',
  NYS: 'NYSE',
  ASE: 'NYSE American',
  PCX: 'NYSE Arca',
  BTS: 'Cboe BZX',
  PNK: 'OTC',
  TOR: 'Toronto',
  JPX: 'Tokyo',
  HKG: 'Hong Kong',
};

const SEARCH_DEBOUNCE_MS = 350;

export const SearchScreen = () => {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);
  const router = useRouter();
  const searchParams = useLocalSearchParams<{ portfolioId?: string }>();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<YahooSearchResult[]>([]);
  const [resultsFor, setResultsFor] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const trimmed = query.trim();

  const handleChangeText = (text: string) => {
    setQuery(text);
    setError(false);
    if (text.trim().length === 0) {
      setResults([]);
      setResultsFor('');
      setLoading(false);
    } else {
      setLoading(true);
    }
  };

  useEffect(() => {
    if (trimmed.length === 0) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const data = await searchSymbol(trimmed);
        if (cancelled) return;
        setResults(data);
        setResultsFor(trimmed);
        setError(false);
      } catch (err) {
        if (cancelled) return;
        console.warn('Search error:', err);
        setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmed, retryKey]);

  const retry = () => {
    setError(false);
    setLoading(true);
    setRetryKey(k => k + 1);
  };

  const addToPortfolio = (item: YahooSearchResult) => {
    const displayName = item.longname || item.shortname || item.symbol;
    router.push({
      pathname: '/add-transaction',
      params: {
        symbol: item.symbol,
        name: displayName,
        fromSearch: 'true',
        preselectedPortfolioId: searchParams.portfolioId,
      },
    });
  };

  const renderEmpty = () => {
    if (trimmed.length === 0) {
      return (
        <View style={styles.centerContainer}>
          <ThemedText variant="subhead" color={colors.textSecondary} style={styles.emptyText}>
            Cerca per nome dell&apos;azienda, codice ticker (es. AAPL, VWCE) o codice ISIN.
          </ThemedText>
        </View>
      );
    }
    if (loading) {
      return (
        <View style={styles.centerContainer}>
          <ThemedText variant="subhead" color={colors.textSecondary} style={styles.emptyText}>
            Ricerca in corso...
          </ThemedText>
        </View>
      );
    }
    if (resultsFor === trimmed) {
      return (
        <View style={styles.centerContainer}>
          <ThemedText variant="subhead" color={colors.textSecondary} style={styles.emptyText}>
            Nessun titolo trovato per “{trimmed}”.
          </ThemedText>
        </View>
      );
    }
    return null;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScreenHeader>
        <Pressable
          style={({ pressed }) => [
            styles.backButton,
            { opacity: pressed ? 0.7 : 1 },
          ]}
          onPress={() => router.canGoBack() ? router.back() : router.replace('/')}
          accessibilityRole="button"
          aria-label="Indietro"
        >
          <ArrowLeft size={22} color={colors.text} />
        </Pressable>
        <View style={styles.inputWrap}>
          <TextInput
            style={styles.searchInput}
            placeholder="Nome, ticker o ISIN"
            placeholderTextColor={colors.textSecondary}
            value={query}
            onChangeText={handleChangeText}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            aria-label="Cerca titoli"
          />
          {loading && (
            <ActivityIndicator
              size="small"
              color={colors.textSecondary}
              style={styles.inputSpinner}
              aria-label="Ricerca in corso"
            />
          )}
        </View>
      </ScreenHeader>

      {error ? (
        <View style={styles.centerContainer} accessibilityLiveRegion="polite">
          <ThemedText variant="bodyMedium" color={colors.textSecondary} style={styles.emptyText} role="alert">
            Ricerca non disponibile. Riprova.
          </ThemedText>
          <Button
            variant="secondary"
            size="md"
            title="Riprova"
            onPress={retry}
            style={{ marginTop: spacing.lg }}
          />
        </View>
      ) : (
        <FlatList
          data={trimmed.length === 0 ? [] : results}
          keyExtractor={(item) => item.symbol}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={renderEmpty}
          renderItem={({ item }) => {
            const name = item.longname || item.shortname || item.symbol;
            const details = [
              item.symbol,
              QUOTE_TYPE_LABELS[item.quoteType] ?? null,
              item.exchange ? (EXCHANGE_LABELS[item.exchange] ?? item.exchange) : null,
            ].filter(Boolean).join(' · ');
            return (
              <Pressable
                style={({ pressed }) => [
                  styles.resultItem,
                  { backgroundColor: pressed ? colors.inputBackground : colors.background },
                ]}
                onPress={() => addToPortfolio(item)}
                accessibilityRole="button"
                aria-label={`Aggiungi ${name}`}
              >
                <View style={styles.resultInfo}>
                  <ThemedText variant="bodyBold" numberOfLines={2}>
                    {name}
                  </ThemedText>
                  <ThemedText variant="subhead" color={colors.textSecondary} numberOfLines={1} style={{ marginTop: 2 }}>
                    {details}
                  </ThemedText>
                </View>
                <Plus size={20} color={colors.textSecondary} aria-hidden />
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
};

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  backButton: {
    width: spacing.headerButtonSize,
    height: spacing.headerButtonSize,
    borderRadius: radii.sm,
    ...continuousCurve,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  inputWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  searchInput: {
    height: 44,
    backgroundColor: colors.inputBackground,
    borderRadius: radii.sm,
    ...continuousCurve,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    paddingLeft: spacing.lg,
    paddingRight: 44,
    color: colors.text,
    fontSize: 16,
  },
  inputSpinner: {
    position: 'absolute',
    right: 14,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  emptyText: {
    marginTop: spacing.xxxl,
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 22,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.screenPaddingHorizontal,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  resultInfo: {
    flex: 1,
    marginRight: spacing.lg,
  },
});

export default SearchScreen;
