import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import { useAppTheme } from '../theme/ThemeContext';
import { TransactionForm } from '../components/TransactionForm';
import { Transaction } from '../types';

/**
 * La transazione si legge dal database, non dai parametri di navigazione:
 * così quantità e prezzo arrivano con tutti i decimali, e gruppi, valuta e origine sono aggiornati.
 */
export const EditTransactionScreen = () => {
  const { colors } = useAppTheme();
  const params = useLocalSearchParams<{ id?: string; symbol?: string; name?: string }>();
  const [tx, setTx] = useState<(Transaction & { id: string }) | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const userId = auth.currentUser?.uid;
    if (!userId || !params.id) {
      const t = setTimeout(() => setFailed(true), 0);
      return () => clearTimeout(t);
    }
    getDoc(doc(db, 'portfolios', userId, 'transactions', params.id))
      .then(snap => {
        if (snap.exists()) setTx({ id: snap.id, ...(snap.data() as Transaction) });
        else setFailed(true);
      })
      .catch(err => {
        console.error('Errore lettura transazione:', err);
        setFailed(true);
      });
  }, [params.id]);

  if (!tx) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        {failed ? (
          <Text style={{ color: colors.textSecondary, fontSize: 15, textAlign: 'center' }}>
            Transazione non trovata: potrebbe essere stata eliminata.
          </Text>
        ) : (
          <ActivityIndicator color={colors.textSecondary} />
        )}
      </View>
    );
  }

  return <TransactionForm mode="edit" symbol={tx.symbol || params.symbol || ''} name={params.name || tx.name || tx.symbol} initial={tx} />;
};

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
});

export default EditTransactionScreen;
