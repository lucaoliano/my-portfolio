import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Copy, Check, Plus, Trash2, AlertCircle } from 'lucide-react-native';
import { ScreenHeader } from './ScreenHeader';
import * as Clipboard from 'expo-clipboard';
import { addDoc, collection, deleteDoc, doc, getDoc, updateDoc } from 'firebase/firestore';

import { useAppTheme } from '../theme/ThemeContext';
import { ThemeColors, withAlpha } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { radii, continuousCurve } from '../theme/radius';
import { Button } from './ui/Button';
import { db, auth } from '../config/firebase';
import { useTransactions } from '../hooks/useTransactions';
import { DEFAULT_PORTFOLIO } from '../hooks/useUserSettings';
import { getHistoricalQuote, HistoricalQuote } from '../services/yahooFinance';
import { formatDate, formatInputNumber, formatNumber, formatQuantity, parseLocalNumber } from '../utils/formatters';
import { Portfolio, Transaction } from '../types';
import { getPortfolioGroups, addPortfolioGroup, cleanPortfolios } from '../utils/portfolioManager';

const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF'];
const ISIN_PATTERN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

/** Data di oggi nel fuso del dispositivo (toISOString darebbe ieri tra mezzanotte e le 2 in Italia) */
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

type FieldKey = 'quantity' | 'price' | 'date' | 'fee' | 'fxRate' | 'groups';
type PriceLookup =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'found'; quote: HistoricalQuote; applied: boolean }
  | { status: 'notfound' }
  | { status: 'error' };

export interface TransactionFormProps {
  mode: 'add' | 'edit';
  symbol: string;
  name: string;
  isin?: string;
  /** Transazione da modificare, letta dal database (non dai parametri di navigazione) */
  initial?: Transaction & { id: string };
  preselectedGroups?: string[];
  preselectedPortfolioId?: string;
  fromSearch?: boolean;
}

const confirmAction = (title: string, message: string, confirmLabel: string, onConfirm: () => void, destructive = false) => {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Annulla', style: 'cancel' },
    { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
  ]);
};

/**
 * Inserimento e modifica di una transazione: un solo modulo, così regole e aspetto coincidono.
 * Errori accanto al campo, mai un numero arrotondato in silenzio, mai un prezzo digitato sovrascritto.
 */
