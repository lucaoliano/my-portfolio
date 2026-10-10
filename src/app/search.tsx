import { ThemeColors } from '../theme/colors';
import { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Plus } from 'lucide-react-native';
import { useAppTheme } from '../theme/ThemeContext';
import { searchSymbol, YahooSearchResult } from '../services/yahooFinance';

const QUOTE_TYPE_LABELS: Record<string, string> = {
  EQUITY: 'Azione',
  ETF: 'ETF',
  MUTUALFUND: 'Fondo',
};

// Codici di borsa di Yahoo → nomi leggibili; i codici sconosciuti restano come arrivano
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

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<YahooSearchResult[]>([]);
  // Query a cui si riferiscono i risultati mostrati (per non dire "nessun risultato" mentre si cerca)
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

    // Una risposta arrivata dopo che la query è cambiata non deve sovrascrivere quella nuova
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
    router.push({
      pathname: '/add-transaction',
      params: {
        symbol: item.symbol,
        name: item.longname || item.shortname,
        fromSearch: 'true'
      }
    });
  };

  const renderEmpty = () => {
    if (trimmed.length === 0) {
      return (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>Cerca per nome, ticker o ISIN</Text>
        </View>
      );
    }
    if (loading || resultsFor !== trimmed) return null;
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyText}>Nessun risultato per “{trimmed}”</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.canGoBack() ? router.back() : router.replace('/')}
          accessibilityRole="button"
          aria-label="Indietro"
        >
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
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
      </View>

      {error ? (
        <View style={styles.centerContainer} accessibilityLiveRegion="polite">
          <Text style={styles.emptyText} role="alert">Ricerca non disponibile. Riprova.</Text>
          <TouchableOpacity style={styles.retryButton} onPress={retry} accessibilityRole="button">
            <Text style={styles.retryText}>Riprova</Text>
          </TouchableOpacity>
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
              <TouchableOpacity
                style={styles.resultItem}
                onPress={() => addToPortfolio(item)}
                accessibilityRole="button"
                aria-label={`Aggiungi ${name}`}
              >
                <View style={styles.resultInfo}>
                  <Text style={styles.name} numberOfLines={2}>{name}</Text>
                  <Text style={styles.details} numberOfLines={1}>{details}</Text>
                </View>
                <Plus size={20} color={colors.textSecondary} aria-hidden />
              </TouchableOpacity>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 8,
    paddingRight: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  inputWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  searchInput: {
    height: 48,
    backgroundColor: colors.inputBackground,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    paddingLeft: 16,
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
    paddingHorizontal: 20,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 16,
    marginTop: 40,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    minHeight: 44,
    paddingHorizontal: 24,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  resultInfo: {
    flex: 1,
    marginRight: 16,
  },
  name: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  details: {
    color: colors.textSecondary,
    fontSize: 14,
  },
});

export default SearchScreen;
