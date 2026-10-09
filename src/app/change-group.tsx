import { ThemeColors } from '../theme/colors';
import { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ActivityIndicator, FlatList, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { X, Check } from 'lucide-react-native';
import { useAppTheme } from '../theme/ThemeContext';
import { db, auth } from '../config/firebase';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import type { DocumentData, DocumentReference } from 'firebase/firestore';

export const ChangeGroupModal = () => {
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
    transactionId?: string;
    symbol?: string;
    name?: string;
    currentGroups?: string | string[];
  }>();
  const { transactionId, symbol, name: assetName, currentGroups: rawCurrentGroups } = params;
  
  let currentGroups: string[] = [];
  if (Array.isArray(rawCurrentGroups)) {
    currentGroups = rawCurrentGroups;
  } else if (typeof rawCurrentGroups === 'string') {
    currentGroups = rawCurrentGroups.includes(',') ? rawCurrentGroups.split(',') : [rawCurrentGroups];
  }

  const [existingGroups, setExistingGroups] = useState<string[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set(currentGroups));
  const [newGroup, setNewGroup] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
          setExistingGroups(s.groups.sort());
        } else {
          setExistingGroups(['Generale']);
        }
      } catch (error) {
        console.error("Errore fetch groups:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchExistingGroups();
  }, []);

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

  const handleAddNew = async () => {
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

    if (settingsDocRef) {
      try {
        await updateDoc(settingsDocRef, { groups: newGroups });
      } catch (e) {
        console.error("Impossibile salvare il nuovo gruppo:", e);
      }
    }
  };

  const handleSave = async () => {
    const finalGroups = Array.from(selectedGroups);
    if (finalGroups.length === 0) {
      showAlert('Errore', "Seleziona almeno un gruppo.");
      return;
    }
    
    setSaving(true);
    try {
      const userId = auth.currentUser?.uid;
      if (!userId) return;
      if (!transactionId) {
        showAlert('Errore', 'Transazione non valida.');
        setSaving(false);
        return;
      }

      const docRef = doc(db, 'portfolios', userId, 'transactions', transactionId);
      await updateDoc(docRef, { groups: finalGroups, group: null });
      
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/');
      }
    } catch (error) {
      console.error("Errore aggiornamento gruppo:", error);
      showAlert('Errore', "Impossibile aggiornare i gruppi.");
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.canGoBack() ? router.back() : router.replace('/')} disabled={saving}>
          <X size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center', marginHorizontal: 12 }}>
          <Text style={styles.headerTitle}>Gruppi</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>{assetName || symbol}</Text>
        </View>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.content}>
        <Text style={styles.label}>Crea un nuovo gruppo</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={newGroup}
            onChangeText={setNewGroup}
            placeholder="Nome nuovo gruppo..."
            placeholderTextColor={colors.textSecondary}
          />
          <TouchableOpacity 
            style={[styles.createButton, (!newGroup.trim() || saving) && { opacity: 0.5 }]}
            onPress={handleAddNew}
            disabled={!newGroup.trim() || saving}
          >
            <Text style={styles.createButtonText}>Aggiungi</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.label, { marginTop: 32, marginBottom: 16 }]}>O scegli dai gruppi esistenti</Text>
        
        {loading ? (
          <ActivityIndicator color={colors.positive} />
        ) : (
          <FlatList
            data={existingGroups}
            keyExtractor={item => item}
            style={{ flex: 1 }}
            renderItem={({ item }) => {
              const isSelected = selectedGroups.has(item);
              return (
                <TouchableOpacity 
                  style={[styles.groupItem, isSelected && styles.groupItemActive]}
                  onPress={() => toggleGroup(item)}
                  disabled={saving}
                >
                  <Text style={[styles.groupItemText, isSelected && styles.groupItemTextActive]}>
                    {item}
                  </Text>
                  {isSelected && <Check size={20} color={colors.positive} />}
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>
      
      <View style={styles.footer}>
        <TouchableOpacity 
          style={[styles.saveButton, saving && { opacity: 0.7 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.saveButtonText}>Salva Modifiche</Text>}
        </TouchableOpacity>
      </View>
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
  headerSubtitle: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 12,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: colors.inputBackground,
    height: 50,
    borderRadius: 8,
    paddingHorizontal: 16,
    color: colors.text,
    fontSize: 16,
    marginRight: 12,
  },
  createButton: {
    backgroundColor: colors.positive,
    height: 50,
    paddingHorizontal: 24,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  createButtonText: {
    color: '#000',
    fontWeight: '600',
    fontSize: 16,
  },
  groupItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  groupItemActive: {
    borderWidth: 1,
    borderColor: colors.positive,
  },
  groupItemText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '500',
  },
  groupItemTextActive: {
    color: colors.positive,
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  saveButton: {
    backgroundColor: colors.positive,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
  }
});

export default ChangeGroupModal;
