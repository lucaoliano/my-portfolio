import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  FlatList,
  Alert,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { X, Trash2, Download, Plus, Check, FileText, RefreshCw, AlertCircle } from 'lucide-react-native';
import { ThemeColors, withAlpha } from '../theme/colors';
import { radii, continuousCurve } from '../theme/radius';
import { useAppTheme } from '../theme/ThemeContext';
import { formatNumber, formatDecimal } from '../utils/formatters';
import { PacParams, PacYearData, generatePacCsv, CSV_BOM, ContributionFrequency } from '../utils/pacCalculator';

const PERIOD_LABEL: Record<ContributionFrequency, string> = {
  monthly: 'mese',
  bimonthly: 'bimestre',
  quarterly: 'trimestre',
  semiannually: 'semestre',
  annually: 'anno',
};

const pct = (value: number) => `${formatDecimal(value, Number.isInteger(value) ? 0 : 1)}%`;

export interface SavedSimulation {
  id: string;
  name: string;
  createdAt: string;
  params: PacParams;
  finalBalance: number;
}

interface SavedPacModalProps {
  visible: boolean;
  onClose: () => void;
  currentParams: PacParams;
  currentFinalBalance: number;
  currentYearlyData: PacYearData[];
  onLoadSimulation: (params: PacParams) => void;
}

const STORAGE_KEY = 'saved_pac_simulations_v1';

