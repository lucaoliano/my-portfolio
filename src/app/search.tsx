import { ThemeColors } from '../theme/colors';
import { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useAppTheme } from '../theme/ThemeContext';
import { searchSymbol, YahooSearchResult } from '../services/yahooFinance';

export const SearchScreen = () => {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);
  const router = useRouter();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<YahooSearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const handleChangeText = (text: string) => {
    setQuery(text);
    if (text.trim().length <= 2) {
      setResults([]);
      setLoading(false);
    } else {
      setLoading(true);
    }
  };

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length <= 2) {
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const data = await searchSymbol(trimmed);
        setResults(data);
      } catch (error) {
        console.error("Search error:", error);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [query]);

  const addToPortfolio = (item: YahooSearchResult) => {
    router.push({
      pathname: '/add-transaction',
      params: { 
        symbol: item.symbol,
        name:  item.longname || item.shortname,
        fromSearch: 'true'
      }
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.canGoBack() ? router.back() : router.replace('/')}
        >
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <TextInput
          style={styles.searchInput}
          placeholder="Cerca azioni o ETF..."
          placeholderTextColor={colors.textSecondary}
          value={query}
          onChangeText={handleChangeText}
          autoFocus
          autoCapitalize="characters"
        />
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.positive} />
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.symbol}
          ListEmptyComponent={() => (
            query.trim().length > 2 ? (
              <View style={styles.centerContainer}>
                <Text style={styles.emptyText}>
                  Nessun risultato trovato per &quot;{query}&quot;
                </Text>
              </View>
            ) : null
          )}
          renderItem={({ item }) => (
            <View style={styles.resultItem}>
              <View style={styles.resultInfo}>
                <Text style={styles.symbol}>{item.symbol}</Text>
                <Text style={styles.name} numberOfLines={1}>{item.longname || item.shortname}</Text>
                <Text style={styles.exchange}>{item.exchange}</Text>
              </View>
              <TouchableOpacity 
                style={styles.addButton}
                onPress={() => addToPortfolio(item)}
              >
                <Text style={styles.addButtonText}>Aggiungi</Text>
              </TouchableOpacity>
            </View>
          )}
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
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    marginRight: 16,
  },
  searchInput: {
    flex: 1,
    height: 44,
    backgroundColor: colors.inputBackground,
    borderRadius: 8,
    paddingHorizontal: 16,
    color: colors.text,
    fontSize: 16,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 16,
    marginTop: 40,
    textAlign: 'center',
  },
  resultItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  resultInfo: {
    flex: 1,
    marginRight: 16,
  },
  symbol: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  name: {
    color: colors.textSecondary,
    fontSize: 14,
    marginBottom: 2,
  },
  exchange: {
    color: colors.textSecondary,
    fontSize: 12,
    opacity: 0.6,
  },
  addButton: {
    backgroundColor: colors.positive,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 90,
  },
  addButtonText: {
    color: '#000',
    fontWeight: '600',
    fontSize: 14,
  },
});

export default SearchScreen;
