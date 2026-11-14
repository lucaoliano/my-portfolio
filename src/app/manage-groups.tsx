import { ThemeColors } from '../theme/colors';
import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView, TextInput, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Trash2, Edit2, Check, Plus, ChevronUp, ChevronDown, X } from 'lucide-react-native';
import { useAppTheme } from '../theme/ThemeContext';
import { db, auth } from '../config/firebase';
import { doc, getDoc, setDoc, collection, query, getDocs, writeBatch } from 'firebase/firestore';
import type { DocumentData, DocumentReference } from 'firebase/firestore';
import { UserSettings } from '../types';
import {
  cleanPortfolios,
  getPortfolioGroups,
  addPortfolioGroup,
  renamePortfolioGroup,
  removePortfolioGroup,
  reorderPortfolioGroups,
  DEFAULT_PORTFOLIO,
} from '../utils/portfolioManager';

// Gruppo in cui la sincronizzazione Scalable scrive le transazioni (targetGroup)
const SCALABLE_GROUP = 'Scalable';
const SCALABLE_LOCKED_MESSAGE = 'Il gruppo Scalable riceve le transazioni sincronizzate: non si può rinominare o eliminare.';
const MAX_GROUP_NAME = 40;
const BATCH_SIZE = 400;

type TxUpdate = { ref: DocumentReference; data: Record<string, unknown> };

const txGroupsOf = (data: DocumentData): string[] =>
  data.groups || (data.group ? [data.group] : ['Generale']);

