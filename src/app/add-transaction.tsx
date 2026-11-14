import { useMemo } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { TransactionForm } from '../components/TransactionForm';

export const AddTransactionScreen = () => {
  const params = useLocalSearchParams<{
    symbol?: string;
    name?: string;
    fromSearch?: string;
    preselectedGroups?: string;
    preselectedPortfolioId?: string;
  }>();
  const preselectedGroups = useMemo(
    () => (params.preselectedGroups ? params.preselectedGroups.split(',').filter(Boolean) : undefined),
    [params.preselectedGroups]
  );
  return (
    <TransactionForm
      mode="add"
      symbol={params.symbol ?? ''}
      name={params.name ?? ''}
      preselectedGroups={preselectedGroups}
      preselectedPortfolioId={params.preselectedPortfolioId}
      fromSearch={params.fromSearch === 'true' || params.fromSearch === '1'}
    />
  );
};

export default AddTransactionScreen;
