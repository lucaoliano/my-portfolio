import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView, TextInput, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Trash2, Edit2, Check, Plus, ChevronUp, ChevronDown, X, Star } from 'lucide-react-native';
import { useAppTheme } from '../theme/ThemeContext';
import { ThemeColors, withAlpha } from '../theme/colors';
import { db, auth } from '../config/firebase';
import { doc, getDoc, setDoc, collection, query, getDocs, writeBatch } from 'firebase/firestore';
import type { DocumentReference } from 'firebase/firestore';
import { Portfolio, UserSettings } from '../types';
import {
  DEFAULT_PORTFOLIO,
  DEFAULT_PORTFOLIO_ID,
  cleanPortfolio,
  cleanPortfolios,
  createNewPortfolio,
  updateExistingPortfolio,
  setAsDefaultPortfolio,
  reorderPortfoliosList,
  validatePortfolioDeletion,
} from '../utils/portfolioManager';

export { cleanPortfolio, cleanPortfolios };

const MAX_NAME_LENGTH = 40;
const BATCH_SIZE = 400;

type TxUpdate = { ref: DocumentReference; data: Record<string, unknown> };

const commitTxUpdates = async (updates: TxUpdate[]) => {
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    updates.slice(i, i + BATCH_SIZE).forEach(op => batch.update(op.ref, op.data));
    await batch.commit();
  }
};

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const ManagePortfoliosScreen = () => {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);
  const router = useRouter();
  const userId = auth.currentUser?.uid;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [txCounts, setTxCounts] = useState<Record<string, { count: number; symbols: number }>>({});

  const [newPortfolioName, setNewPortfolioName] = useState('');
  const [newPortfolioDesc, setNewPortfolioDesc] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [loadKey, setLoadKey] = useState(0);

  const settingsDocRef = useMemo(
    () => (userId ? doc(db, 'portfolios', userId, 'settings', 'preferences') : null),
    [userId]
  );

  const confirmAction = (title: string, message: string, confirmLabel: string, onConfirm: () => void, isDestructive = false) => {
    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    } else {
      Alert.alert(title, message, [
        { text: 'Annulla', style: 'cancel' },
        { text: confirmLabel, onPress: onConfirm, style: isDestructive ? 'destructive' : 'default' }
      ]);
    }
  };

  useEffect(() => {
    if (!settingsDocRef || !userId) return;
    let cancelled = false;

    const load = async () => {
      try {
        const [snap, txSnap] = await Promise.all([
          getDoc(settingsDocRef),
          getDocs(query(collection(db, 'portfolios', userId, 'transactions')))
        ]);

        if (cancelled) return;
        setLoadError(false);

        let currentSettings: UserSettings;
        if (snap.exists()) {
          currentSettings = snap.data() as UserSettings;
          if (!currentSettings.portfolios || currentSettings.portfolios.length === 0) {
            currentSettings.portfolios = [DEFAULT_PORTFOLIO];
            currentSettings.defaultPortfolioId = DEFAULT_PORTFOLIO_ID;
            await setDoc(settingsDocRef, {
              portfolios: [DEFAULT_PORTFOLIO],
              defaultPortfolioId: DEFAULT_PORTFOLIO_ID,
            }, { merge: true });
          } else {
            currentSettings.portfolios = cleanPortfolios(currentSettings.portfolios);
          }
        } else {
          currentSettings = {
            groups: ['Generale'],
            defaultGroup: 'Generale',
            portfolios: [DEFAULT_PORTFOLIO],
            defaultPortfolioId: DEFAULT_PORTFOLIO_ID,
          };
          await setDoc(settingsDocRef, currentSettings);
        }

        if (cancelled) return;
        setSettings(currentSettings);

        // Statistiche per portafoglio
        const counts: Record<string, { count: number; symbolSet: Set<string> }> = {};
        txSnap.forEach(d => {
          const data = d.data();
          const pid = data.portfolioId || DEFAULT_PORTFOLIO_ID;
          if (!counts[pid]) counts[pid] = { count: 0, symbolSet: new Set() };
          counts[pid].count++;
          if (data.symbol) counts[pid].symbolSet.add(data.symbol);
        });

        const formattedCounts: Record<string, { count: number; symbols: number }> = {};
        Object.entries(counts).forEach(([pid, val]) => {
          formattedCounts[pid] = { count: val.count, symbols: val.symbolSet.size };
        });
        if (cancelled) return;
        setTxCounts(formattedCounts);
      } catch (err) {
        if (cancelled) return;
        console.warn('Errore fetch portafogli:', err);
        setLoadError(true);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [settingsDocRef, userId, loadKey]);

  const retryLoad = () => {
    setLoading(true);
    setLoadKey(k => k + 1);
  };

  const saveSettings = async (data: Partial<UserSettings>) => {
    if (!settingsDocRef) throw new Error('Preferenze non disponibili');
    const payload: Record<string, unknown> = { ...data };
    if (data.portfolios) {
      payload.portfolios = cleanPortfolios(data.portfolios);
    }
    await setDoc(settingsDocRef, payload, { merge: true });
  };

  const handleAddNew = async () => {
    if (!settings || saving) return;
    setNotice(null);

    const res = createNewPortfolio(
      settings.portfolios || [DEFAULT_PORTFOLIO],
      newPortfolioName,
      newPortfolioDesc
    );

    if (!res.ok || !res.portfolios) {
      setNotice(res.error || 'Errore nella creazione del portafoglio.');
      return;
    }

    setSaving(true);
    try {
      await saveSettings({ portfolios: res.portfolios });
      setSettings({ ...settings, portfolios: res.portfolios });
      setNewPortfolioName('');
      setNewPortfolioDesc('');
    } catch (e) {
      console.error('Errore aggiunta portafoglio:', e);
      setNotice('Portafoglio non aggiunto. Riprova.');
    } finally {
      setSaving(false);
    }
  };

  const handleStartEdit = (p: Portfolio) => {
    setNotice(null);
    setEditingId(p.id);
    setEditName(p.name);
    setEditDesc(p.description || '');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditDesc('');
  };

  const handleSaveEdit = async (id: string) => {
    if (saving || !settings) return;
    if (!editName.trim()) {
      handleCancelEdit();
      return;
    }

    setNotice(null);
    const res = updateExistingPortfolio(
      settings.portfolios || [DEFAULT_PORTFOLIO],
      id,
      editName,
      editDesc
    );

    if (!res.ok || !res.portfolios) {
      setNotice(res.error || 'Errore nella modifica del portafoglio.');
      return;
    }

    setSaving(true);
    try {
      await saveSettings({ portfolios: res.portfolios });
      setSettings({ ...settings, portfolios: res.portfolios });
      handleCancelEdit();
    } catch (e) {
      console.error('Errore modifica portafoglio:', e);
      setNotice('Modifica non salvata. Riprova.');
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefault = async (p: Portfolio) => {
    if (!settings || saving) return;
    setNotice(null);
    setSaving(true);
    try {
      const { portfolios, defaultPortfolioId } = setAsDefaultPortfolio(
        settings.portfolios || [DEFAULT_PORTFOLIO],
        p.id
      );
      await saveSettings({ portfolios, defaultPortfolioId });
      setSettings({ ...settings, portfolios, defaultPortfolioId });
    } catch (e) {
      console.error('Errore impostazione default:', e);
      setNotice('Impossibile impostare come predefinito. Riprova.');
    } finally {
      setSaving(false);
    }
  };

  const movePortfolio = async (index: number, delta: -1 | 1) => {
    if (!settings || saving) return;
    const reordered = reorderPortfoliosList(settings.portfolios || [DEFAULT_PORTFOLIO], index, delta);
    setNotice(null);
    setSaving(true);
    try {
      await saveSettings({ portfolios: reordered });
      setSettings({ ...settings, portfolios: reordered });
    } catch (e) {
      console.error('Errore riordino portafogli:', e);
      setNotice('Ordine non salvato. Riprova.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (portfolio: Portfolio) => {
    if (!settings || !userId || saving) return;
    setNotice(null);

    const validation = validatePortfolioDeletion(
      settings.portfolios || [DEFAULT_PORTFOLIO],
      portfolio.id,
      settings.defaultPortfolioId
    );

    if (!validation.canDelete) {
      setNotice(validation.reason || 'Impossibile eliminare il portafoglio.');
      return;
    }

    const defaultId = validation.targetDefaultId!;
    const portfolios = settings.portfolios || [DEFAULT_PORTFOLIO];

    setSaving(true);
    const updates: TxUpdate[] = [];
    let countInPortfolio = 0;

    try {
      const snapshot = await getDocs(query(collection(db, 'portfolios', userId, 'transactions')));
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const pid = data.portfolioId || DEFAULT_PORTFOLIO_ID;
        if (pid === portfolio.id) {
          countInPortfolio++;
          updates.push({
            ref: docSnap.ref,
            data: { portfolioId: defaultId }
          });
        }
      });
    } catch (err) {
      console.warn(err);
      setNotice('Errore nel conteggio delle transazioni. Riprova.');
      setSaving(false);
      return;
    }
    setSaving(false);

    const targetPortfolio = portfolios.find(p => p.id === defaultId) || DEFAULT_PORTFOLIO;
    const lines: string[] = [];
    if (countInPortfolio === 0) {
      lines.push(`Il portafoglio "${portfolio.name}" non contiene alcuna transazione.`);
    } else {
      lines.push(
        `${countInPortfolio} ${plural(countInPortfolio, 'transazione passerà', 'transazioni passeranno')} al portafoglio predefinito "${targetPortfolio.name}".`
      );
      lines.push('Nessuna transazione viene eliminata.');
    }

    confirmAction(
      'Elimina portafoglio',
      lines.join('\n'),
      'Elimina',
      async () => {
        setSaving(true);
        try {
          const remainingPortfolios = cleanPortfolios(portfolios.filter(p => p.id !== portfolio.id));
          // 1. Sposta prima le transazioni
          if (updates.length > 0) {
            await commitTxUpdates(updates);
          }
          // 2. Poi aggiorna le preferenze
          await saveSettings({ portfolios: remainingPortfolios });
          setSettings({ ...settings, portfolios: remainingPortfolios });

          // Aggiorna conteggi locali
          setTxCounts(prev => {
            const next = { ...prev };
            delete next[portfolio.id];
            if (next[defaultId]) {
              next[defaultId].count += countInPortfolio;
            } else {
              next[defaultId] = { count: countInPortfolio, symbols: 0 };
            }
            return next;
          });
        } catch (e) {
          console.error('Errore eliminazione portafoglio:', e);
          setNotice('Portafoglio non eliminato. Riprova.');
        } finally {
          setSaving(false);
        }
      },
      true
    );
  };

  const renderContent = () => {
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
          <Text style={styles.description} role="alert">Portafogli non disponibili. Riprova.</Text>
          <TouchableOpacity style={styles.retryButton} onPress={retryLoad} accessibilityRole="button">
            <Text style={styles.retryText}>Riprova</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const portfolios = settings.portfolios || [DEFAULT_PORTFOLIO];
    const defaultId = settings.defaultPortfolioId || DEFAULT_PORTFOLIO_ID;
    const addDisabled = !newPortfolioName.trim() || saving;

    return (
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.description}>
          Organizza le tue transazioni in portafogli distinti (es. Personale, Pensione, Cripto). Puoi visualizzare il patrimonio aggregato oppure filtrare per singolo portafoglio.
        </Text>

        {notice && (
          <View style={styles.noticeBox} accessibilityRole="alert">
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        )}

        {/* Form nuovo portafoglio */}
        <View style={styles.addCard}>
          <Text style={styles.cardTitle}>Nuovo portafoglio</Text>
          <TextInput
            style={styles.input}
            placeholder="Nome (es. Fondo Pensione, Trading)"
            placeholderTextColor={colors.textSecondary}
            value={newPortfolioName}
            onChangeText={setNewPortfolioName}
            maxLength={MAX_NAME_LENGTH}
            accessibilityLabel="Nome del nuovo portafoglio"
          />
          <TextInput
            style={[styles.input, { marginTop: 8 }]}
            placeholder="Descrizione o note (facoltativa)"
            placeholderTextColor={colors.textSecondary}
            value={newPortfolioDesc}
            onChangeText={setNewPortfolioDesc}
            maxLength={100}
            accessibilityLabel="Descrizione del nuovo portafoglio"
          />
          <TouchableOpacity
            style={[styles.addButton, addDisabled && styles.buttonDisabled]}
            disabled={addDisabled}
            onPress={handleAddNew}
            accessibilityRole="button"
            aria-busy={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color={colors.onAccent} />
            ) : (
              <>
                <Plus size={18} color={colors.onAccent} style={{ marginRight: 6 }} />
                <Text style={styles.addButtonText}>
                  Aggiungi portafoglio
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Elenco portafogli */}
        <Text style={styles.sectionHeader}>I tuoi portafogli ({portfolios.length})</Text>

        {portfolios.map((p, index) => {
          const isDefault = p.id === defaultId || (!settings.defaultPortfolioId && p.id === DEFAULT_PORTFOLIO_ID);
          const isEditing = editingId === p.id;
          const stats = txCounts[p.id] || { count: 0, symbols: 0 };
          const canDelete = portfolios.length > 1 && !isDefault;

          if (isEditing) {
            return (
              <View key={p.id} style={styles.editCard}>
                <Text style={styles.editCardTitle}>Modifica portafoglio</Text>
                <TextInput
                  style={styles.input}
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Nome portafoglio"
                  placeholderTextColor={colors.textSecondary}
                  maxLength={MAX_NAME_LENGTH}
                  autoFocus
                />
                <TextInput
                  style={[styles.input, { marginTop: 8 }]}
                  value={editDesc}
                  onChangeText={setEditDesc}
                  placeholder="Descrizione (facoltativa)"
                  placeholderTextColor={colors.textSecondary}
                  maxLength={100}
                />
                <View style={styles.editActions}>
                  <TouchableOpacity
                    style={styles.cancelEditBtn}
                    onPress={handleCancelEdit}
                    accessibilityRole="button"
                  >
                    <X size={16} color={colors.text} style={{ marginRight: 4 }} />
                    <Text style={styles.cancelEditBtnText}>Annulla</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.saveEditBtn, !editName.trim() && styles.buttonDisabled]}
                    disabled={!editName.trim() || saving}
                    onPress={() => handleSaveEdit(p.id)}
                    accessibilityRole="button"
                  >
                    <Check size={16} color={colors.onAccent} style={{ marginRight: 4 }} />
                    <Text style={styles.saveEditBtnText}>Salva</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }

          return (
            <View key={p.id} testID={`portfolio-card-${p.name}`} style={styles.portfolioCard}>
              <View style={styles.portfolioHeader}>
                <View style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                    <Text testID={`portfolio-name-${p.name}`} style={styles.portfolioName} numberOfLines={1}>{p.name}</Text>
                    {isDefault && (
                      <View style={styles.defaultBadge}>
                        <Star size={11} color={colors.textSecondary} style={{ marginRight: 3 }} />
                        <Text style={styles.defaultBadgeText}>Predefinito</Text>
                      </View>
                    )}
                  </View>
                  {p.description ? (
                    <Text style={styles.portfolioDesc} numberOfLines={2}>{p.description}</Text>
                  ) : null}
                  <Text style={styles.portfolioStats}>
                    {stats.count} {plural(stats.count, 'transazione', 'transazioni')}
                    {stats.symbols > 0 ? ` · ${stats.symbols} ${plural(stats.symbols, 'titolo', 'titoli')}` : ''}
                  </Text>
                </View>

                {/* Pulsanti riordino */}
                <View style={styles.reorderCol}>
                  <TouchableOpacity
                    style={[styles.iconBtn, index === 0 && styles.iconBtnDisabled]}
                    disabled={index === 0 || saving}
                    onPress={() => movePortfolio(index, -1)}
                    accessibilityLabel={`Sposta ${p.name} in su`}
                  >
                    <ChevronUp size={18} color={index === 0 ? colors.inputBorder : colors.text} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.iconBtn, index === portfolios.length - 1 && styles.iconBtnDisabled]}
                    disabled={index === portfolios.length - 1 || saving}
                    onPress={() => movePortfolio(index, 1)}
                    accessibilityLabel={`Sposta ${p.name} in giù`}
                  >
                    <ChevronDown size={18} color={index === portfolios.length - 1 ? colors.inputBorder : colors.text} />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.portfolioFooter}>
                {!isDefault && (
                  <TouchableOpacity
                    style={styles.setDefaultBtn}
                    onPress={() => handleSetDefault(p)}
                    disabled={saving}
                    accessibilityRole="button"
                  >
                    <Star size={14} color={colors.textSecondary} style={{ marginRight: 4 }} />
                    <Text style={styles.setDefaultText}>Imposta predefinito</Text>
                  </TouchableOpacity>
                )}
                <View style={{ flex: 1 }} />
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => handleStartEdit(p)}
                  disabled={saving}
                  accessibilityLabel={`Modifica ${p.name}`}
                >
                  <Edit2 size={16} color={colors.text} />
                </TouchableOpacity>
                {canDelete && (
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.deleteBtn]}
                    onPress={() => handleDelete(p)}
                    disabled={saving}
                    accessibilityLabel={`Elimina ${p.name}`}
                  >
                    <Trash2 size={16} color={colors.negative} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          accessibilityRole="button"
          accessibilityLabel="Torna indietro"
        >
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} accessibilityRole="header">Gestisci portafogli</Text>
        <View style={{ width: 44 }} />
      </View>
      {renderContent()}
    </SafeAreaView>
  );
};

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      minHeight: 56,
      paddingTop: 16,
      paddingBottom: 8,
      backgroundColor: colors.background,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    backButton: {
      width: 44,
      height: 44,
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
    },
    content: {
      padding: 16,
      paddingBottom: 40,
    },
    description: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.textSecondary,
      marginBottom: 16,
    },
    noticeBox: {
      backgroundColor: colors.negativeSurface,
      borderWidth: 1,
      borderColor: colors.negative,
      borderRadius: 8,
      padding: 12,
      marginBottom: 16,
    },
    noticeText: {
      color: colors.negative,
      fontSize: 13,
      lineHeight: 18,
    },
    addCard: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 16,
      marginBottom: 24,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 12,
    },
    input: {
      height: 46,
      backgroundColor: colors.inputBackground,
      borderRadius: 8,
      paddingHorizontal: 14,
      fontSize: 15,
      color: colors.text,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    addButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.positive,
      height: 46,
      borderRadius: 23,
      marginTop: 14,
    },
    addButtonText: {
      color: colors.onAccent,
      fontSize: 15,
      fontWeight: '600',
    },
    buttonDisabled: {
      opacity: 0.45,
    },
    sectionHeader: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 12,
    },
    portfolioCard: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    portfolioHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
    },
    portfolioName: {
      fontSize: 17,
      fontWeight: '600',
      color: colors.text,
    },
    defaultBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: withAlpha(colors.text, 0.08),
      borderRadius: 4,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    defaultBadgeText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    portfolioDesc: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 3,
    },
    portfolioStats: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 6,
    },
    reorderCol: {
      flexDirection: 'column',
      gap: 4,
    },
    iconBtn: {
      width: 32,
      height: 32,
      borderRadius: 6,
      backgroundColor: colors.inputBackground,
      justifyContent: 'center',
      alignItems: 'center',
    },
    iconBtnDisabled: {
      opacity: 0.35,
    },
    portfolioFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 12,
      paddingTop: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      gap: 8,
    },
    setDefaultBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 6,
      backgroundColor: colors.inputBackground,
    },
    setDefaultText: {
      fontSize: 12,
      color: colors.textSecondary,
      fontWeight: '500',
    },
    actionBtn: {
      width: 34,
      height: 34,
      borderRadius: 8,
      backgroundColor: colors.inputBackground,
      justifyContent: 'center',
      alignItems: 'center',
    },
    deleteBtn: {
      backgroundColor: colors.negativeSurface,
    },
    editCard: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    editCardTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 10,
    },
    editActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      marginTop: 12,
      gap: 10,
    },
    cancelEditBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 6,
      backgroundColor: colors.inputBackground,
    },
    cancelEditBtnText: {
      fontSize: 14,
      color: colors.text,
      fontWeight: '500',
    },
    saveEditBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 6,
      backgroundColor: colors.positive,
    },
    saveEditBtnText: {
      fontSize: 14,
      color: colors.onAccent,
      fontWeight: '600',
    },
    centerContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    retryButton: {
      marginTop: 12,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 8,
    },
    retryText: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '500',
    },
  });

export default ManagePortfoliosScreen;