export const TransactionForm: React.FC<TransactionFormProps> = ({ mode, symbol, name, isin, initial, preselectedGroups, preselectedPortfolioId, fromSearch }) => {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);
  const router = useRouter();
  const userId = auth.currentUser?.uid;
  const { transactions } = useTransactions(userId);

  const initialDate = initial ? initial.date.slice(0, 10) : todayKey();
  const initialGroups = useMemo(
    () => (initial ? (initial.groups ?? (initial.group ? [initial.group] : ['Generale'])) : (preselectedGroups?.length ? preselectedGroups : ['Generale'])),
    [initial, preselectedGroups]
  );

  const [type, setType] = useState<'BUY' | 'SELL'>(initial?.type === 'SELL' ? 'SELL' : 'BUY');
  const [quantity, setQuantity] = useState(initial ? formatInputNumber(Number(initial.quantity)) : '1');
  const [date, setDate] = useState(initialDate);
  const [price, setPrice] = useState(initial ? formatInputNumber(Number(initial.purchasePrice)) : '');
  const [currency, setCurrency] = useState((initial?.currency || 'EUR').toUpperCase());
  const [fxRate, setFxRate] = useState(initial?.fxRate ? formatInputNumber(initial.fxRate) : '');
  const [fee, setFee] = useState(initial?.fee ? formatInputNumber(initial.fee) : '');
  const [portfolioId, setPortfolioId] = useState<string>(
    initial?.portfolioId || preselectedPortfolioId || 'default'
  );
  const [portfoliosList, setPortfoliosList] = useState<Portfolio[]>([DEFAULT_PORTFOLIO]);
  const [groups, setGroups] = useState<Set<string>>(new Set(initialGroups));
  const [allGroups, setAllGroups] = useState<string[]>(initialGroups);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newGroup, setNewGroup] = useState('');
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [sellWarningAccepted, setSellWarningAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [lookup, setLookup] = useState<PriceLookup>({ status: 'idle' });
  // Cosa ha toccato l'utente: il prezzo automatico non deve mai sovrascriverlo
  const [touched, setTouched] = useState({ price: mode === 'edit', currency: mode === 'edit' && !!initial?.currency, fxRate: !!initial?.fxRate });
  const touchedRef = useRef(touched);
  useEffect(() => { touchedRef.current = touched; }, [touched]);
  const touch = (key: keyof typeof touched) => setTouched(t => (t[key] ? t : { ...t, [key]: true }));
  const lookupId = useRef(0);
  const [dirty, setDirty] = useState(false);

  const isForeign = currency !== 'EUR';
  const isScalable = initial?.source === 'scalable_mcp';
  const currencyOptions = CURRENCIES.includes(currency) ? CURRENCIES : [...CURRENCIES, currency];

  // Gruppi e portafogli esistenti dalle preferenze
  useEffect(() => {
    if (!userId) return;
    getDoc(doc(db, 'portfolios', userId, 'settings', 'preferences'))
      .then(snap => {
        const data = snap.exists() ? snap.data() : {};
        const savedPortfolios = (data.portfolios as Portfolio[] | undefined) ?? [DEFAULT_PORTFOLIO];
        const pList = savedPortfolios.length > 0 ? cleanPortfolios(savedPortfolios) : [DEFAULT_PORTFOLIO];
        setPortfoliosList(pList);

        const activeId = initial?.portfolioId || preselectedPortfolioId || data.defaultPortfolioId || 'default';
        setPortfolioId(activeId);

        const currentPort = pList.find(p => p.id === activeId);
        const pGroups = getPortfolioGroups(currentPort, data.groups as string[] | undefined);
        const mergedAllGroups = Array.from(new Set([...pGroups, ...initialGroups])).sort((a, b) => a.localeCompare(b));
        setAllGroups(mergedAllGroups);

        if (mode === 'add' && !preselectedGroups?.length) {
          const defGroup = currentPort?.defaultGroup || pGroups[0] || 'Generale';
          setGroups(new Set([defGroup]));
        }
      })
      .catch(err => console.error('Errore lettura preferenze:', err));
  }, [userId, initialGroups, initial?.portfolioId, preselectedPortfolioId, mode, preselectedGroups]);

  const handleSelectPortfolio = (newId: string) => {
    markDirty();
    setPortfolioId(newId);
    const targetPort = portfoliosList.find(p => p.id === newId);
    const pGroups = getPortfolioGroups(targetPort);
    setAllGroups(pGroups);

    setGroups(prev => {
      const valid = Array.from(prev).filter(g => pGroups.includes(g));
      if (valid.length > 0) return new Set(valid);
      const defGroup = targetPort?.defaultGroup || pGroups[0] || 'Generale';
      return new Set([defGroup]);
    });
  };

  const applyQuote = useCallback((quote: HistoricalQuote, current: { currency: boolean; fxRate: boolean }) => {
    setPrice(formatInputNumber(quote.price));
    if (quote.currency && !current.currency) setCurrency(quote.currency);
    if (quote.fxRateToEur && quote.currency !== 'EUR' && !current.fxRate) setFxRate(formatInputNumber(quote.fxRateToEur));
    setErrors(e => ({ ...e, price: undefined }));
  }, []);

  const markDirty = () => { if (!dirty) setDirty(true); };

  // Prezzo di chiusura alla data scelta. In inserimento riempie il campo se non l'hai toccato;
  // in modifica lo propone soltanto.
  useEffect(() => {
    if (!symbol || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayKey()) return;
    if (mode === 'edit' && date === initialDate) return;
    const id = ++lookupId.current;
    const timer = setTimeout(async () => {
      setLookup({ status: 'loading' });
      try {
        const quote = await getHistoricalQuote(symbol, date);
        if (id !== lookupId.current) return;
        if (!quote) {
          setLookup({ status: 'notfound' });
          return;
        }
        const apply = mode === 'add' && !touchedRef.current.price;
        if (apply) applyQuote(quote, touchedRef.current);
        setLookup({ status: 'found', quote, applied: apply });
      } catch (err) {
        console.warn('Prezzo storico non disponibile:', err);
        if (id === lookupId.current) setLookup({ status: 'error' });
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [symbol, date, mode, initialDate, applyQuote]);


  // Quote possedute alla data della vendita (escludendo la transazione che stai modificando)
  const heldAtDate = useMemo(() => {
    const key = symbol.toUpperCase();
    return transactions
      .filter(t => t.id !== initial?.id)
      .filter(t => t.symbol.toUpperCase() === key || (t.isin && t.isin.toUpperCase() === key) || (initial?.isin && t.isin === initial.isin))
      .filter(t => t.date.slice(0, 10) <= date)
      .reduce((sum, t) => sum + ((t.type || 'BUY') === 'SELL' ? -1 : 1) * Number(t.quantity), 0);
  }, [transactions, symbol, date, initial]);

  const qtyValue = parseLocalNumber(quantity);
  const priceValue = parseLocalNumber(price);
  const fxValue = parseLocalNumber(fxRate);
  const feeValue = fee.trim() === '' ? 0 : parseLocalNumber(fee);
  const sellsTooMuch = type === 'SELL' && qtyValue > 0 && qtyValue > heldAtDate + 0.000001;

  const validate = () => {
    const next: Partial<Record<FieldKey, string>> = {};
    if (!(qtyValue > 0)) next.quantity = 'Inserisci una quantità maggiore di zero (es. 10 oppure 0,5).';
    if (!(priceValue > 0)) next.price = 'Inserisci il prezzo per quota, maggiore di zero.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(new Date(date).getTime())) next.date = 'Inserisci una data valida.';
    else if (date > todayKey()) next.date = 'La data non può essere nel futuro.';
    if (!(feeValue >= 0)) next.fee = 'Le commissioni devono essere un importo di zero o più.';
    if (isForeign && fxRate.trim() !== '' && !(fxValue > 0)) next.fxRate = 'Il cambio deve essere un numero maggiore di zero.';
    if (groups.size === 0) next.groups = 'Seleziona almeno un gruppo.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const close = () => {
    const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));
    if (!dirty) return leave();
    confirmAction('Uscire senza salvare?', 'Le modifiche andranno perse.', 'Esci', leave, true);
  };

  const handleSave = async () => {
    if (!validate()) return;
    if (sellsTooMuch && !sellWarningAccepted) {
      setSellWarningAccepted(true);
      return;
    }
    if (!userId) return;
    setSaving(true);
    const fields: Partial<Transaction> & Record<string, unknown> = {
      quantity: qtyValue,
      purchasePrice: priceValue,
      type,
      currency,
      portfolioId: portfolioId || 'default',
      groups: Array.from(groups),
      fee: feeValue > 0 ? feeValue : undefined,
      fxRate: isForeign && fxValue > 0 ? fxValue : undefined,
    };
    try {
      if (mode === 'add') {
        // Firestore rifiuta i campi undefined: li togliamo
        const clean = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
        const resolvedIsin = isin && ISIN_PATTERN.test(isin.toUpperCase())
          ? isin.toUpperCase()
          : (ISIN_PATTERN.test(symbol) ? symbol : undefined);
        await addDoc(collection(db, 'portfolios', userId, 'transactions'), {
          ...clean,
          symbol,
          name,
          date,
          ...(resolvedIsin ? { isin: resolvedIsin } : {}),
        });
      } else if (initial) {
        // Solo i campi cambiati: un salvataggio non deve riscrivere ciò che non hai toccato
        const changed: Record<string, unknown> = {};
        if (qtyValue !== Number(initial.quantity)) changed.quantity = qtyValue;
        if (priceValue !== Number(initial.purchasePrice)) changed.purchasePrice = priceValue;
        if (type !== (initial.type || 'BUY')) changed.type = type;
        if (date !== initialDate) changed.date = date;
        if (currency !== (initial.currency || 'EUR').toUpperCase()) changed.currency = currency;
        if ((portfolioId || 'default') !== (initial.portfolioId || 'default')) {
          changed.portfolioId = portfolioId || 'default';
        }
        if ((fields.fee ?? null) !== (initial.fee ?? null)) changed.fee = fields.fee ?? null;
        if ((fields.fxRate ?? null) !== (initial.fxRate ?? null)) changed.fxRate = fields.fxRate ?? null;
        const groupList = Array.from(groups);
        if (groupList.slice().sort().join('|') !== initialGroups.slice().sort().join('|')) {
          changed.groups = groupList;
          changed.group = null;
        }
        if (Object.keys(changed).length > 0) {
          await updateDoc(doc(db, 'portfolios', userId, 'transactions', initial.id), changed);
        }
      }
      if (fromSearch) router.navigate('/');
      else if (router.canGoBack()) router.back();
      else router.replace('/');
    } catch (err) {
      console.error('Errore salvataggio transazione:', err);
      setSaving(false);
      confirmAction('Salvataggio non riuscito', 'Controlla la connessione e riprova.', 'OK', () => {});
    }
  };

  const handleDelete = () => {
    if (!initial || !userId) return;
    const what = `${type === 'SELL' ? 'la vendita' : "l'acquisto"} di ${formatQuantity(qtyValue || Number(initial.quantity))} ${name} del ${formatDate(initialDate)}`;
    confirmAction('Eliminare la transazione?', `Stai per eliminare ${what}. L'operazione non si può annullare.`, 'Elimina', async () => {
      setDeleting(true);
      try {
        await deleteDoc(doc(db, 'portfolios', userId, 'transactions', initial.id));
        if (router.canGoBack()) router.back();
        else router.replace('/');
      } catch (err) {
        console.error('Errore eliminazione transazione:', err);
        setDeleting(false);
        confirmAction('Eliminazione non riuscita', 'Controlla la connessione e riprova.', 'OK', () => {});
      }
    }, true);
  };

  const handleCopy = async () => {
    await Clipboard.setStringAsync(symbol);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const toggleGroup = (group: string) => {
    markDirty();
    setGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
    setErrors(e => ({ ...e, groups: undefined }));
  };

  const createGroup = async () => {
    const value = newGroup.trim();
    if (!value) return;
    // Nessun doppione che differisce solo per maiuscole ("generale" e "Generale")
    const existing = allGroups.find(g => g.toLowerCase() === value.toLowerCase());
    const groupName = existing ?? value;
    if (!existing) {
      const nextGroups = [...allGroups, groupName].sort((a, b) => a.localeCompare(b));
      setAllGroups(nextGroups);
      if (userId) {
        const activePid = portfolioId || 'default';
        const result = addPortfolioGroup(portfoliosList, activePid, groupName);
        if (!result.error) {
          setPortfoliosList(result.portfolios);
          updateDoc(doc(db, 'portfolios', userId, 'settings', 'preferences'), {
            portfolios: result.portfolios,
            groups: Array.from(new Set([...allGroups, groupName])),
          }).catch(err => console.error('Impossibile salvare il nuovo gruppo:', err));
        }
      }
    }
    setGroups(prev => new Set(prev).add(groupName));
    setNewGroup('');
    setNewGroupOpen(false);
    markDirty();
  };

  const total = qtyValue > 0 && priceValue > 0 ? qtyValue * priceValue : null;
  const totalEur = total !== null ? (isForeign ? (fxValue > 0 ? total * fxValue : null) : total) : null;

  const renderLookup = () => {
    switch (lookup.status) {
      case 'loading':
        return <Text style={styles.hint}>Cerco il prezzo di chiusura del {formatDate(date)}…</Text>;
      case 'notfound':
        return <Text style={styles.hint}>Nessun prezzo di chiusura per il {formatDate(date)}: inseriscilo a mano.</Text>;
      case 'error':
        return <Text style={styles.hint}>Prezzo storico non disponibile (servizio non raggiungibile): inseriscilo a mano.</Text>;
      case 'found': {
        const { quote, applied } = lookup;
        const source = `Chiusura del ${formatDate(quote.priceDate || date)} su Yahoo Finance: ${formatNumber(quote.price)} ${quote.currency ?? ''}`.trim();
        if (applied) return <Text style={styles.hint}>{source}. Correggilo con il prezzo effettivo del tuo ordine.</Text>;
        return (
          <View style={styles.suggestionRow}>
            <Text style={[styles.hint, { flex: 1 }]}>{source}.</Text>
            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => { applyQuote(quote, touched); markDirty(); setLookup({ ...lookup, applied: true }); }}
              accessibilityRole="button"
            >
              <Text style={styles.linkButtonText}>Usa questo prezzo</Text>
            </TouchableOpacity>
          </View>
        );
      }
      default:
        return null;
    }
  };

  const field = (key: FieldKey, label: string, value: string, onChange: (v: string) => void, opts: { placeholder?: string; hint?: string; keyboard?: 'decimal-pad' | 'default' } = {}) => (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, errors[key] && styles.inputError]}
        value={value}
        onChangeText={v => { markDirty(); onChange(v); if (errors[key]) setErrors(e => ({ ...e, [key]: undefined })); }}
        keyboardType={opts.keyboard ?? 'decimal-pad'}
        placeholder={opts.placeholder}
        placeholderTextColor={colors.textSecondary}
        accessibilityLabel={label}
        aria-invalid={!!errors[key]}
      />
      {errors[key] ? <Text style={styles.errorText} accessibilityLiveRegion="polite">{errors[key]}</Text> : opts.hint ? <Text style={styles.hint}>{opts.hint}</Text> : null}
    </View>
  );

  const busy = saving || deleting;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScreenHeader
        title={mode === 'add' ? 'Nuova transazione' : 'Modifica transazione'}
        backIcon="close"
        onBack={close}
      />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.assetHeader}>
          <Text style={styles.name} numberOfLines={2}>{name || symbol}</Text>
          <TouchableOpacity style={styles.symbolButton} onPress={handleCopy} accessibilityRole="button" accessibilityLabel={`Copia ${symbol}`}>
            <Text style={styles.symbol}>{copied ? 'Copiato' : symbol}</Text>
            {!copied && <Copy size={14} color={colors.textSecondary} style={{ marginLeft: 6 }} />}
          </TouchableOpacity>
        </View>

        {isScalable && (
          <View style={styles.notice}>
            <AlertCircle size={16} color={colors.scalable} style={{ marginRight: 8, marginTop: 2 }} />
            <Text style={styles.noticeText}>
              Importata da Scalable. Modificala solo per correggere un errore: se cambi quantità o data, la prossima sincronizzazione potrebbe importarla di nuovo come transazione separata.
            </Text>
          </View>
        )}

        <View style={styles.segmented} accessibilityRole="radiogroup" aria-label="Tipo di operazione">
          {(['BUY', 'SELL'] as const).map(t => (
            <TouchableOpacity
              key={t}
              style={[styles.segment, type === t && styles.segmentActive]}
              onPress={() => { markDirty(); setType(t); setSellWarningAccepted(false); }}
              accessibilityRole="radio"
              aria-checked={type === t}
            >
              <Text style={[styles.segmentText, type === t && styles.segmentTextActive]}>{t === 'BUY' ? 'Acquisto' : 'Vendita'}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {field('quantity', 'Quantità', quantity, v => { setQuantity(v); setSellWarningAccepted(false); }, { placeholder: 'es. 10 oppure 0,5' })}
        {sellsTooMuch && (
          <Text style={styles.warningText} accessibilityLiveRegion="polite">
            Alla data scelta risultano {formatQuantity(Math.max(0, heldAtDate))} quote: vendendone di più lo zainetto fiscale non potrà calcolare questa vendita. Controlla gli acquisti registrati.
          </Text>
        )}

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Data</Text>
          {Platform.OS === 'web' ? (
            React.createElement('input', {
              type: 'date',
              value: date,
              max: todayKey(),
              'aria-label': 'Data',
              'aria-invalid': !!errors.date,
              onChange: (e: React.ChangeEvent<HTMLInputElement>) => { markDirty(); setDate(e.target.value); setErrors(er => ({ ...er, date: undefined })); },
              style: {
                backgroundColor: colors.inputBackground,
                border: `1px solid ${errors.date ? colors.negative : colors.border}`,
                borderRadius: 8,
                padding: '0 16px',
                height: 50,
                minHeight: 50,
                color: colors.text,
                fontSize: 16,
                width: '100%',
                boxSizing: 'border-box',
                outline: 'none',
                margin: 0,
                colorScheme: 'inherit',
              },
            })
          ) : (
            <TextInput
              style={[styles.input, errors.date && styles.inputError]}
              value={date}
              onChangeText={v => { markDirty(); setDate(v); }}
              placeholder="AAAA-MM-GG"
              placeholderTextColor={colors.textSecondary}
              accessibilityLabel="Data (anno-mese-giorno)"
            />
          )}
          {errors.date && <Text style={styles.errorText}>{errors.date}</Text>}
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Valuta</Text>
          <View style={styles.chips} accessibilityRole="radiogroup" aria-label="Valuta">
            {currencyOptions.map(c => (
              <TouchableOpacity
                key={c}
                style={[styles.chip, currency === c && styles.chipActive]}
                onPress={() => { touch('currency'); markDirty(); setCurrency(c); }}
                accessibilityRole="radio"
                aria-checked={currency === c}
              >
                <Text style={[styles.chipText, currency === c && styles.chipTextActive]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.inputGroup}>
          <View style={styles.labelRow}>
            <Text style={[styles.label, { marginBottom: 0 }]}>
              {type === 'BUY' ? "Prezzo d'acquisto per quota" : 'Prezzo di vendita per quota'} ({currency})
            </Text>
            {lookup.status === 'loading' && <ActivityIndicator size="small" color={colors.textSecondary} style={{ marginLeft: 8 }} />}
          </View>
          <TextInput
            style={[styles.input, errors.price && styles.inputError]}
            value={price}
            onChangeText={v => { touch('price'); markDirty(); setPrice(v); if (errors.price) setErrors(e => ({ ...e, price: undefined })); }}
            keyboardType="decimal-pad"
            placeholder="es. 150,50"
            placeholderTextColor={colors.textSecondary}
            accessibilityLabel={`Prezzo per quota in ${currency}`}
            aria-invalid={!!errors.price}
          />
          {errors.price ? <Text style={styles.errorText}>{errors.price}</Text> : renderLookup()}
        </View>

        {isForeign && field('fxRate', `Cambio del giorno (€ per 1 ${currency})`, fxRate, v => { touch('fxRate'); setFxRate(v); }, {
          placeholder: 'es. 0,92',
          hint: 'Serve per calcolare lo zainetto fiscale in euro. Lo trovi nella conferma d\'ordine del broker.',
        })}

        {field('fee', 'Commissioni (€, facoltative)', fee, setFee, { placeholder: 'es. 0,99' })}

        {total !== null && (
          <Text style={styles.totalLine}>
            Totale {formatNumber(total)} {currency}
            {isForeign && totalEur !== null ? ` · circa €${formatNumber(totalEur)}` : ''}
            {feeValue > 0 ? ` · più €${formatNumber(feeValue)} di commissioni` : ''}
          </Text>
        )}

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Portafoglio</Text>
          <View style={styles.chips}>
            {portfoliosList.map(p => {
              const selected = (portfolioId || 'default') === p.id;
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.chip, selected && styles.chipActive]}
                  onPress={() => handleSelectPortfolio(p.id)}
                  accessibilityRole="radio"
                  aria-checked={selected}
                >
                  {selected && <Check size={14} color={colors.text} style={{ marginRight: 6 }} />}
                  <Text style={[styles.chipText, selected && styles.chipTextActive]}>{p.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Gruppi</Text>
          <View style={styles.chips}>
            {allGroups.map(g => {
              const selected = groups.has(g);
              return (
                <TouchableOpacity
                  key={g}
                  style={[styles.chip, selected && styles.chipActive]}
                  onPress={() => toggleGroup(g)}
                  accessibilityRole="checkbox"
                  aria-checked={selected}
                >
                  {selected && <Check size={14} color={colors.text} style={{ marginRight: 6 }} />}
                  <Text style={[styles.chipText, selected && styles.chipTextActive]}>{g}</Text>
                </TouchableOpacity>
              );
            })}
            {!newGroupOpen && (
              <TouchableOpacity style={styles.chip} onPress={() => setNewGroupOpen(true)} accessibilityRole="button">
                <Plus size={14} color={colors.textSecondary} style={{ marginRight: 6 }} />
                <Text style={styles.chipText}>Nuovo gruppo</Text>
              </TouchableOpacity>
            )}
          </View>
          {newGroupOpen && (
            <View style={styles.newGroupRow}>
              <TextInput
                style={[styles.input, styles.newGroupInput]}
                value={newGroup}
                onChangeText={setNewGroup}
                placeholder="Nome del gruppo"
                placeholderTextColor={colors.textSecondary}
                accessibilityLabel="Nome del nuovo gruppo"
                autoFocus
                onSubmitEditing={createGroup}
              />
              <TouchableOpacity
                style={[styles.secondaryButton, !newGroup.trim() && { opacity: 0.5 }]}
                onPress={createGroup}
                disabled={!newGroup.trim()}
                accessibilityRole="button"
              >
                <Text style={styles.secondaryButtonText}>Crea</Text>
              </TouchableOpacity>
            </View>
          )}
          {errors.groups && <Text style={styles.errorText}>{errors.groups}</Text>}
        </View>

        {Object.values(errors).some(Boolean) && (
          <Text style={styles.errorSummary} accessibilityRole="alert">Controlla i campi evidenziati.</Text>
        )}

        <Button
          variant="primary"
          size="lg"
          fullWidth
          loading={saving}
          disabled={busy}
          title={sellsTooMuch && sellWarningAccepted ? 'Salva comunque' : mode === 'add' ? 'Aggiungi al portafoglio' : 'Salva modifiche'}
          onPress={handleSave}
          style={{ marginTop: spacing.sm }}
        />

        {mode === 'edit' && (
          <Button
            variant="destructive"
            size="lg"
            fullWidth
            loading={deleting}
            disabled={busy}
            title="Elimina transazione"
            icon={<Trash2 size={18} color={colors.negative} />}
            onPress={handleDelete}
            style={{ marginTop: spacing.xxxl }}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.screenPaddingHorizontal, paddingBottom: spacing.huge },
  assetHeader: { alignItems: 'center', marginTop: spacing.xs, marginBottom: spacing.xl },
  name: { color: colors.text, fontSize: 20, fontWeight: '700', textAlign: 'center' },
  symbolButton: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingHorizontal: spacing.md },
  symbol: { color: colors.textSecondary, fontSize: 15 },
  notice: {
    flexDirection: 'row',
    backgroundColor: colors.scalableSurface,
    borderRadius: radii.md,
    ...continuousCurve,
    padding: spacing.md,
    marginBottom: spacing.xl,
  },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 18, color: colors.text },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.inputBackground,
    borderRadius: radii.sm,
    ...continuousCurve,
    padding: 3,
    marginBottom: spacing.xxl,
  },
  segment: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radii.xs, ...continuousCurve },
  segmentActive: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  segmentText: { color: colors.textSecondary, fontSize: 15, fontWeight: '600' },
  segmentTextActive: { color: colors.text },
  inputGroup: { marginBottom: spacing.xl },
  labelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  label: { color: colors.textSecondary, fontSize: 14, marginBottom: spacing.sm },
  input: {
    backgroundColor: colors.inputBackground,
    borderRadius: radii.sm,
    ...continuousCurve,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    paddingHorizontal: spacing.lg,
    height: 50,
    color: colors.text,
    fontSize: 16,
  },
  inputError: { borderColor: colors.negative },
  hint: { color: colors.textSecondary, fontSize: 13, lineHeight: 18, marginTop: 6 },
  errorText: { color: colors.negative, fontSize: 13, lineHeight: 18, marginTop: 6 },
  warningText: { color: colors.warning, fontSize: 13, lineHeight: 18, marginTop: -12, marginBottom: 20 },
  errorSummary: { color: colors.negative, fontSize: 14, fontWeight: '600', textAlign: 'center', marginBottom: 8 },
  suggestionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  linkButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  linkButtonText: { color: colors.text, fontSize: 13, fontWeight: '700', textDecorationLine: 'underline' },
  totalLine: { color: colors.textSecondary, fontSize: 13, lineHeight: 18, marginTop: -8, marginBottom: 20, fontVariant: ['tabular-nums'] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // Selezione neutra: il verde è riservato a guadagni e conferme
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.card,
  },
  chipActive: { borderColor: colors.text, backgroundColor: withAlpha(colors.text, 0.1) },
  chipText: { color: colors.textSecondary, fontSize: 14, fontWeight: '500' },
  chipTextActive: { color: colors.text, fontWeight: '600' },
  newGroupRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 8 },
  newGroupInput: { flex: 1, minWidth: 0 },
  secondaryButton: {
    height: 50,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryButtonText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  saveButton: {
    backgroundColor: colors.positive,
    borderRadius: 25,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonText: { color: colors.onAccent, fontSize: 16, fontWeight: '600' },
  deleteButton: {
    flexDirection: 'row',
    borderRadius: 25,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 40,
    borderWidth: 1,
    borderColor: colors.negative,
  },
  deleteButtonText: { color: colors.negative, fontSize: 16, fontWeight: '600' },
});