/** Scrive gli aggiornamenti delle transazioni a blocchi, entro i limiti di Firestore. */
const commitTxUpdates = async (updates: TxUpdate[]) => {
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    updates.slice(i, i + BATCH_SIZE).forEach(op => batch.update(op.ref, op.data));
    await batch.commit();
  }
};

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const ManageGroupsScreen = () => {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);
  const router = useRouter();
  const [loading, setLoading] = useState(() => Boolean(auth.currentUser?.uid));
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string>('default');
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [newGroup, setNewGroup] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  // Il blocco del gruppo Scalable è una spiegazione, non un errore: niente rosso
  const noticeIsInfo = notice === SCALABLE_LOCKED_MESSAGE;
  const userId = auth.currentUser?.uid;
  const settingsDocRef = useMemo<DocumentReference<DocumentData> | null>(
    () => (userId ? doc(db, 'portfolios', userId, 'settings', 'preferences') : null),
    [userId],
  );
  const [loadKey, setLoadKey] = useState(0);

  const portfoliosList = useMemo(() => {
    if (!settings?.portfolios || settings.portfolios.length === 0) {
      return [DEFAULT_PORTFOLIO];
    }
    return cleanPortfolios(settings.portfolios);
  }, [settings]);

  const activePort = useMemo(() => {
    return portfoliosList.find(p => p.id === selectedPortfolioId) || portfoliosList[0];
  }, [portfoliosList, selectedPortfolioId]);

  const currentGroups = useMemo(() => {
    return getPortfolioGroups(activePort, settings?.groups);
  }, [activePort, settings]);

  const defaultGroup = activePort.defaultGroup || currentGroups[0] || 'Generale';

  // window.confirm sul web (Alert.alert lì non mostra pulsanti), Alert.alert su iOS/Android
  const confirmDestructive = (title: string, message: string, confirmLabel: string, onConfirm: () => void) => {
    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    } else {
      Alert.alert(title, message, [
        { text: 'Annulla', style: 'cancel' },
        { text: confirmLabel, onPress: onConfirm, style: 'destructive' }
      ]);
    }
  };

  useEffect(() => {
    if (!settingsDocRef) return;
    let cancelled = false;
    const load = async () => {
      try {
        const snap = await getDoc(settingsDocRef);
        if (cancelled) return;
        setLoadError(false);
        if (snap.exists()) {
          const data = snap.data() as UserSettings;
          setSettings(data);
          if (data.defaultPortfolioId) {
            setSelectedPortfolioId(data.defaultPortfolioId);
          }
        } else {
          // Di norma lo crea useUserSettings; qui basta un valore iniziale (si salva con merge)
          setSettings({
            groups: ['Generale'],
            defaultGroup: 'Generale',
            portfolios: [DEFAULT_PORTFOLIO],
            defaultPortfolioId: DEFAULT_PORTFOLIO.id,
          });
        }
      } catch (error) {
        if (cancelled) return;
        console.warn("Errore fetch gruppi:", error);
        setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [settingsDocRef, loadKey]);

  const retryLoad = () => {
    if (!settingsDocRef) return;
    setLoading(true);
    setLoadError(false);
    setLoadKey(k => k + 1);
  };

  /** Il documento delle preferenze può non esistere ancora: setDoc con merge lo crea. */
  const saveSettings = async (data: Partial<UserSettings>) => {
    if (!settingsDocRef) throw new Error('Preferenze non disponibili');
    await setDoc(settingsDocRef, data, { merge: true });
  };

  const handleAddNewGroup = async () => {
    const name = newGroup.trim();
    if (!name || !settings || !settingsDocRef || saving) return;
    setNotice(null);
    if (currentGroups.includes(name)) {
      setNotice('Esiste già un gruppo con questo nome in questo portafoglio.');
      return;
    }

    setSaving(true);
    try {
      const result = addPortfolioGroup(portfoliosList, activePort.id, name);
      if (result.error) {
        setNotice(result.error);
        setSaving(false);
        return;
      }
      const updatedPortfolios = result.portfolios;
      const updatedLegacyGroups = Array.from(new Set([...(settings.groups || []), name]));
      await saveSettings({
        portfolios: updatedPortfolios,
        groups: updatedLegacyGroups,
      });
      setSettings({
        ...settings,
        portfolios: updatedPortfolios,
        groups: updatedLegacyGroups,
      });
      setNewGroup('');
    } catch (e) {
      console.warn(e);
      setNotice('Gruppo non aggiunto. Riprova.');
    } finally {
      setSaving(false);
    }
  };

  const moveGroup = async (index: number, delta: -1 | 1) => {
    if (!settings || !settingsDocRef || saving) return;
    const target = index + delta;
    if (target < 0 || target >= currentGroups.length) return;
    const updatedPortfolios = reorderPortfolioGroups(portfoliosList, activePort.id, index, delta);

    setNotice(null);
    setSaving(true);
    try {
      await saveSettings({ portfolios: updatedPortfolios });
      setSettings({ ...settings, portfolios: updatedPortfolios });
    } catch (e) {
      console.warn(e);
      setNotice('Ordine non salvato. Riprova.');
    } finally {
      setSaving(false);
    }
  };

  const handleStartEdit = (group: string) => {
    setNotice(null);
    if (group === SCALABLE_GROUP) {
      setNotice(SCALABLE_LOCKED_MESSAGE);
      return;
    }
    setEditingGroup(group);
    setEditName(group);
  };

  const handleCancelEdit = () => {
    setEditingGroup(null);
    setEditName('');
  };

  const handleSaveEdit = async (oldName: string) => {
    if (saving) return;
    const newName = editName.trim();
    if (!newName || newName === oldName) {
      handleCancelEdit();
      return;
    }
    if (oldName === SCALABLE_GROUP) {
      setNotice(SCALABLE_LOCKED_MESSAGE);
      return;
    }
    if (currentGroups.includes(newName)) {
      setNotice('Esiste già un gruppo con questo nome.');
      return;
    }

    setNotice(null);
    setSaving(true);
    try {
      if (!userId || !settings || !settingsDocRef) throw new Error('Non autorizzato');

      const result = renamePortfolioGroup(portfoliosList, activePort.id, oldName, newName);
      if (result.error) {
        setNotice(result.error);
        setSaving(false);
        return;
      }
      const updatedPortfolios = result.portfolios;

      const snapshot = await getDocs(query(collection(db, 'portfolios', userId, 'transactions')));
      const updates: TxUpdate[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const txPortId = data.portfolioId || 'default';
        if (txPortId !== activePort.id) return;
        const txGroups = txGroupsOf(data);
        if (txGroups.includes(oldName)) {
          const renamed = txGroups.map(g => g === oldName ? newName : g);
          updates.push({ ref: docSnap.ref, data: { groups: renamed, group: renamed[0] } });
        }
      });

      await commitTxUpdates(updates);
      await saveSettings({ portfolios: updatedPortfolios });

      setSettings({ ...settings, portfolios: updatedPortfolios });
      handleCancelEdit();
    } catch (e) {
      console.warn(e);
      setNotice('Gruppo non rinominato. Riprova.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (groupName: string) => {
    if (!settings || groupName === defaultGroup || saving) return;
    setNotice(null);
    if (groupName === SCALABLE_GROUP) {
      setNotice(SCALABLE_LOCKED_MESSAGE);
      return;
    }
    if (!userId || !settingsDocRef) return;

    setSaving(true);
    const updates: TxUpdate[] = [];
    let moved = 0;
    let kept = 0;
    try {
      const snapshot = await getDocs(query(collection(db, 'portfolios', userId, 'transactions')));
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const txPortId = data.portfolioId || 'default';
        if (txPortId !== activePort.id) return;
        const txGroups = txGroupsOf(data);
        if (!txGroups.includes(groupName)) return;
        const remaining = txGroups.filter(g => g !== groupName);
        if (remaining.length === 0) {
          remaining.push(defaultGroup);
          moved++;
        } else {
          kept++;
        }
        updates.push({ ref: docSnap.ref, data: { groups: remaining, group: remaining[0] } });
      });
    } catch (e) {
      console.warn(e);
      setNotice('Transazioni non disponibili. Riprova.');
      setSaving(false);
      return;
    }
    setSaving(false);

    const lines: string[] = [];
    if (moved === 0 && kept === 0) {
      lines.push(`Il gruppo "${groupName}" non contiene transazioni nel portafoglio "${activePort.name}".`);
    } else {
      if (moved > 0) {
        lines.push(`${moved} ${plural(moved, 'transazione', 'transazioni')} ${plural(moved, 'passa', 'passano')} al gruppo "${defaultGroup}".`);
      }
      if (kept > 0) {
        lines.push(`${kept} ${plural(kept, 'transazione resta', 'transazioni restano')} negli altri gruppi a cui ${plural(kept, 'appartiene', 'appartengono')}.`);
      }
      lines.push('Nessuna transazione viene eliminata.');
    }

    confirmDestructive('Elimina gruppo', lines.join('\n'), 'Elimina', async () => {
      setSaving(true);
      try {
        const result = removePortfolioGroup(portfoliosList, activePort.id, groupName);
        if (result.error) {
          setNotice(result.error);
          setSaving(false);
          return;
        }
        const updatedPortfolios = result.portfolios;
        await commitTxUpdates(updates);
        await saveSettings({ portfolios: updatedPortfolios });
        setSettings({ ...settings, portfolios: updatedPortfolios });
      } catch (e) {
        console.warn(e);
        setNotice('Gruppo non eliminato. Riprova.');
      } finally {
        setSaving(false);
      }
    });
  };

  const renderBody = () => {
    if (loading) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.textSecondary} />
        </View>
      );
    }
    if (loadError || !settings) {
      return (
        <View style={styles.centerContainer}>
          <Text style={styles.description} role="alert">Gruppi non disponibili. Riprova.</Text>
          <TouchableOpacity style={styles.retryButton} onPress={retryLoad} accessibilityRole="button">
            <Text style={styles.retryText}>Riprova</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const addDisabled = !newGroup.trim() || saving;

    return (
      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} keyboardShouldPersistTaps="handled">
        <Text style={styles.description}>
          Crea, rinomina, riordina o elimina i gruppi di ciascun portafoglio. Il gruppo predefinito &quot;{defaultGroup}&quot; non si può eliminare.
        </Text>

        {portfoliosList.length > 1 && (
          <View style={styles.portfolioSelectorBar}>
            <Text style={styles.portfolioSelectorLabel}>Portafoglio:</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.portfolioScroll}
              accessibilityRole="tablist"
              aria-label="Portafogli"
            >
              {portfoliosList.map(p => {
                const isSelected = activePort.id === p.id;
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.portfolioPill, isSelected && styles.portfolioPillActive]}
                    onPress={() => {
                      setSelectedPortfolioId(p.id);
                      setEditingGroup(null);
                      setNotice(null);
                    }}
                    accessibilityRole="tab"
                    aria-selected={isSelected}
                    accessibilityLabel={`Portafoglio ${p.name}`}
                  >
                    <Text style={[styles.portfolioPillText, isSelected && styles.portfolioPillTextActive]}>
                      {p.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        <View style={styles.addGroupContainer}>
          <TextInput
            style={styles.input}
            value={newGroup}
            onChangeText={setNewGroup}
            placeholder={`Nuovo gruppo per ${activePort.name}`}
            placeholderTextColor={colors.textSecondary}
            editable={!saving}
            maxLength={MAX_GROUP_NAME}
            returnKeyType="done"
            onSubmitEditing={() => void handleAddNewGroup()}
            aria-label="Nome del nuovo gruppo"
          />
          <TouchableOpacity
            style={[styles.addButton, addDisabled && styles.disabled]}
            onPress={() => void handleAddNewGroup()}
            disabled={addDisabled}
            accessibilityRole="button"
            aria-label="Aggiungi gruppo"
            aria-disabled={addDisabled}
          >
            <Plus size={20} color={colors.onAccent} />
          </TouchableOpacity>
        </View>

        {notice && (
          <Text style={[styles.notice, noticeIsInfo && styles.noticeInfo]} role={noticeIsInfo ? 'status' : 'alert'}>{notice}</Text>
        )}

        <View style={styles.groupsList}>
          {currentGroups.map((group, index) => {
            const isDefault = group === defaultGroup;
            const isScalable = group === SCALABLE_GROUP;
            const isEditing = editingGroup === group;
            const isFirst = index === 0;
            const isLast = index === currentGroups.length - 1;
            const upDisabled = isFirst || saving;
            const downDisabled = isLast || saving;

            return (
              <View key={group} style={styles.groupRow}>
                {isEditing ? (
                  <TextInput
                    style={[styles.input, styles.editInput]}
                    value={editName}
                    onChangeText={setEditName}
                    autoFocus
                    editable={!saving}
                    maxLength={MAX_GROUP_NAME}
                    returnKeyType="done"
                    onSubmitEditing={() => void handleSaveEdit(group)}
                    aria-label={`Nuovo nome per ${group}`}
                  />
                ) : (
                  <View style={styles.groupLabel}>
                    <Text style={styles.groupName} numberOfLines={2}>{group}</Text>
                    {(isDefault || isScalable) && (
                      <Text style={styles.groupMeta}>
                        {isDefault ? 'Predefinito' : 'Sincronizzato da Scalable'}
                      </Text>
                    )}
                  </View>
                )}

                <View style={styles.actions}>
                  {isEditing ? (
                    <>
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={handleCancelEdit}
                        disabled={saving}
                        accessibilityRole="button"
                        aria-label="Annulla modifica"
                        aria-disabled={saving}
                      >
                        <X size={20} color={colors.textSecondary} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => void handleSaveEdit(group)}
                        disabled={saving}
                        accessibilityRole="button"
                        aria-label="Salva nome"
                        aria-disabled={saving}
                        aria-busy={saving}
                      >
                        {saving ? <ActivityIndicator size="small" color={colors.textSecondary} /> : <Check size={20} color={colors.positive} />}
                      </TouchableOpacity>
                    </>
                  ) : (
                    <>
                      <View style={styles.reorderContainer}>
                        <TouchableOpacity
                          style={[styles.actionButton, upDisabled && styles.disabled]}
                          onPress={() => void moveGroup(index, -1)}
                          disabled={upDisabled}
                          accessibilityRole="button"
                          aria-label={`Sposta su ${group}`}
                          aria-disabled={upDisabled}
                        >
                          <ChevronUp size={20} color={colors.text} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionButton, downDisabled && styles.disabled]}
                          onPress={() => void moveGroup(index, 1)}
                          disabled={downDisabled}
                          accessibilityRole="button"
                          aria-label={`Sposta giù ${group}`}
                          aria-disabled={downDisabled}
                        >
                          <ChevronDown size={20} color={colors.text} />
                        </TouchableOpacity>
                      </View>
                      {/* Scalable resta premibile ma attenuato: il tocco spiega perché è bloccato */}
                      <TouchableOpacity
                        style={[styles.actionButton, (saving || isScalable) && styles.disabled]}
                        onPress={() => handleStartEdit(group)}
                        disabled={saving}
                        accessibilityRole="button"
                        aria-label={`Rinomina ${group}`}
                        aria-disabled={saving || isScalable}
                      >
                        <Edit2 size={18} color={colors.textSecondary} />
                      </TouchableOpacity>
                      {!isDefault && (
                        <TouchableOpacity
                          style={[styles.actionButton, (saving || isScalable) && styles.disabled]}
                          onPress={() => void handleDelete(group)}
                          disabled={saving}
                          accessibilityRole="button"
                          aria-label={`Elimina ${group}`}
                          aria-disabled={saving || isScalable}
                        >
                          <Trash2 size={18} color={isScalable ? colors.textSecondary : colors.negative} />
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
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.canGoBack() ? router.back() : router.replace('/')}
          accessibilityRole="button"
          aria-label="Indietro"
        >
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} role="heading">Gestione gruppi</Text>
        <View style={styles.headerSpacer} />
      </View>
      {renderBody()}
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
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSpacer: {
    width: 44,
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
    paddingHorizontal: 20,
  },
  retryButton: {
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
  content: {
    flex: 1,
  },
  contentInner: {
    padding: 16,
  },
  description: {
    color: colors.textSecondary,
    fontSize: 14,
    marginBottom: 20,
    lineHeight: 20,
  },
  portfolioSelectorBar: {
    marginBottom: 20,
  },
  portfolioSelectorLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8,
  },
  portfolioScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  portfolioPill: {
    minHeight: 34,
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 17,
  },
  portfolioPillActive: {
    backgroundColor: colors.card,
    borderColor: colors.text,
  },
  portfolioPillText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  portfolioPillTextActive: {
    color: colors.text,
    fontWeight: '600',
  },
  addGroupContainer: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  input: {
    flex: 1,
    backgroundColor: colors.inputBackground,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    paddingHorizontal: 16,
    height: 48,
    color: colors.text,
    fontSize: 16,
    marginRight: 12,
  },
  editInput: {
    marginRight: 4,
    paddingHorizontal: 12,
  },
  addButton: {
    backgroundColor: colors.positive,
    width: 48,
    height: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
  notice: {
    color: colors.negative,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  noticeInfo: {
    color: colors.text,
  },
  groupsList: {
    marginTop: 8,
    gap: 12,
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    paddingVertical: 6,
    paddingLeft: 16,
    paddingRight: 4,
    minHeight: 56,
    borderRadius: 12,
    justifyContent: 'space-between',
  },
  groupLabel: {
    flex: 1,
    marginRight: 4,
  },
  groupName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '500',
  },
  groupMeta: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reorderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: colors.border,
    marginRight: 2,
  },
  actionButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default ManageGroupsScreen;
