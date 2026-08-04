import { ThemeColors } from '../theme/colors';
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Copy, X, Folder, ChevronRight, Trash2 } from 'lucide-react-native';
import { useAppTheme } from '../theme/ThemeContext';
import { db, auth } from '../config/firebase';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { getHistoricalPrice } from '../services/yahooFinance';
import { parseLocalNumber, formatInputNumber } from '../utils/formatters';
import * as Clipboard from 'expo-clipboard';

type DatePickerInputProps = React.ComponentProps<typeof TextInput> & {
  value?: string;
  onChangeText?: (value: string) => void;
};

const DatePickerInput = (props: DatePickerInputProps & { colors: ThemeColors }) => {
  if (Platform.OS === 'web') {
    return React.createElement('input', {
      type: 'date',
      value: props.value,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => props.onChangeText?.(e.target.value),
      style: {
        backgroundColor: props.colors.inputBackground,
        border: 'none',
        borderRadius: 8,
        padding: '0 16px',
        height: 50,
        color: props.colors.text,
        fontSize: 16,
        width: '100%',
        maxWidth: '100%',
        boxSizing: 'border-box',
        outline: 'none',
        margin: 0,
        WebkitAppearance: 'none',
      }
    });
  }
  // Native fallback
  return <TextInput {...props} placeholder="2023-10-01" />;
};



