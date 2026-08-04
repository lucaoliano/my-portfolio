import { ThemeColors } from '../theme/colors';
import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Copy, X } from 'lucide-react-native';
import { useAppTheme } from '../theme/ThemeContext';
import { db, auth } from '../config/firebase';
import { collection, addDoc, doc, getDoc, updateDoc } from 'firebase/firestore';
import type { DocumentData, DocumentReference } from 'firebase/firestore';
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



export const AddTransactionScreen = () => {
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
  const params = useLocalSearchParams<{ symbol?: string, name?: string, fromSearch?: string, preselectedGroups?: string }>();
  const symbol = params?.symbol || '';
  const name = params?.name || '';

  const [quantity, setQuantity] = useState('1');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [purchasePrice, setPurchasePrice] = useState('');
  const [type, setType] = useState<'BUY' | 'SELL'>('BUY');
  
  const initialGroupsArray = useMemo(() => {
    return params.preselectedGroups ? params.preselectedGroups.split(',').filter(Boolean) : ['Generale'];
  }, [params.preselectedGroups]);
  const [existingGroups, setExistingGroups] = useState<string[]>(initialGroupsArray);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set(initialGroupsArray));
  const [newGroup, setNewGroup] = useState('');

  const [loading, setLoading] = useState(false);
  const [loadingPrice, setLoadingPrice] = useState(false);

  const [settingsDocRef, setSettingsDocRef] = useState<DocumentReference<DocumentData> | null>(null);

  useEffect(() => {
    const fetchExistingGroups = async () => {
      try {
        const userId = auth.currentUser?.uid;
        if (!userId) return;
        
        const prefRef = doc(db, 'portfolios', userId, 'settings', 'preferences');
        setSettingsDocRef(prefRef);
        const snap = await getDoc(prefRef);
        if (snap.exists()) {
          const s = snap.data() as { groups: string[], defaultGroup: string };
          const combined = Array.from(new Set([...s.groups, ...initialGroupsArray])).sort();
          setExistingGroups(combined);
        } else {
          const combined = Array.from(new Set(['Generale', ...initialGroupsArray])).sort();
          setExistingGroups(combined);
        }
      } catch (error) {
        console.error("Errore fetch groups:", error);
      }
    };
    fetchExistingGroups();
  }, [initialGroupsArray]);

  const toggleGroup = (groupName: string) => {
    setSelectedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupName)) {
        next.delete(groupName);
      } else {
        next.add(groupName);
      }
      return next;
    });
  };

  const handleAddNewGroup = async () => {
    const name = newGroup.trim();
    if (!name) return;
    
    const newGroups = Array.from(new Set([...existingGroups, name])).sort();
    setExistingGroups(newGroups);
    setSelectedGroups(prev => {
      const next = new Set(prev);
      next.add(name);
      return next;
    });
    setNewGroup('');

    // Save to Firestore
    if (settingsDocRef) {
      try {
        await updateDoc(settingsDocRef, { groups: newGroups });
      } catch (e) {
        console.error("Impossibile salvare il nuovo gruppo:", e);
      }
    }
  };

  // Fetch historical price when date changes
  useEffect(() => {
    let isMounted = true;
    const fetchPrice = async () => {
      if (!date || date.length !== 10 || !symbol) return;
      
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
  }, [date, symbol]);

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
    const finalGroups = Array.from(selectedGroups);
    if (finalGroups.length === 0) {
      showAlert('Errore', 'Seleziona almeno un gruppo.');
      return;
    }

    setLoading(true);
    try {
      const userId = auth.currentUser?.uid;
      if (!userId) {
        showAlert('Errore', 'Devi essere autenticato per aggiungere una transazione.');
        return;
      }

      await addDoc(collection(db, 'portfolios', userId, 'transactions'), {
        symbol: params.symbol,
        name: params.name || '',
        quantity: qty,
        purchasePrice: price,
        date,
        type,
        groups: finalGroups
      });
      if (params.fromSearch === 'true') {
        router.navigate('/');
      } else {
        router.back();
      }
    } catch (error) {
      console.error("Errore salvataggio transazione:", error);
      showAlert('Errore', 'Impossibile salvare la transazione.');
    } finally {
      setLoading(false);
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
        <Text style={styles.headerTitle}>Nuova Transazione</Text>
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

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Gruppi</Text>
          <View style={styles.groupsContainer}>
            {existingGroups.map(item => {
              const isSelected = selectedGroups.has(item);
              return (
                <TouchableOpacity 
                  key={item}
                  style={[styles.groupChip, isSelected && styles.groupChipActive]}
                  onPress={() => toggleGroup(item)}
                >
                  <Text style={[styles.groupChipText, isSelected && styles.groupChipTextActive]}>
                    {item}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Crea nuovo gruppo</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, { flex: 1, marginRight: 12 }]}
              value={newGroup}
              onChangeText={setNewGroup}
              placeholder="Nome nuovo gruppo..."
              placeholderTextColor={colors.textSecondary}
            />
            <TouchableOpacity 
              style={[styles.createGroupButton, !newGroup.trim() && { opacity: 0.5 }]}
              onPress={handleAddNewGroup}
              disabled={!newGroup.trim()}
            >
              <Text style={styles.createGroupButtonText}>Aggiungi</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity 
          style={[styles.saveButton, loading && styles.saveButtonDisabled]} 
          onPress={handleSave}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.saveButtonText}>Aggiungi al Portafoglio</Text>
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
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  createGroupButton: {
    backgroundColor: colors.positive,
    height: 50,
    paddingHorizontal: 20,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  createGroupButtonText: {
    color: '#000',
    fontWeight: '600',
    fontSize: 16,
  },
  groupsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  groupChip: {
    backgroundColor: colors.card,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  groupChipActive: {
    borderColor: colors.positive,
    backgroundColor: colors.positive + '20',
  },
  groupChipText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  groupChipTextActive: {
    color: colors.positive,
  },
  saveButton: {
    backgroundColor: colors.positive,
    borderRadius: 25,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 40,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default AddTransactionScreen;