export const SavedPacModal: React.FC<SavedPacModalProps> = ({
  visible,
  onClose,
  currentParams,
  currentFinalBalance,
  currentYearlyData,
  onLoadSimulation,
}) => {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);

  const [savedList, setSavedList] = useState<SavedSimulation[]>([]);
  const [newSimName, setNewSimName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [overwritingId, setOverwritingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    if (visible) {
      AsyncStorage.getItem(STORAGE_KEY)
        .then((json) => {
          if (isMounted && json) {
            const parsed = JSON.parse(json);
            if (Array.isArray(parsed)) {
              setSavedList(parsed);
            }
          }
        })
        .catch((e) => {
          console.error('Error loading saved simulations:', e);
        });
    }
    return () => {
      isMounted = false;
    };
  }, [visible]);

  const handleClose = () => {
    setIsSaving(false);
    setNewSimName('');
    setCopied(false);
    setOverwritingId(null);
    setDeletingId(null);
    setSuccessMsg(null);
    onClose();
  };

  const showToast = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => {
      setSuccessMsg(null);
    }, 3500);
  };

  const handleSave = async () => {
    const trimmedName =
      newSimName.trim() ||
      `Piano ${currentParams.years} anni (€${formatNumber(currentParams.periodicAmount)} / ${PERIOD_LABEL[currentParams.frequency] ?? 'mese'})`;
    
    // Check if name already exists
    const existingIndex = savedList.findIndex((s) => s.name.toLowerCase() === trimmedName.toLowerCase());

    let updated: SavedSimulation[];

    if (existingIndex >= 0) {
      // Overwrite existing by name
      updated = savedList.map((s, idx) => {
        if (idx === existingIndex) {
          return {
            ...s,
            name: trimmedName,
            createdAt: `${new Date().toLocaleDateString()} (aggiornato)`,
            params: currentParams,
            finalBalance: currentFinalBalance,
          };
        }
        return s;
      });
      showToast(`Piano "${trimmedName}" sovrascritto.`);
    } else {
      // Create new
      const newEntry: SavedSimulation = {
        id: Date.now().toString(),
        name: trimmedName,
        createdAt: new Date().toLocaleDateString(),
        params: currentParams,
        finalBalance: currentFinalBalance,
      };
      updated = [newEntry, ...savedList];
      showToast(`Piano "${trimmedName}" salvato.`);
    }

    setSavedList(updated);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      setIsSaving(false);
      setNewSimName('');
    } catch (e) {
      console.error('Error saving simulation:', e);
    }
  };

  const handleConfirmOverwrite = async (item: SavedSimulation) => {
    const updated = savedList.map((s) => {
      if (s.id === item.id) {
        return {
          ...s,
          createdAt: `${new Date().toLocaleDateString()} (aggiornato)`,
          params: currentParams,
          finalBalance: currentFinalBalance,
        };
      }
      return s;
    });

    setSavedList(updated);
    setOverwritingId(null);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      showToast(`Piano "${item.name}" aggiornato con i dati attuali.`);
    } catch (e) {
      console.error('Error overwriting simulation:', e);
    }
  };

  const handleDelete = async (id: string) => {
    const updated = savedList.filter((s) => s.id !== id);
    setSavedList(updated);
    setDeletingId(null);
    if (overwritingId === id) setOverwritingId(null);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('Error deleting simulation:', e);
    }
  };

  const handleExportCsv = async () => {
    try {
      const csv = generatePacCsv(currentYearlyData);
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        // BOM: Excel riconosce l'UTF-8 (accenti, simbolo €) e il separatore ';'
        const blob = new Blob([CSV_BOM + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `simulazione_pac_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        await Clipboard.setStringAsync(csv);
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
        Alert.alert('CSV copiato', 'La tabella anno per anno è stata copiata negli appunti in formato CSV.');
      }
    } catch (e) {
      console.error('Export CSV error:', e);
    }
  };

  const isNameExisting = newSimName.trim().length > 0 &&
    savedList.some((s) => s.name.toLowerCase() === newSimName.trim().toLowerCase());

  return (
    <Modal visible={visible} transparent={true} animationType="slide" onRequestClose={handleClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.headerRow}>
            <Text style={styles.modalTitle} role="heading">Piani e simulazioni salvate</Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn} role="button" aria-label="Chiudi">
              <X size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* Toast Notification */}
          {successMsg && (
            <View style={styles.toastCard}>
              <Check size={16} color={colors.positive} style={{ marginRight: 6 }} />
              <Text style={styles.toastText}>{successMsg}</Text>
            </View>
          )}

          {/* Quick Actions */}
          <View style={styles.actionBtnRow}>
            <TouchableOpacity
              style={styles.saveNewBtn}
              onPress={() => setIsSaving(!isSaving)}
              role="button"
              aria-expanded={isSaving}
            >
              <Plus size={18} color={colors.onStrong} style={{ marginRight: 6 }} />
              <Text style={styles.saveNewBtnText}>Salva la simulazione</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.csvBtn} onPress={handleExportCsv} role="button">
              {copied ? <Check size={18} color={colors.positive} style={{ marginRight: 6 }} /> : <Download size={18} color={colors.text} style={{ marginRight: 6 }} />}
              <Text style={styles.csvBtnText}>{copied ? 'Copiato' : 'Esporta CSV'}</Text>
            </TouchableOpacity>
          </View>

          {/* New Save Input Box */}
          {isSaving && (
            <View style={styles.saveInputCard}>
              <Text style={styles.saveInputLabel}>Assegna un nome al piano:</Text>
              <TextInput
                style={styles.saveTextInput}
                placeholder="es. Pensione a 60 anni / Fondo Studio"
                placeholderTextColor={colors.textSecondary}
                value={newSimName}
                onChangeText={setNewSimName}
                autoFocus
                aria-label="Nome del piano"
              />
              {isNameExisting && (
                <View style={styles.existingNameWarning}>
                  <AlertCircle size={14} color={colors.warning} style={{ marginRight: 4 }} />
                  <Text style={styles.existingNameWarningText}>
                    Esiste già un piano con questo nome: verrà sovrascritto.
                  </Text>
                </View>
              )}
              <View style={styles.saveActionButtons}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsSaving(false)} role="button">
                  <Text style={styles.cancelBtnText}>Annulla</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.confirmSaveBtn} onPress={handleSave} role="button">
                  <Text style={styles.confirmSaveBtnText}>
                    {isNameExisting ? 'Sovrascrivi' : 'Salva'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* List of Saved Plans */}
          <Text style={styles.listSectionTitle} role="heading">Piani salvati ({savedList.length})</Text>

          {savedList.length === 0 ? (
            <View style={styles.emptyContainer}>
              <FileText size={36} color={colors.textSecondary} style={{ marginBottom: 8 }} />
              <Text style={styles.emptyText}>Nessun piano salvato</Text>
              <Text style={styles.emptySubtext}>
                Salva diverse strategie di PAC per confrontarle, sovrascriverle o riaprirle in qualsiasi momento.
              </Text>
            </View>
          ) : (
            <FlatList
              data={savedList}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingBottom: 20 }}
              renderItem={({ item }) => {
                const isOverwriting = overwritingId === item.id;
                const isDeleting = deletingId === item.id;

                return (
                  <View style={[styles.savedCard, isOverwriting && styles.savedCardOverwriting, isDeleting && styles.savedCardDeleting]}>
                    <TouchableOpacity
                      style={{ flex: 1 }}
                      onPress={() => {
                        onLoadSimulation(item.params);
                        handleClose();
                      }}
                      role="button"
                      aria-label={`Apri il piano ${item.name}`}
                    >
                      <View style={styles.nameRow}>
                        <Text style={styles.savedName}>{item.name}</Text>
                        <Text style={styles.savedDate}>{item.createdAt}</Text>
                      </View>
                      <Text style={styles.savedDetails}>
                        {item.params.years} anni · €{formatNumber(item.params.periodicAmount)} / {PERIOD_LABEL[item.params.frequency] ?? 'mese'} · {pct(item.params.expectedAnnualReturn)}
                        {item.params.startingAge ? ` · da ${item.params.startingAge} anni` : ''}
                      </Text>
                      <Text style={styles.savedFinal}>
                        Capitale stimato a fine accumulo: <Text style={{ fontWeight: 'bold' }}>€{formatNumber(item.finalBalance)}</Text>
                      </Text>
                    </TouchableOpacity>

                    {/* Action buttons (Overwrite & Delete) */}
                    <View style={styles.itemActionGroup}>
                      <TouchableOpacity
                        style={[styles.actionIconBtn, { backgroundColor: withAlpha(colors.info, 0.12) }]}
                        onPress={() => {
                          setDeletingId(null);
                          setOverwritingId(isOverwriting ? null : item.id);
                        }}
                        role="button"
                        aria-label={`Sovrascrivi ${item.name}`}
                        aria-expanded={isOverwriting}
                      >
                        <RefreshCw size={17} color={colors.info} />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.actionIconBtn, { backgroundColor: withAlpha(colors.negative, 0.12) }]}
                        onPress={() => {
                          setOverwritingId(null);
                          setDeletingId(isDeleting ? null : item.id);
                        }}
                        role="button"
                        aria-label={`Elimina ${item.name}`}
                        aria-expanded={isDeleting}
                      >
                        <Trash2 size={17} color={colors.negative} />
                      </TouchableOpacity>
                    </View>

                    {/* Inline Overwrite Confirmation Box */}
                    {isOverwriting && (
                      <View style={styles.overwritePromptBox}>
                        <Text style={styles.overwritePromptTitle}>
                          Vuoi sovrascrivere questo piano con i parametri attuali della simulazione?
                        </Text>
                        <Text style={styles.overwritePromptSub}>
                          Nuovi valori: {currentParams.years} anni, €{formatNumber(currentParams.periodicAmount)} / {PERIOD_LABEL[currentParams.frequency] ?? 'mese'}, {pct(currentParams.expectedAnnualReturn)} (capitale stimato €{formatNumber(currentFinalBalance)})
                        </Text>
                        <View style={styles.overwriteActionRow}>
                          <TouchableOpacity
                            style={styles.overwriteCancelBtn}
                            onPress={() => setOverwritingId(null)}
                            role="button"
                          >
                            <Text style={styles.overwriteCancelText}>Annulla</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.overwriteConfirmBtn}
                            onPress={() => handleConfirmOverwrite(item)}
                            role="button"
                          >
                            <RefreshCw size={14} color={colors.onStrong} style={{ marginRight: 5 }} />
                            <Text style={styles.overwriteConfirmText}>Sovrascrivi</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}

                    {/* Inline Delete Confirmation Box */}
                    {isDeleting && (
                      <View style={styles.deletePromptBox}>
                        <Text style={styles.overwritePromptTitle}>
                          Eliminare il piano &quot;{item.name}&quot;? L&apos;operazione non si può annullare.
                        </Text>
                        <View style={styles.overwriteActionRow}>
                          <TouchableOpacity
                            style={styles.overwriteCancelBtn}
                            onPress={() => setDeletingId(null)}
                            role="button"
                          >
                            <Text style={styles.overwriteCancelText}>Annulla</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.deleteConfirmBtn}
                            onPress={() => handleDelete(item.id)}
                            role="button"
                          >
                            <Trash2 size={14} color={colors.negative} style={{ marginRight: 5 }} />
                            <Text style={styles.deleteConfirmText}>Elimina</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </View>
                );
              }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
};

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    modalOverlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 20,
      maxHeight: '85%',
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 14,
    },
    modalTitle: {
      color: colors.text,
      fontSize: 18,
      fontWeight: 'bold',
      flexShrink: 1,
    },
    closeBtn: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: -10,
    },
    toastCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: withAlpha(colors.positive, 0.12),
      borderWidth: 1,
      borderColor: colors.positive,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      marginBottom: 12,
    },
    toastText: {
      color: colors.text,
      fontSize: 12,
      fontWeight: '600',
    },
    actionBtnRow: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 16,
    },
    saveNewBtn: {
      flex: 1.2,
      backgroundColor: colors.positive,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      minHeight: 44,
      borderRadius: radii.sm,
      ...continuousCurve,
    },
    saveNewBtnText: {
      color: colors.onAccent,
      fontSize: 13,
      fontWeight: 'bold',
    },
    csvBtn: {
      flex: 0.9,
      backgroundColor: colors.inputBackground,
      borderWidth: 1,
      borderColor: colors.border,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      minHeight: 44,
      borderRadius: 10,
    },
    csvBtnText: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '600',
    },
    saveInputCard: {
      backgroundColor: colors.inputBackground,
      padding: 14,
      borderRadius: 12,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    saveInputLabel: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '600',
      marginBottom: 8,
    },
    saveTextInput: {
      backgroundColor: colors.card,
      color: colors.text,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 8,
    },
    existingNameWarning: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 10,
    },
    existingNameWarningText: {
      color: colors.warning,
      fontSize: 12,
      flexShrink: 1,
    },
    saveActionButtons: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 10,
    },
    cancelBtn: {
      paddingHorizontal: 14,
      minHeight: 44,
      justifyContent: 'center',
    },
    cancelBtnText: {
      color: colors.textSecondary,
      fontSize: 13,
    },
    confirmSaveBtn: {
      backgroundColor: colors.positive,
      paddingHorizontal: 16,
      minHeight: 44,
      justifyContent: 'center',
      borderRadius: 8,
    },
    confirmSaveBtnText: {
      color: colors.onAccent,
      fontSize: 13,
      fontWeight: 'bold',
    },
    listSectionTitle: {
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: 'bold',
      marginBottom: 10,
    },
    savedCard: {
      backgroundColor: colors.inputBackground,
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    savedCardOverwriting: {
      borderColor: colors.info,
      backgroundColor: withAlpha(colors.info, 0.05),
    },
    savedCardDeleting: {
      borderColor: colors.negative,
    },
    nameRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
      paddingRight: 8,
    },
    savedName: {
      color: colors.text,
      fontSize: 15,
      fontWeight: 'bold',
    },
    savedDate: {
      color: colors.textSecondary,
      fontSize: 12,
    },
    savedDetails: {
      color: colors.textSecondary,
      fontSize: 12,
      marginBottom: 4,
    },
    savedFinal: {
      color: colors.text,
      fontSize: 13,
    },
    itemActionGroup: {
      flexDirection: 'row',
      gap: 6,
      marginLeft: 8,
    },
    actionIconBtn: {
      width: 44,
      height: 44,
      borderRadius: 8,
      justifyContent: 'center',
      alignItems: 'center',
    },
    overwritePromptBox: {
      width: '100%',
      backgroundColor: colors.card,
      borderRadius: 8,
      padding: 10,
      marginTop: 10,
      borderWidth: 1,
      borderColor: colors.info,
    },
    overwritePromptTitle: {
      color: colors.text,
      fontSize: 12,
      fontWeight: 'bold',
      marginBottom: 3,
    },
    overwritePromptSub: {
      color: colors.textSecondary,
      fontSize: 12,
      marginBottom: 8,
    },
    deletePromptBox: {
      width: '100%',
      backgroundColor: colors.card,
      borderRadius: 8,
      padding: 10,
      marginTop: 10,
      borderWidth: 1,
      borderColor: colors.negative,
    },
    deleteConfirmBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      minHeight: 44,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: colors.negative,
      backgroundColor: 'transparent',
    },
    deleteConfirmText: {
      color: colors.negative,
      fontSize: 13,
      fontWeight: 'bold',
    },
    overwriteActionRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 8,
    },
    overwriteCancelBtn: {
      paddingHorizontal: 12,
      minHeight: 44,
      justifyContent: 'center',
    },
    overwriteCancelText: {
      color: colors.textSecondary,
      fontSize: 13,
    },
    overwriteConfirmBtn: {
      backgroundColor: colors.positive,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      minHeight: 44,
      borderRadius: radii.xs,
      ...continuousCurve,
    },
    overwriteConfirmText: {
      color: colors.onAccent,
      fontSize: 13,
      fontWeight: 'bold',
    },
    emptyContainer: {
      alignItems: 'center',
      paddingVertical: 32,
    },
    emptyText: {
      color: colors.text,
      fontSize: 15,
      fontWeight: 'bold',
      marginBottom: 4,
    },
    emptySubtext: {
      color: colors.textSecondary,
      fontSize: 12,
      textAlign: 'center',
      paddingHorizontal: 20,
    },
  });
