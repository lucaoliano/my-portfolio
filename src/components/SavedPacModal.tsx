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
import { ThemeColors } from '../theme/colors';
import { useAppTheme } from '../theme/ThemeContext';
import { formatNumber } from '../utils/formatters';
import { PacParams, PacYearData, generatePacCsv } from '../utils/pacCalculator';

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
    const trimmedName = newSimName.trim() || `Piano ${currentParams.years} anni (${currentParams.periodicAmount}€/m)`;
    
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
      showToast(`Piano "${trimmedName}" sovrascritto con successo!`);
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
      showToast(`Piano "${trimmedName}" salvato con successo!`);
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
      showToast(`Piano "${item.name}" aggiornato con i dati attuali!`);
    } catch (e) {
      console.error('Error overwriting simulation:', e);
    }
  };

  const handleDelete = async (id: string) => {
    const updated = savedList.filter((s) => s.id !== id);
    setSavedList(updated);
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
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
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
        Alert.alert('CSV Copiato!', 'La tabella dei dati è stata copiata negli appunti in formato CSV.');
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
            <Text style={styles.modalTitle}>Piani & Simulazioni Salvate</Text>
            <TouchableOpacity onPress={handleClose} style={{ padding: 4 }}>
              <X size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* Toast Notification */}
          {successMsg && (
            <View style={styles.toastCard}>
              <Check size={16} color="#00D166" style={{ marginRight: 6 }} />
              <Text style={styles.toastText}>{successMsg}</Text>
            </View>
          )}

          {/* Quick Actions */}
          <View style={styles.actionBtnRow}>
            <TouchableOpacity
              style={styles.saveNewBtn}
              onPress={() => setIsSaving(!isSaving)}
            >
              <Plus size={18} color="#FFF" style={{ marginRight: 6 }} />
              <Text style={styles.saveNewBtnText}>Salva Simulazione Attuale</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.csvBtn} onPress={handleExportCsv}>
              {copied ? <Check size={18} color="#00D166" style={{ marginRight: 6 }} /> : <Download size={18} color={colors.text} style={{ marginRight: 6 }} />}
              <Text style={styles.csvBtnText}>{copied ? 'Copiato!' : 'Esporta CSV'}</Text>
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
              />
              {isNameExisting && (
                <View style={styles.existingNameWarning}>
                  <AlertCircle size={14} color="#F59E0B" style={{ marginRight: 4 }} />
                  <Text style={styles.existingNameWarningText}>
                    Esiste già un piano con questo nome: verrà sovrascritto.
                  </Text>
                </View>
              )}
              <View style={styles.saveActionButtons}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsSaving(false)}>
                  <Text style={styles.cancelBtnText}>Annulla</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.confirmSaveBtn} onPress={handleSave}>
                  <Text style={styles.confirmSaveBtnText}>
                    {isNameExisting ? 'Conferma Sovrascrittura' : 'Conferma Salvataggio'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* List of Saved Plans */}
          <Text style={styles.listSectionTitle}>Piani Salvati ({savedList.length})</Text>

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

                return (
                  <View style={[styles.savedCard, isOverwriting && styles.savedCardOverwriting]}>
                    <TouchableOpacity
                      style={{ flex: 1 }}
                      onPress={() => {
                        onLoadSimulation(item.params);
                        handleClose();
                      }}
                    >
                      <View style={styles.nameRow}>
                        <Text style={styles.savedName}>{item.name}</Text>
                        <Text style={styles.savedDate}>{item.createdAt}</Text>
                      </View>
                      <Text style={styles.savedDetails}>
                        {item.params.years} anni • {item.params.periodicAmount}€/m • {item.params.expectedAnnualReturn}%
                        {item.params.startingAge ? ` • Partenza ${item.params.startingAge}a` : ''}
                      </Text>
                      <Text style={styles.savedFinal}>
                        Capitale stimato: <Text style={{ color: '#00D166', fontWeight: 'bold' }}>€ {formatNumber(item.finalBalance)}</Text>
                      </Text>
                    </TouchableOpacity>

                    {/* Action buttons (Overwrite & Delete) */}
                    <View style={styles.itemActionGroup}>
                      <TouchableOpacity
                        style={[styles.actionIconBtn, { backgroundColor: 'rgba(59, 130, 246, 0.12)' }]}
                        onPress={() => setOverwritingId(isOverwriting ? null : item.id)}
                        accessibilityLabel="Sovrascrivi"
                      >
                        <RefreshCw size={17} color="#3B82F6" />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.actionIconBtn, { backgroundColor: 'rgba(239, 68, 68, 0.12)' }]}
                        onPress={() => handleDelete(item.id)}
                        accessibilityLabel="Elimina"
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
                          Nuovi valori: {currentParams.years} anni, €{currentParams.periodicAmount}/m, {currentParams.expectedAnnualReturn}% (Capitale: €{formatNumber(currentFinalBalance)})
                        </Text>
                        <View style={styles.overwriteActionRow}>
                          <TouchableOpacity
                            style={styles.overwriteCancelBtn}
                            onPress={() => setOverwritingId(null)}
                          >
                            <Text style={styles.overwriteCancelText}>Annulla</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.overwriteConfirmBtn}
                            onPress={() => handleConfirmOverwrite(item)}
                          >
                            <RefreshCw size={14} color="#FFF" style={{ marginRight: 5 }} />
                            <Text style={styles.overwriteConfirmText}>Sovrascrivi</Text>
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
      backgroundColor: 'rgba(0,0,0,0.6)',
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
    },
    toastCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(0, 209, 102, 0.12)',
      borderWidth: 1,
      borderColor: '#00D166',
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
      backgroundColor: '#004481',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      borderRadius: 10,
    },
    saveNewBtnText: {
      color: '#FFF',
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
      color: '#F59E0B',
      fontSize: 11,
    },
    saveActionButtons: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 10,
    },
    cancelBtn: {
      paddingVertical: 8,
      paddingHorizontal: 14,
    },
    cancelBtnText: {
      color: colors.textSecondary,
      fontSize: 13,
    },
    confirmSaveBtn: {
      backgroundColor: colors.positive,
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 8,
    },
    confirmSaveBtnText: {
      color: '#000',
      fontSize: 13,
      fontWeight: 'bold',
    },
    listSectionTitle: {
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: 'bold',
      textTransform: 'uppercase',
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
      borderColor: '#3B82F6',
      backgroundColor: 'rgba(59, 130, 246, 0.05)',
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
      fontSize: 10,
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
      width: 34,
      height: 34,
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
      borderColor: '#3B82F6',
    },
    overwritePromptTitle: {
      color: colors.text,
      fontSize: 12,
      fontWeight: 'bold',
      marginBottom: 3,
    },
    overwritePromptSub: {
      color: colors.textSecondary,
      fontSize: 11,
      marginBottom: 8,
    },
    overwriteActionRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 8,
    },
    overwriteCancelBtn: {
      paddingVertical: 6,
      paddingHorizontal: 12,
    },
    overwriteCancelText: {
      color: colors.textSecondary,
      fontSize: 12,
    },
    overwriteConfirmBtn: {
      backgroundColor: '#3B82F6',
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 6,
    },
    overwriteConfirmText: {
      color: '#FFFFFF',
      fontSize: 12,
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
