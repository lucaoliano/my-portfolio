import { ThemeColors } from '../theme/colors';
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView, TextInput, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Trash2, Edit2, Check, Plus, ChevronUp, ChevronDown } from 'lucide-react-native';
import { useAppTheme } from '../theme/ThemeContext';
import { db, auth } from '../config/firebase';
import { doc, getDoc, updateDoc, collection, query, getDocs, writeBatch } from 'firebase/firestore';
import type { DocumentData, DocumentReference } from 'firebase/firestore';
import { UserSettings } from '../types';

export const ManageGroupsScreen = () => {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [newGroup, setNewGroup] = useState('');
  const [settingsDocRef, setSettingsDocRef] = useState<DocumentReference<DocumentData> | null>(null);

  const showAlert = (title: string, message: string, onConfirm?: () => void) => {
    if (Platform.OS === 'web') {
      if (onConfirm) {
        if (window.confirm(`${title}\n\n${message}`)) {
          onConfirm();
        }
      } else {
        window.alert(`${title}\n\n${message}`);
      }
    } else {
      if (onConfirm) {
        Alert.alert(title, message, [
          { text: 'Annulla', style: 'cancel' },
          { text: 'Conferma', onPress: onConfirm, style: 'destructive' }
        ]);
      } else {
        Alert.alert(title, message);
      }
    }
  };

  useEffect(() => {
    const fetchSettings = async () => {
      const userId = auth.currentUser?.uid;
      if (!userId) {
        setLoading(false);
        return;
      }

      const prefRef = doc(db, 'portfolios', userId, 'settings', 'preferences');
      setSettingsDocRef(prefRef);
      try {
        const snap = await getDoc(prefRef);
        if (snap.exists()) {
          setSettings(snap.data() as UserSettings);
        } else {
          // It should have been created in index.tsx, but just in case
          setSettings({ groups: ['Generale'], defaultGroup: 'Generale' });
        }
      } catch (error) {
        console.error("Errore fetch gruppi:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleAddNewGroup = async () => {
    const name = newGroup.trim();
    if (!name || !settings || !settingsDocRef) return;
    if (settings.groups.includes(name)) {
      showAlert('Errore', 'Il gruppo esiste già.');
      return;
    }

    setSaving(true);
    try {
      // Add to the end instead of sorting
      const updatedGroups = [...settings.groups, name];
      await updateDoc(settingsDocRef, { groups: updatedGroups });
      setSettings({ ...settings, groups: updatedGroups });
      setNewGroup('');
    } catch (e) {
      console.error(e);
      showAlert('Errore', 'Impossibile aggiungere il gruppo.');
    } finally {
      setSaving(false);
    }
  };

  const moveGroupUp = async (index: number) => {
    if (index === 0 || !settings || !settingsDocRef) return;
    const newGroups = [...settings.groups];
    [newGroups[index - 1], newGroups[index]] = [newGroups[index], newGroups[index - 1]];
    
    setSaving(true);
    try {
      await updateDoc(settingsDocRef, { groups: newGroups });
      setSettings({ ...settings, groups: newGroups });
    } catch (e) {
      console.error(e);
      showAlert('Errore', 'Impossibile riordinare il gruppo.');
    } finally {
      setSaving(false);
    }
  };

  const moveGroupDown = async (index: number) => {
    if (!settings || !settingsDocRef || index === settings.groups.length - 1) return;
    const newGroups = [...settings.groups];
    [newGroups[index + 1], newGroups[index]] = [newGroups[index], newGroups[index + 1]];
    
    setSaving(true);
    try {
      await updateDoc(settingsDocRef, { groups: newGroups });
      setSettings({ ...settings, groups: newGroups });
    } catch (e) {
      console.error(e);
      showAlert('Errore', 'Impossibile riordinare il gruppo.');
    } finally {
      setSaving(false);
    }
  };

  const handleStartEdit = (group: string) => {
    setEditingGroup(group);
    setEditName(group);
  };

  const handleSaveEdit = async (oldName: string) => {
    const newName = editName.trim();
    if (!newName || newName === oldName) {
      setEditingGroup(null);
      return;
    }
    if (settings?.groups.includes(newName)) {
      showAlert('Errore', 'Un gruppo con questo nome esiste già.');
      return;
    }

    setSaving(true);
    try {
      const userId = auth.currentUser?.uid;
      if (!userId || !settings || !settingsDocRef) throw new Error('Non autorizzato');

      // 1. Update settings document
      const updatedGroups = settings.groups.map(g => g === oldName ? newName : g);
      
      const isDefault = oldName === settings.defaultGroup;
      
      const operations: { ref: DocumentReference; data: Record<string, unknown> }[] = [];
      const updateData: { groups: string[]; defaultGroup?: string } = { groups: updatedGroups };
      if (isDefault) {
        updateData.defaultGroup = newName;
      }
      operations.push({ ref: settingsDocRef, data: updateData });

      // 2. Query and update all transactions that have the oldName
      const q = query(collection(db, 'portfolios', userId, 'transactions'));
      const snapshot = await getDocs(q);
      
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        let changed = false;
        
        // Handle array 'groups'
        let txGroups = data.groups || (data.group ? [data.group] : ['Generale']);
        if (txGroups.includes(oldName)) {
          txGroups = txGroups.map((g: string) => g === oldName ? newName : g);
          changed = true;
        }

        if (changed) {
          operations.push({ ref: docSnap.ref, data: { groups: txGroups, group: txGroups[0] } });
        }
      });

      // Commit in chunks of 400 to respect Firestore limits
      for (let i = 0; i < operations.length; i += 400) {
        const chunk = operations.slice(i, i + 400);
        const batch = writeBatch(db);
        chunk.forEach(op => batch.update(op.ref, op.data));
        await batch.commit();
      }

      setSettings({ 
        ...settings, 
        groups: updatedGroups,
        ...(oldName === settings.defaultGroup ? { defaultGroup: newName } : {})
      });
      setEditingGroup(null);
    } catch (e) {
      console.error(e);
      showAlert('Errore', 'Impossibile rinominare il gruppo.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (groupName: string) => {
    if (groupName === settings?.defaultGroup) return;

    showAlert(
      'Elimina Gruppo',
      `Sei sicuro di voler eliminare il gruppo "${groupName}"?\nLe transazioni in questo gruppo verranno spostate in "${settings?.defaultGroup}".`,
      async () => {
        setSaving(true);
        try {
          const userId = auth.currentUser?.uid;
          if (!userId || !settings || !settingsDocRef) throw new Error('Non autorizzato');

          const updatedGroups = settings.groups.filter(g => g !== groupName);
          const operations: { ref: DocumentReference; data: Record<string, unknown> }[] = [];
          operations.push({ ref: settingsDocRef, data: { groups: updatedGroups } });

          // 2. Query all transactions
          const q = query(collection(db, 'portfolios', userId, 'transactions'));
          const snapshot = await getDocs(q);
          
          snapshot.forEach(docSnap => {
            const data = docSnap.data();
            let changed = false;
            let txGroups = data.groups || (data.group ? [data.group] : ['Generale']);
            
            if (txGroups.includes(groupName)) {
              txGroups = txGroups.filter((g: string) => g !== groupName);
              // If empty, fallback to defaultGroup
              if (txGroups.length === 0) {
                txGroups.push(settings.defaultGroup);
              }
              changed = true;
            }

            if (changed) {
              operations.push({ ref: docSnap.ref, data: { groups: txGroups, group: txGroups[0] } });
            }
          });

          // Commit in chunks of 400 to respect Firestore limits
          for (let i = 0; i < operations.length; i += 400) {
            const chunk = operations.slice(i, i + 400);
            const batch = writeBatch(db);
            chunk.forEach(op => batch.update(op.ref, op.data));
            await batch.commit();
          }

          setSettings({ ...settings, groups: updatedGroups });
        } catch (e) {
          console.error(e);
          showAlert('Errore', 'Impossibile eliminare il gruppo.');
        } finally {
          setSaving(false);
        }
      }
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.canGoBack() ? router.back() : router.replace('/')}>
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Gestione Gruppi</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.positive} />
        </View>
      ) : (
        <ScrollView style={styles.content}>
          <Text style={styles.description}>
            Crea, rinomina o elimina i gruppi. Il gruppo predefinito &quot;{settings?.defaultGroup}&quot; non può essere eliminato.
          </Text>

          <View style={styles.addGroupContainer}>
            <TextInput
              style={styles.input}
              value={newGroup}
              onChangeText={setNewGroup}
              placeholder="Nuovo gruppo..."
              placeholderTextColor={colors.textSecondary}
              editable={!saving}
            />
            <TouchableOpacity 
              style={[styles.addButton, (!newGroup.trim() || saving) && { opacity: 0.5 }]}
              onPress={handleAddNewGroup}
              disabled={!newGroup.trim() || saving}
            >
              <Plus size={20} color={colors.onAccent} />
            </TouchableOpacity>
          </View>

          <View style={styles.groupsList}>
            {settings?.groups.map((group, index) => {
              const isDefault = group === settings.defaultGroup;
              const isEditing = editingGroup === group;

              return (
                <View key={group} style={styles.groupRow}>
                  {isEditing ? (
                    <TextInput
                      style={[styles.input, { flex: 1, marginRight: 8, height: 40 }]}
                      value={editName}
                      onChangeText={setEditName}
                      autoFocus
                      editable={!saving}
                    />
                  ) : (
                    <Text style={[styles.groupName, isDefault && styles.defaultGroupName]}>
                      {group} {isDefault && "(Predefinito)"}
                    </Text>
                  )}

                  <View style={styles.actions}>
                    {isEditing ? (
                      <TouchableOpacity 
                        style={styles.actionButton}
                        onPress={() => handleSaveEdit(group)}
                        disabled={saving}
                      >
                        {saving ? <ActivityIndicator size="small" color={colors.positive} /> : <Check size={20} color={colors.positive} />}
                      </TouchableOpacity>
                    ) : (
                      <>
                        <View style={styles.reorderContainer}>
                          <TouchableOpacity 
                            style={styles.actionButton}
                            onPress={() => moveGroupUp(index)}
                            disabled={index === 0 || saving}
                          >
                            <ChevronUp size={20} color={index === 0 ? colors.textSecondary : colors.text} />
                          </TouchableOpacity>
                          <TouchableOpacity 
                            style={styles.actionButton}
                            onPress={() => moveGroupDown(index)}
                            disabled={index === settings.groups.length - 1 || saving}
                          >
                            <ChevronDown size={20} color={index === settings.groups.length - 1 ? colors.textSecondary : colors.text} />
                          </TouchableOpacity>
                        </View>
                        <TouchableOpacity 
                          style={styles.actionButton}
                          onPress={() => handleStartEdit(group)}
                          disabled={saving}
                        >
                          <Edit2 size={18} color={colors.textSecondary} />
                        </TouchableOpacity>
                        {!isDefault && (
                          <TouchableOpacity 
                            style={styles.actionButton}
                            onPress={() => handleDelete(group)}
                            disabled={saving}
                          >
                            <Trash2 size={18} color={colors.negative} />
                          </TouchableOpacity>
                        )}
                      </>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>
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
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  description: {
    color: colors.textSecondary,
    fontSize: 14,
    marginBottom: 24,
    lineHeight: 20,
  },
  addGroupContainer: {
    flexDirection: 'row',
    marginBottom: 32,
  },
  input: {
    flex: 1,
    backgroundColor: colors.inputBackground,
    borderRadius: 8,
    paddingHorizontal: 16,
    height: 48,
    color: colors.text,
    fontSize: 16,
    marginRight: 12,
  },
  addButton: {
    backgroundColor: colors.positive,
    width: 48,
    height: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupsList: {
    gap: 12,
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 12,
    justifyContent: 'space-between',
  },
  groupName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '500',
    flex: 1,
  },
  defaultGroupName: {
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reorderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: colors.border,
    paddingRight: 8,
    marginRight: 4,
  },
  actionButton: {
    padding: 8,
  },
});

export default ManageGroupsScreen;