export const EditTransactionScreen = () => {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const router = useRouter();
  const params = useLocalSearchParams<{
    id?: string;
    symbol?: string;
    name?: string;
    quantity?: string;
    purchasePrice?: string;
    date?: string;
    type?: 'BUY' | 'SELL';
    groups?: string | string[];
  }>();
  const txId = params.id ?? '';
  const symbol = params.symbol ?? '';
  const name = params.name ?? '';
  const initialQty = Number(params.quantity ?? 0);
  const initialPrice = Number(params.purchasePrice ?? 0);
  const initialDate = params.date ?? '';
  const initialType = params.type;

  const rawGroups = params.groups;
  let initialGroups: string[] = [];
  if (Array.isArray(rawGroups)) {
    initialGroups = rawGroups;
  } else if (typeof rawGroups === 'string') {
    initialGroups = rawGroups.includes(',') ? rawGroups.split(',') : [rawGroups];
  }

  const [quantity, setQuantity] = useState(formatInputNumber(initialQty));
  const [date, setDate] = useState(initialDate);
  const [purchasePrice, setPurchasePrice] = useState(formatInputNumber(initialPrice));
  const [type, setType] = useState<'BUY' | 'SELL'>(initialType || 'BUY');
  
  const [loading, setLoading] = useState(false);
  const [loadingPrice, setLoadingPrice] = useState(false);

  // Fetch historical price when date changes (only if date is modified)
  useEffect(() => {
    let isMounted = true;
    const fetchPrice = async () => {
      if (!date || date.length !== 10 || date === initialDate || !symbol) return;
      
      setLoadingPrice(true);
      try {
        const price = await getHistoricalPrice(symbol, date);
        if (isMounted && price) {
          setPurchasePrice(formatInputNumber(price));
        }
      } catch (error) {
        console.error("Error fetching historical price:", error);
      } finally {
        if (isMounted) setLoadingPrice(false);
      }
    };

    fetchPrice();
    return () => {
      isMounted = false;
    };
  }, [date, symbol, initialDate]);

  const handleSave = async () => {
    const qty = parseLocalNumber(quantity);
    const price = parseLocalNumber(purchasePrice);

    if (isNaN(qty) || qty <= 0) {
      showAlert('Errore', 'Inserisci una quantità valida.');
      return;
    }
    if (isNaN(price) || price < 0) {
      showAlert('Errore', 'Inserisci un prezzo valido.');
      return;
    }
    if (!date) {
      showAlert('Errore', 'Inserisci una data valida.');
      return;
    }

    setLoading(true);
    try {
      const userId = auth.currentUser?.uid;
      if (!userId) {
        showAlert('Errore', 'Devi essere autenticato.');
        return;
      }
      if (!txId) {
        showAlert('Errore', 'Transazione non valida.');
        return;
      }
      const txRef = doc(db, 'portfolios', userId, 'transactions', txId);
      await updateDoc(txRef, {
        quantity: qty,
        purchasePrice: price,
        date,
        type,
      });
      router.back();
    } catch (error) {
      console.error("Errore aggiornamento transazione:", error);
      showAlert('Errore', 'Impossibile aggiornare la transazione.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    const confirmDelete = async () => {
      setLoading(true);
      try {
        const userId = auth.currentUser?.uid;
        if (!userId) return;
        if (!txId) {
          setLoading(false);
          return;
        }
        const txRef = doc(db, 'portfolios', userId, 'transactions', txId);
        await deleteDoc(txRef);
        router.back();
      } catch (error) {
        console.error("Errore eliminazione transazione:", error);
        showAlert('Errore', 'Impossibile eliminare la transazione.');
        setLoading(false);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm("Sei sicuro di voler eliminare questa transazione?")) {
        confirmDelete();
      }
    } else {
      Alert.alert(
        "Elimina Transazione",
        "Sei sicuro di voler eliminare questa transazione?",
        [
          { text: "Annulla", style: "cancel" },
          { text: "Elimina", style: "destructive", onPress: confirmDelete }
        ]
      );
    }
  };

  const handleCopy = async () => {
    await Clipboard.setStringAsync(symbol);
    showAlert('Copiato', 'Ticker copiato negli appunti!');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.canGoBack() ? router.back() : router.replace('/')}>
          <X size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Modifica Transazione</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.assetHeader}>
          <Text style={styles.name}>{name}</Text>
          <View style={{flexDirection: 'row', alignItems: 'center'}}>
            <Text style={styles.symbol}>{symbol}</Text>
            <TouchableOpacity onPress={handleCopy} style={{ marginLeft: 6, padding: 4 }}>
              <Copy size={14} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.segmentedControl}>
          <TouchableOpacity 
            style={[styles.segmentButton, type === 'BUY' && styles.segmentButtonActive]}
            onPress={() => setType('BUY')}
          >
            <Text style={[styles.segmentButtonText, type === 'BUY' && styles.segmentButtonTextActive]}>Acquisto</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.segmentButton, type === 'SELL' && styles.segmentButtonActive]}
            onPress={() => setType('SELL')}
          >
            <Text style={[styles.segmentButtonText, type === 'SELL' && styles.segmentButtonTextActive]}>Vendita</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity 
          style={styles.changeGroupButton}
          onPress={() => router.push({ pathname: '/change-group', params: { 
            transactionId: txId,
            symbol,
            currentGroups: initialGroups
          }})}
        >
          <Folder size={20} color={colors.text} />
          <Text style={styles.changeGroupText}>
            Gruppi: {initialGroups?.join(', ') || ''} (Tocca per gestire)
          </Text>
          <ChevronRight size={20} color={colors.textSecondary} />
        </TouchableOpacity>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Quantità</Text>
          <TextInput
            style={styles.input}
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="decimal-pad"
            placeholder="es. 10"
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Data</Text>
          <DatePickerInput
            colors={colors}
            style={styles.input}
            value={date}
            onChangeText={setDate}
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.inputGroup}>
          <View style={styles.labelRow}>
            <Text style={[styles.label, { marginBottom: 0 }]}>
              {type === 'BUY' ? "Prezzo d'acquisto (unitario)" : "Prezzo di vendita (unitario)"}
            </Text>
            {loadingPrice && <ActivityIndicator size="small" color={colors.positive} style={{ marginLeft: 8 }} />}
          </View>
          <TextInput
            style={styles.input}
            value={purchasePrice}
            onChangeText={setPurchasePrice}
            keyboardType="decimal-pad"
            placeholder="es. 150.50"
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <TouchableOpacity 
          style={[styles.saveButton, loading && styles.saveButtonDisabled]} 
          onPress={handleSave}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.saveButtonText}>Salva Modifiche</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.deleteButton} 
          onPress={handleDelete}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.negative} />
          ) : (
            <>
              <Trash2 size={20} color={colors.negative} style={{ marginRight: 8 }} />
              <Text style={styles.deleteButtonText}>Elimina Transazione</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
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
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  assetHeader: {
    alignItems: 'center',
    marginBottom: 32,
    marginTop: 16,
  },
  symbol: {
    color: colors.textSecondary,
    fontSize: 16,
  },
  name: {
    color: colors.text,
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 4,
    textAlign: 'center',
  },
  inputGroup: {
    marginBottom: 24,
  },
  changeGroupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
  },
  changeGroupText: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 12,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 14,
    marginBottom: 8,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: colors.inputBackground,
    borderRadius: 8,
    padding: 4,
    marginBottom: 24,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 6,
  },
  segmentButtonActive: {
    backgroundColor: colors.card,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentButtonText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  segmentButtonTextActive: {
    color: colors.text,
  },
  input: {
    backgroundColor: colors.inputBackground,
    borderRadius: 8,
    paddingHorizontal: 16,
    height: 50,
    color: colors.text,
    fontSize: 16,
  },
  saveButton: {
    backgroundColor: colors.positive,
    borderRadius: 25,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 16,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteButton: {
    flexDirection: 'row',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.negative,
    borderRadius: 25,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  deleteButtonText: {
    color: colors.negative,
    fontSize: 16,
    fontWeight: '600',
  }
});

export default EditTransactionScreen;
