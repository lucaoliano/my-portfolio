import { ThemeColors, withAlpha } from '../theme/colors';
import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ChevronLeft,
  ChevronDown,
  Check,
  Sliders,
  Wallet,
  Landmark,
  AlertTriangle,
  Bookmark,
  Target,
  BarChart3,
  Flame,
  Percent,
  TrendingUp,
  Coins,
  Cpu,
  Download,
  CheckCircle2,
} from 'lucide-react-native';

import { useAppTheme } from '../theme/ThemeContext';
import { formatNumber, parseLocalNumber } from '../utils/formatters';
import {
  calculatePAC,
  calculateGoalSeekerPeriodic,
  calculateGoalSeekerYears,
  calculateScenarios,
  calculateMonteCarlo,
  calculateFeeDrag,
  calculateFIRE,
  PacParams,
  ContributionFrequency,
  PacResult,
} from '../utils/pacCalculator';
import { PacGrowthChart } from '../components/PacGrowthChart';
import { PacSlider } from '../components/PacSlider';
import { MonteCarloChart } from '../components/MonteCarloChart';
import { FeeDragComparisonChart } from '../components/FeeDragComparisonChart';
import { SavedPacModal } from '../components/SavedPacModal';

import { auth } from '../config/firebase';
import { useTransactions } from '../hooks/useTransactions';
import { useScalableSavingsPlans } from '../hooks/useScalableSavingsPlans';
import { calculatePacRebalancing } from '../utils/savingsPlansRebalance';
import { calculateFifo } from '../utils/portfolioAggregator';

const FREQUENCIES: { label: string; value: ContributionFrequency }[] = [
  { label: 'Mensile', value: 'monthly' },
  { label: 'Bimestrale', value: 'bimonthly' },
  { label: 'Trimestrale', value: 'quarterly' },
  { label: 'Semestrale', value: 'semiannually' },
  { label: 'Annuale', value: 'annually' },
];

type ActiveTab = 'pac' | 'goal' | 'scenarios' | 'montecarlo' | 'feedrag' | 'fire' | 'scalable_plans';

export default function PacCalculatorScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = getStyles(colors);

  const userId = auth.currentUser?.uid;
  const { transactions } = useTransactions(userId);
  const { plans: scalablePlans, totalMonthlyAmount: scalableTotalMonthly } = useScalableSavingsPlans(userId);

  const currentHoldings = useMemo(() => {
    const holdings: Record<string, { currentTotalValue: number }> = {};
    const symbolTxs: Record<string, typeof transactions> = {};

    transactions.forEach((tx) => {
      if (!symbolTxs[tx.symbol]) symbolTxs[tx.symbol] = [];
      symbolTxs[tx.symbol].push(tx);
    });

    Object.entries(symbolTxs).forEach(([symbol, txList]) => {
      const { totalQuantity, averagePrice } = calculateFifo(txList);
      const val = totalQuantity * averagePrice;
      holdings[symbol] = { currentTotalValue: val };
    });

    return holdings;
  }, [transactions]);

  const rebalanceAnalysis = useMemo(() => {
    return calculatePacRebalancing(scalablePlans, currentHoldings);
  }, [scalablePlans, currentHoldings]);

  const [activeTab, setActiveTab] = useState<ActiveTab>('pac');

  // Accumulation Phase Inputs
  const [initialAmountStr, setInitialAmountStr] = useState('1');
  const [periodicAmountStr, setPeriodicAmountStr] = useState('500');
  const [frequency, setFrequency] = useState<ContributionFrequency>('monthly');
  const [years, setYears] = useState<number>(25);
  const [startingAge, setStartingAge] = useState<number>(30);
  const [expectedReturn, setExpectedReturn] = useState<number>(7);
  const [annualStepUpStr, setAnnualStepUpStr] = useState('0');

  // Inflation Settings
  const [inflationRate, setInflationRate] = useState<number>(2.0); // 2%
  const [autoAdjustAccumulation, setAutoAdjustAccumulation] = useState(false);

  // Taxes & Stamp Duty
  const [applyStampDuty, setApplyStampDuty] = useState(true); // 0.20%
  const [applyTaxes, setApplyTaxes] = useState(false); // 26%

  // View Mode: Nominal vs Real (Today's Purchasing Power)
  const [displayRealValues, setDisplayRealValues] = useState(false);

  // Withdrawal Phase Inputs (Decumulo / Rendita)
  const [enableWithdrawal, setEnableWithdrawal] = useState(false);
  const [withdrawalYears, setWithdrawalYears] = useState<number>(15);
  const [withdrawalAmountStr, setWithdrawalAmountStr] = useState('1000');
  const [withdrawalFrequency, setWithdrawalFrequency] = useState<ContributionFrequency>('monthly');
  const [withdrawalReturn, setWithdrawalReturn] = useState<number>(5);
  const [withdrawalInTodayEuros, setWithdrawalInTodayEuros] = useState(true); // Default to today's purchasing power!

  // Goal Seeker State
  const [targetGoalStr, setTargetGoalStr] = useState('200000');
  const [goalMode, setGoalMode] = useState<'periodic' | 'years'>('periodic');

  // Monte Carlo State
  const [volatility, setVolatility] = useState<number>(15); // 15% standard deviation

  // Fee Drag State
  const [lowCostTER, setLowCostTER] = useState<number>(0.20);
  const [highCostTER, setHighCostTER] = useState<number>(1.80);

  // FIRE State
  const [fireMonthlyExpensesStr, setFireMonthlyExpensesStr] = useState('2000');
  const [fireSWR, setFireSWR] = useState<number>(4.0); // 4% rule

  // Modals & UI Toggles
  const [showFreqModal, setShowFreqModal] = useState(false);
  const [showWithFreqModal, setShowWithFreqModal] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const [showSavedModal, setShowSavedModal] = useState(false);

  // Numerical sanitization
  const initialAmount = Math.max(0, parseLocalNumber(initialAmountStr) || 0);
  const periodicAmount = Math.max(0, parseLocalNumber(periodicAmountStr) || 0);
  const annualStepUp = Math.max(0, parseLocalNumber(annualStepUpStr) || 0);
  const withdrawalAmount = Math.max(0, parseLocalNumber(withdrawalAmountStr) || 0);
  const targetGoal = Math.max(0, parseLocalNumber(targetGoalStr) || 0);
  const fireMonthlyExpenses = Math.max(0, parseLocalNumber(fireMonthlyExpensesStr) || 0);

  const pacParams: PacParams = {
    initialAmount,
    periodicAmount,
    frequency,
    years: Math.max(1, Math.min(35, years)),
    startingAge: Math.max(18, Math.min(80, startingAge)),
    expectedAnnualReturn: Math.max(0, Math.min(25, expectedReturn)),
    annualStepUp,
    inflationRate,
    autoAdjustAccumulationToInflation: autoAdjustAccumulation,
    applyTaxes,
    taxRate: 26,
    applyStampDuty,
    stampDutyRate: 0.20,
    withdrawalConfig: {
      enabled: enableWithdrawal,
      durationYears: Math.max(1, Math.min(35, withdrawalYears)),
      periodicAmount: withdrawalAmount,
      frequency: withdrawalFrequency,
      expectedAnnualReturn: Math.max(0, Math.min(25, withdrawalReturn)),
      withdrawalInTodayEuros,
    },
  };

  const result: PacResult = calculatePAC(pacParams);

  // Calculations for other modules
  const goalPeriodicResult = calculateGoalSeekerPeriodic(
    targetGoal,
    years,
    expectedReturn,
    initialAmount,
    frequency,
    applyStampDuty
  );
  const goalYearsResult = calculateGoalSeekerYears(
    targetGoal,
    periodicAmount,
    expectedReturn,
    initialAmount,
    frequency,
    applyStampDuty
  );

  const scenariosResult = calculateScenarios(pacParams);
  const monteCarloResult = calculateMonteCarlo(pacParams, volatility, 150);
  const feeDragResult = calculateFeeDrag(pacParams, lowCostTER, highCostTER);
  const fireResult = calculateFIRE(fireMonthlyExpenses, result.finalBalance, periodicAmount, expectedReturn, fireSWR);

  const getFreqLabel = (val: ContributionFrequency) =>
    FREQUENCIES.find((f) => f.value === val)?.label || 'Mensile';

  const setPresetInitial = (val: number) => setInitialAmountStr(val.toString());
  const setPresetPeriodic = (val: number) => setPeriodicAmountStr(val.toString());
  const setPresetWithdrawal = (val: number) => setWithdrawalAmountStr(val.toString());
  const setPresetGoal = (val: number) => setTargetGoalStr(val.toString());
  const setPresetFireExpenses = (val: number) => setFireMonthlyExpensesStr(val.toString());

  const handleLoadSavedSimulation = (loaded: PacParams) => {
    setInitialAmountStr(loaded.initialAmount.toString());
    setPeriodicAmountStr(loaded.periodicAmount.toString());
    setFrequency(loaded.frequency);
    setYears(loaded.years);
    if (loaded.startingAge) setStartingAge(loaded.startingAge);
    setExpectedReturn(loaded.expectedAnnualReturn);
    setAnnualStepUpStr((loaded.annualStepUp || 0).toString());
    setInflationRate(loaded.inflationRate || 2.0);
    setAutoAdjustAccumulation(!!loaded.autoAdjustAccumulationToInflation);
    setApplyStampDuty(!!loaded.applyStampDuty);
    setApplyTaxes(!!loaded.applyTaxes);
    if (loaded.withdrawalConfig) {
      setEnableWithdrawal(loaded.withdrawalConfig.enabled);
      setWithdrawalYears(loaded.withdrawalConfig.durationYears);
      setWithdrawalAmountStr(loaded.withdrawalConfig.periodicAmount.toString());
      setWithdrawalFrequency(loaded.withdrawalConfig.frequency);
      setWithdrawalReturn(loaded.withdrawalConfig.expectedAnnualReturn);
      setWithdrawalInTodayEuros(!!loaded.withdrawalConfig.withdrawalInTodayEuros);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        >
          <ChevronLeft size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Pianificazione Patrimoniale</Text>
        <TouchableOpacity
          style={styles.headerActionBtn}
          onPress={() => setShowSavedModal(true)}
        >
          <Bookmark size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* Navigation Tabs Bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsScrollBar}
        contentContainerStyle={styles.tabsContainer}
      >
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'pac' && styles.tabItemActive]}
          onPress={() => setActiveTab('pac')}
        >
          <BarChart3 size={16} color={activeTab === 'pac' ? colors.onStrong : colors.textSecondary} style={{ marginRight: 6 }} />
          <Text style={[styles.tabItemText, activeTab === 'pac' && styles.tabItemTextActive]}>
            PAC & Rendita
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'goal' && styles.tabItemActive]}
          onPress={() => setActiveTab('goal')}
        >
          <Target size={16} color={activeTab === 'goal' ? colors.onStrong : colors.textSecondary} style={{ marginRight: 6 }} />
          <Text style={[styles.tabItemText, activeTab === 'goal' && styles.tabItemTextActive]}>
            Goal Seeker
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'scenarios' && styles.tabItemActive]}
          onPress={() => setActiveTab('scenarios')}
        >
          <TrendingUp size={16} color={activeTab === 'scenarios' ? colors.onStrong : colors.textSecondary} style={{ marginRight: 6 }} />
          <Text style={[styles.tabItemText, activeTab === 'scenarios' && styles.tabItemTextActive]}>
            Scenari
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'montecarlo' && styles.tabItemActive]}
          onPress={() => setActiveTab('montecarlo')}
        >
          <Sliders size={16} color={activeTab === 'montecarlo' ? colors.onStrong : colors.textSecondary} style={{ marginRight: 6 }} />
          <Text style={[styles.tabItemText, activeTab === 'montecarlo' && styles.tabItemTextActive]}>
            Monte Carlo
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'feedrag' && styles.tabItemActive]}
          onPress={() => setActiveTab('feedrag')}
        >
          <Percent size={16} color={activeTab === 'feedrag' ? colors.onStrong : colors.textSecondary} style={{ marginRight: 6 }} />
          <Text style={[styles.tabItemText, activeTab === 'feedrag' && styles.tabItemTextActive]}>
            Costi & TER
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'fire' && styles.tabItemActive]}
          onPress={() => setActiveTab('fire')}
        >
          <Flame size={16} color={activeTab === 'fire' ? colors.onStrong : colors.textSecondary} style={{ marginRight: 6 }} />
          <Text style={[styles.tabItemText, activeTab === 'fire' && styles.tabItemTextActive]}>
            FIRE / Rendita
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tabItem, 
            activeTab === 'scalable_plans' && styles.tabItemActive,
            activeTab === 'scalable_plans' && { backgroundColor: colors.scalableSurface, borderColor: colors.scalable }
          ]}
          onPress={() => setActiveTab('scalable_plans')}
        >
          <Cpu size={16} color={activeTab === 'scalable_plans' ? colors.scalable : colors.textSecondary} style={{ marginRight: 6 }} />
          <Text style={[styles.tabItemText, activeTab === 'scalable_plans' && { color: colors.scalable, fontWeight: '700' }]}>
            PAC Scalable {scalablePlans.length > 0 ? `(${scalablePlans.length})` : ''}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* ==================================================== */}
        {/* TAB 1: PAC & RENDITA (STANDARD SIMULATOR)            */}
        {/* ==================================================== */}
        {activeTab === 'pac' && (
          <>
            <View style={styles.titleSection}>
              <Text style={styles.mainTitle}>Calcola il tuo Piano di Accumulo (PAC)</Text>
              <Text style={styles.mainSubtitle}>
                Gestisci la crescita del capitale, l&apos;inflazione reale e la successiva fase di rendita indicizzata.
              </Text>
            </View>

            {scalablePlans.length > 0 && (
              <View style={styles.scalablePacSyncBanner}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                  <View style={styles.scalablePacBadgeIcon}>
                    <Cpu size={16} color={colors.scalable} />
                  </View>
                  <View style={{ marginLeft: 10, flex: 1 }}>
                    <Text style={styles.scalablePacBannerTitle}>
                      {scalablePlans.length} Piani PAC Sincronizzati da Scalable
                    </Text>
                    <Text style={styles.scalablePacBannerSubtitle}>
                      Totale programmato: €{formatNumber(scalableTotalMonthly)}/mese
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <TouchableOpacity
                    style={styles.scalablePacImportBtn}
                    onPress={() => {
                      setPeriodicAmountStr(scalableTotalMonthly.toString());
                      setFrequency('monthly');
                    }}
                  >
                    <Download size={13} color={colors.onAccent} style={{ marginRight: 4 }} />
                    <Text style={styles.scalablePacImportBtnText}>Usa €{formatNumber(scalableTotalMonthly)}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.scalablePacRebalanceBtn}
                    onPress={() => setActiveTab('scalable_plans')}
                  >
                    <Sliders size={13} color={colors.scalable} style={{ marginRight: 4 }} />
                    <Text style={styles.scalablePacRebalanceBtnText}>Ribilanciamento</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Fase 1: Accumulo */}
            <View style={styles.phaseHeaderBox}>
              <Text style={styles.phaseHeaderTitle}>1. Fase di Accumulo (Versamenti)</Text>
            </View>

            {/* Iniziale */}
            <View style={styles.inputCard}>
              <Text style={styles.fieldHeading}>Qual è l&apos;importo iniziale che desideri investire?</Text>
              <View style={styles.bbvaInputBox}>
                <Text style={styles.floatingLabel}>Importo iniziale</Text>
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.bbvaTextInput}
                    value={initialAmountStr}
                    onChangeText={setInitialAmountStr}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={colors.textSecondary}
                  />
                  <Text style={styles.currencySuffix}>€</Text>
                </View>
              </View>
              <View style={styles.presetRow}>
                {[0, 1000, 5000].map((val) => (
                  <TouchableOpacity
                    key={val}
                    style={[styles.presetChip, initialAmount === val && styles.presetChipActive]}
                    onPress={() => setPresetInitial(val)}
                  >
                    <Text style={[styles.presetChipText, initialAmount === val && styles.presetChipTextActive]}>
                      {val === 0 ? '0 €' : `€${val >= 1000 ? `${val / 1000}k` : val}`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Periodico */}
            <View style={styles.inputCard}>
              <Text style={styles.fieldHeading}>Quanto vuoi versare periodicamente?</Text>
              <View style={styles.bbvaInputBox}>
                <Text style={styles.floatingLabel}>Importo periodico</Text>
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.bbvaTextInput}
                    value={periodicAmountStr}
                    onChangeText={setPeriodicAmountStr}
                    keyboardType="numeric"
                    placeholder="50"
                    placeholderTextColor={colors.textSecondary}
                  />
                  <Text style={styles.currencySuffix}>€</Text>
                </View>
              </View>
              <Text style={styles.minInfoText}>ⓘ Min 5€</Text>
              <View style={styles.presetRow}>
                {[50, 100, 200, 500, 1000].map((val) => (
                  <TouchableOpacity
                    key={val}
                    style={[styles.presetChip, periodicAmount === val && styles.presetChipActive]}
                    onPress={() => setPresetPeriodic(val)}
                  >
                    <Text style={[styles.presetChipText, periodicAmount === val && styles.presetChipTextActive]}>
                      {val} €
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Frequenza */}
            <View style={styles.inputCard}>
              <Text style={styles.fieldHeading}>Scegli la frequenza dei versamenti</Text>
              <TouchableOpacity
                style={styles.bbvaSelectBox}
                onPress={() => setShowFreqModal(true)}
                activeOpacity={0.7}
              >
                <View>
                  <Text style={styles.floatingLabel}>Frequenza dei versamenti</Text>
                  <Text style={styles.selectValueText}>{getFreqLabel(frequency)}</Text>
                </View>
                <ChevronDown size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Durata */}
            <View style={styles.inputCard}>
              <Text style={styles.fieldHeading}>Durata dell&apos;accumulo</Text>
              <View style={styles.bbvaInputBox}>
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.bbvaTextInput}
                    value={years.toString()}
                    onChangeText={(val) => {
                      const parsed = parseInt(val, 10);
                      if (!isNaN(parsed)) setYears(Math.max(1, Math.min(35, parsed)));
                    }}
                    keyboardType="numeric"
                  />
                  <Text style={styles.currencySuffix}>anni</Text>
                </View>
              </View>
              <PacSlider
                value={years}
                min={1}
                max={35}
                step={1}
                minLabel="Min. 1 anno"
                maxLabel="Max. 35 anni"
                onChange={setYears}
              />
            </View>

            {/* Età a inizio piano */}
            <View style={styles.inputCard}>
              <Text style={styles.fieldHeading}>Quanti anni hai all&apos;inizio del piano?</Text>
              <View style={styles.bbvaInputBox}>
                <Text style={styles.floatingLabel}>Età attuale di partenza</Text>
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.bbvaTextInput}
                    value={startingAge.toString()}
                    onChangeText={(val) => {
                      const parsed = parseInt(val, 10);
                      if (!isNaN(parsed)) setStartingAge(Math.max(18, Math.min(80, parsed)));
                    }}
                    keyboardType="numeric"
                  />
                  <Text style={styles.currencySuffix}>anni</Text>
                </View>
              </View>
              <PacSlider
                value={startingAge}
                min={18}
                max={75}
                step={1}
                minLabel="Min. 18 anni"
                maxLabel="Max. 75 anni"
                onChange={setStartingAge}
              />
              <View style={styles.presetRow}>
                {[20, 25, 30, 35, 40, 50].map((val) => (
                  <TouchableOpacity
                    key={val}
                    style={[styles.presetChip, startingAge === val && styles.presetChipActive]}
                    onPress={() => setStartingAge(val)}
                  >
                    <Text style={[styles.presetChipText, startingAge === val && styles.presetChipTextActive]}>
                      {val} anni
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Rendimento */}
            <View style={styles.inputCard}>
              <Text style={styles.fieldHeading}>Che rendimento annuo ti aspetti?</Text>
              <View style={styles.bbvaInputBox}>
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.bbvaTextInput}
                    value={expectedReturn.toString()}
                    onChangeText={(val) => {
                      const parsed = parseFloat(val);
                      if (!isNaN(parsed)) setExpectedReturn(Math.max(1, Math.min(25, parsed)));
                    }}
                    keyboardType="numeric"
                  />
                  <Text style={styles.currencySuffix}>%</Text>
                </View>
              </View>
              <PacSlider
                value={expectedReturn}
                min={1}
                max={25}
                step={1}
                minLabel="Min. 1 %"
                maxLabel="Max. 25 %"
                onChange={setExpectedReturn}
              />
            </View>

            {/* ==================================================== */}
            {/* INFLAZIONE & POTERE D'ACQUISTO                      */}
            {/* ==================================================== */}
            <View style={styles.inflationSectionCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <Coins size={20} color={colors.warning} style={{ marginRight: 8 }} />
                <Text style={styles.inflationSectionTitle}>Inflazione & Potere d&apos;Acquisto</Text>
              </View>
              <Text style={styles.inflationDesc}>
                L&apos;inflazione riduce il potere d&apos;acquisto nel tempo. Imposta il tasso medio stimato (default 2% target BCE).
              </Text>

              <View style={styles.inputCard}>
                <Text style={styles.fieldHeading}>Tasso di Inflazione Annuo Stimato: {inflationRate}%</Text>
                <PacSlider
                  value={inflationRate}
                  min={0}
                  max={6}
                  step={0.25}
                  minLabel="0% (Nessuna)"
                  maxLabel="6% (Elevata)"
                  onChange={setInflationRate}
                />
              </View>

              <View style={styles.switchRow}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={styles.switchLabel}>Adeguamento automatico versamenti PAC</Text>
                  <Text style={styles.helperText}>
                    Aumenta la rata del versamento del +{inflationRate}% ogni anno per mantenere costante la capacità di risparmio reale.
                  </Text>
                </View>
                <Switch
                  value={autoAdjustAccumulation}
                  onValueChange={setAutoAdjustAccumulation}
                  trackColor={{ false: colors.border, true: colors.warning }}
                  thumbColor={colors.onStrong}
                />
              </View>
            </View>

            {/* ==================================================== */}
            {/* FASE 2: DECUMULO (RENDITA INDICIZZATA)               */}
            {/* ==================================================== */}
            <View style={styles.withdrawalToggleCard}>
              <View style={styles.withdrawalToggleRow}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                    <Wallet size={20} color={colors.chartWithdrawal} style={{ marginRight: 8 }} />
                    <Text style={styles.withdrawalToggleTitle}>Fase di Prelievo (Decumulo)</Text>
                  </View>
                  <Text style={styles.withdrawalToggleSubtitle}>
                    Dopo {years} anni di versamenti, preleva una rendita periodica dal capitale accumulato.
                  </Text>
                </View>
                <Switch
                  value={enableWithdrawal}
                  onValueChange={setEnableWithdrawal}
                  trackColor={{ false: colors.border, true: colors.chartWithdrawal }}
                  thumbColor={colors.onStrong}
                />
              </View>
            </View>

            {enableWithdrawal && (
              <View style={styles.withdrawalSection}>
                <View style={styles.phaseHeaderBox}>
                  <Text style={[styles.phaseHeaderTitle, { color: colors.chartWithdrawal }]}>
                    2. Configurazione Prelievi (dal {years + 1}° anno)
                  </Text>
                </View>

                {/* Today's Euro Mode Switch */}
                <View style={styles.todayEuroSwitchCard}>
                  <View style={styles.switchRow}>
                    <View style={{ flex: 1, marginRight: 12 }}>
                      <Text style={[styles.switchLabel, { color: colors.chartWithdrawal, fontWeight: 'bold' }]}>
                        Prelievo in &quot;Euro di Oggi&quot; (Potere d&apos;Acquisto Costante)
                      </Text>
                      <Text style={styles.helperText}>
                        Se attivo, l&apos;importo inserito è il potere d&apos;acquisto odierno desiderato. Verrà automaticamente rivalutato all&apos;inflazione per tutta la vita del piano.
                      </Text>
                    </View>
                    <Switch
                      value={withdrawalInTodayEuros}
                      onValueChange={setWithdrawalInTodayEuros}
                      trackColor={{ false: colors.border, true: colors.chartWithdrawal }}
                      thumbColor={colors.onStrong}
                    />
                  </View>

                  {withdrawalInTodayEuros && result.startingNominalWithdrawal && (
                    <View style={styles.startingWithdrawalBadge}>
                      <Text style={styles.startingWithdrawalText}>
                        💡 Tra {years} anni, l&apos;equivalente di <Text style={{ fontWeight: 'bold', color: colors.text }}>€{withdrawalAmount}/m di oggi</Text> sarà una prima rata nominale di <Text style={{ fontWeight: 'bold', color: colors.chartWithdrawal }}>€{formatNumber(result.startingNominalWithdrawal)}/mese</Text>, che crescerà del +{inflationRate}% ogni anno.
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.inputCard}>
                  <Text style={styles.fieldHeading}>
                    {withdrawalInTodayEuros ? 'Importo mensile equivalente in euro di oggi' : 'Importo prelievo nominale'}
                  </Text>
                  <View style={styles.bbvaInputBox}>
                    <Text style={styles.floatingLabel}>
                      {withdrawalInTodayEuros ? 'Potere d\'acquisto desiderato' : 'Importo prelievo'}
                    </Text>
                    <View style={styles.inputRow}>
                      <TextInput
                        style={styles.bbvaTextInput}
                        value={withdrawalAmountStr}
                        onChangeText={setWithdrawalAmountStr}
                        keyboardType="numeric"
                        placeholder="1000"
                        placeholderTextColor={colors.textSecondary}
                      />
                      <Text style={styles.currencySuffix}>€ / mese</Text>
                    </View>
                  </View>
                  <View style={styles.presetRow}>
                    {[500, 1000, 1500, 2000, 3000].map((val) => (
                      <TouchableOpacity
                        key={val}
                        style={[
                          styles.presetChip,
                          withdrawalAmount === val && { borderColor: colors.chartWithdrawal, backgroundColor: withAlpha(colors.chartWithdrawal, 0.1) },
                        ]}
                        onPress={() => setPresetWithdrawal(val)}
                      >
                        <Text
                          style={[
                            styles.presetChipText,
                            withdrawalAmount === val && { color: colors.chartWithdrawal, fontWeight: 'bold' },
                          ]}
                        >
                          {val} €
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={styles.inputCard}>
                  <Text style={styles.fieldHeading}>Frequenza di prelievo</Text>
                  <TouchableOpacity
                    style={styles.bbvaSelectBox}
                    onPress={() => setShowWithFreqModal(true)}
                    activeOpacity={0.7}
                  >
                    <View>
                      <Text style={styles.floatingLabel}>Frequenza prelievi</Text>
                      <Text style={styles.selectValueText}>{getFreqLabel(withdrawalFrequency)}</Text>
                    </View>
                    <ChevronDown size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>

                <View style={styles.inputCard}>
                  <Text style={styles.fieldHeading}>Per quanti anni vuoi prelevare?</Text>
                  <View style={styles.bbvaInputBox}>
                    <View style={styles.inputRow}>
                      <TextInput
                        style={styles.bbvaTextInput}
                        value={withdrawalYears.toString()}
                        onChangeText={(val) => {
                          const parsed = parseInt(val, 10);
                          if (!isNaN(parsed)) setWithdrawalYears(Math.max(1, Math.min(35, parsed)));
                        }}
                        keyboardType="numeric"
                      />
                      <Text style={styles.currencySuffix}>anni</Text>
                    </View>
                  </View>
                  <PacSlider
                    value={withdrawalYears}
                    min={1}
                    max={35}
                    step={1}
                    minLabel="Min. 1 anno"
                    maxLabel="Max. 35 anni"
                    onChange={setWithdrawalYears}
                  />
                </View>

                <View style={styles.inputCard}>
                  <Text style={styles.fieldHeading}>Rendimento annuo durante la fase di prelievo</Text>
                  <View style={styles.bbvaInputBox}>
                    <View style={styles.inputRow}>
                      <TextInput
                        style={styles.bbvaTextInput}
                        value={withdrawalReturn.toString()}
                        onChangeText={(val) => {
                          const parsed = parseFloat(val);
                          if (!isNaN(parsed)) setWithdrawalReturn(Math.max(0, Math.min(25, parsed)));
                        }}
                        keyboardType="numeric"
                      />
                      <Text style={styles.currencySuffix}>%</Text>
                    </View>
                  </View>
                  <PacSlider
                    value={withdrawalReturn}
                    min={0}
                    max={20}
                    step={1}
                    minLabel="Min. 0 %"
                    maxLabel="Max. 20 %"
                    onChange={setWithdrawalReturn}
                  />
                </View>

                {result.isDepleted && (
                  <View style={styles.warningCard}>
                    <AlertTriangle size={24} color={colors.negative} style={{ marginRight: 12 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.warningTitle}>Attenzione: Capitale Esaurito</Text>
                      <Text style={styles.warningText}>
                        Al ritmo di prelievo indicizzato all&apos;inflazione impostato, il capitale si esaurisce all&apos;anno {result.depletedYear}. Prova a ridurre l&apos;importo del prelievo o aumentare la durata di accumulo.
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* Fiscalità */}
            <View style={styles.taxSectionCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <Landmark size={20} color={colors.text} style={{ marginRight: 8 }} />
                <Text style={styles.taxSectionTitle}>Parametri Fiscali</Text>
              </View>

              <View style={styles.taxRow}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={styles.taxLabel}>Imposta di Bollo (0,20% annuo)</Text>
                  <Text style={styles.taxDesc}>
                    Detratta annualmente sul controvalore del dossier titoli (standard italiano).
                  </Text>
                </View>
                <Switch
                  value={applyStampDuty}
                  onValueChange={setApplyStampDuty}
                  trackColor={{ false: colors.border, true: colors.positive }}
                  thumbColor={colors.onStrong}
                />
              </View>

              <View style={[styles.taxRow, { borderBottomWidth: 0, paddingBottom: 0 }]}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={styles.taxLabel}>Ritenuta Plusvalenze / Capital Gain (26%)</Text>
                  <Text style={styles.taxDesc}>
                    Calcola il valore al netto della tassazione sui guadagni.
                  </Text>
                </View>
                <Switch
                  value={applyTaxes}
                  onValueChange={setApplyTaxes}
                  trackColor={{ false: colors.border, true: colors.positive }}
                  thumbColor={colors.onStrong}
                />
              </View>
            </View>

            {/* View Mode Toggle: Nominal vs Real */}
            <View style={styles.viewModeToggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.viewModeTitle}>Modalità di Visualizzazione</Text>
                <Text style={styles.viewModeSubtitle}>
                  {displayRealValues ? 'Visualizzi i valori deflazionati in Potere d\'Acquisto di Oggi' : 'Visualizzi i valori nominali futuri in Euro'}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.viewModeBtn, displayRealValues && styles.viewModeBtnActive]}
                onPress={() => setDisplayRealValues(!displayRealValues)}
              >
                <Text style={[styles.viewModeBtnText, displayRealValues && styles.viewModeBtnTextActive]}>
                  {displayRealValues ? '🛒 Euro di Oggi' : '💶 Valori Nominali'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Grafico */}
            <View style={styles.resultsHeaderSection}>
              <Text style={styles.resultsSectionTitle}>
                {enableWithdrawal ? 'Evoluzione Accumulo & Prelievi' : 'Rendimento del tuo PAC'}
              </Text>
            </View>

            <PacGrowthChart
              data={result.yearlyData}
              height={280}
              hasWithdrawalPhase={enableWithdrawal}
              accumulationYears={years}
              applyTaxes={applyTaxes}
              displayRealValues={displayRealValues}
            />

            {/* Metriche */}
            <View style={styles.statsGrid}>
              {enableWithdrawal ? (
                <>
                  <View style={styles.statCard}>
                    <View style={styles.statCardHeader}>
                      <View style={[styles.statDot, { backgroundColor: colors.chartGrowth }]} />
                      <Text style={styles.statCardLabel}>
                        {displayRealValues ? 'Picco Reale (Euro di Oggi)' : applyTaxes ? 'Picco Netto (Fine Accumulo)' : 'Picco a fine accumulo'}
                      </Text>
                    </View>
                    <Text style={[styles.statCardValue, { color: colors.positive }]}>
                      {formatNumber(
                        displayRealValues
                          ? result.realPeakBalance
                          : (applyTaxes && result.yearlyData[years - 1]?.netEndBalance !== undefined
                              ? result.yearlyData[years - 1].netEndBalance
                              : result.peakBalance) ?? 0
                      )}€
                    </Text>
                    {!displayRealValues && (
                      <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>
                        (Oggi: €{formatNumber(result.realPeakBalance)})
                      </Text>
                    )}
                  </View>

                  <View style={styles.statCard}>
                    <View style={styles.statCardHeader}>
                      <View style={[styles.statDot, { backgroundColor: colors.chartWithdrawal }]} />
                      <Text style={styles.statCardLabel}>
                        {displayRealValues ? 'Rendita Reale Prelevata' : 'Rendita Totale Prelevata'}
                      </Text>
                    </View>
                    <Text style={[styles.statCardValue, { color: colors.chartWithdrawal }]}>
                      {formatNumber(displayRealValues ? result.realTotalWithdrawn : result.totalWithdrawn)}€
                    </Text>
                    {!displayRealValues && (
                      <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>
                        (Oggi: €{formatNumber(result.realTotalWithdrawn)})
                      </Text>
                    )}
                  </View>

                  <View style={styles.statCard}>
                    <View style={styles.statCardHeader}>
                      <View style={[styles.statDot, { backgroundColor: colors.info }]} />
                      <Text style={styles.statCardLabel}>
                        {displayRealValues ? 'Capitale Residuo Reale' : applyTaxes ? 'Capitale Residuo Netto' : 'Capitale Residuo Finale'}
                      </Text>
                    </View>
                    <Text style={styles.statCardValue}>
                      {formatNumber(
                        displayRealValues
                          ? (applyTaxes && result.realNetFinalBalance !== undefined ? result.realNetFinalBalance : result.realFinalBalance)
                          : (applyTaxes && result.netFinalBalance !== undefined ? result.netFinalBalance : result.finalBalance)
                      )}€
                    </Text>
                    {!displayRealValues && (
                      <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>
                        (Oggi: €{formatNumber(result.realFinalBalance)})
                      </Text>
                    )}
                  </View>

                  <View style={styles.statCard}>
                    <View style={styles.statCardHeader}>
                      <View style={[styles.statDot, { backgroundColor: colors.chartInvested }]} />
                      <Text style={styles.statCardLabel}>Totale Versamenti</Text>
                    </View>
                    <Text style={styles.statCardValue}>
                      {formatNumber(result.totalInvested)}€
                    </Text>
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.statCard}>
                    <View style={styles.statCardHeader}>
                      <View style={[styles.statDot, { backgroundColor: colors.chartContributions }]} />
                      <Text style={styles.statCardLabel}>Versamento Iniziale</Text>
                    </View>
                    <Text style={styles.statCardValue}>
                      {formatNumber(result.initialAmount)}€
                    </Text>
                  </View>

                  <View style={styles.statCard}>
                    <View style={styles.statCardHeader}>
                      <View style={[styles.statDot, { backgroundColor: colors.chartInvested }]} />
                      <Text style={styles.statCardLabel}>Totale versamenti</Text>
                    </View>
                    <Text style={styles.statCardValue}>
                      {formatNumber(result.totalPeriodicInvested)}€
                    </Text>
                  </View>

                  <View style={styles.statCard}>
                    <View style={styles.statCardHeader}>
                      <View style={[styles.statDot, { backgroundColor: colors.chartGrowth }]} />
                      <Text style={styles.statCardLabel}>Rendimento totale</Text>
                    </View>
                    <Text style={[styles.statCardValue, { color: colors.positive }]}>
                      {formatNumber(result.totalInterest)}€
                    </Text>
                  </View>

                  <View style={styles.statCard}>
                    <View style={styles.statCardHeader}>
                      <View style={styles.multiDotGroup}>
                        <View style={[styles.miniDot, { backgroundColor: colors.chartContributions }]} />
                        <View style={[styles.miniDot, { backgroundColor: colors.chartInvested }]} />
                        <View style={[styles.miniDot, { backgroundColor: colors.chartGrowth }]} />
                      </View>
                      <Text style={styles.statCardLabel}>
                        {displayRealValues ? 'Valore Reale (Euro di Oggi)' : 'Valore Capitale Nominale'}
                      </Text>
                    </View>
                    <Text style={[styles.statCardValue, { fontWeight: 'bold' }]}>
                      {formatNumber(
                        displayRealValues
                          ? (applyTaxes && result.realNetFinalBalance !== undefined ? result.realNetFinalBalance : result.realFinalBalance)
                          : (applyTaxes && result.netFinalBalance !== undefined ? result.netFinalBalance : result.finalBalance)
                      )}€
                    </Text>
                    {!displayRealValues && (
                      <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>
                        (Potere d&apos;acquisto odierno: €{formatNumber(result.realFinalBalance)})
                      </Text>
                    )}
                  </View>
                </>
              )}
            </View>

            {applyStampDuty && (
              <View style={styles.dutyInfoBadge}>
                <Text style={styles.dutyInfoText}>
                  Totale Imposta di Bollo (0,20%) pagata negli anni: <Text style={{ fontWeight: 'bold', color: colors.text }}>€{formatNumber(result.totalStampDutyPaid)}</Text>
                </Text>
              </View>
            )}

            {/* Table View Toggle */}
            <TouchableOpacity
              style={styles.toggleTableBtn}
              onPress={() => setShowTable(!showTable)}
            >
              <Text style={styles.toggleTableBtnText}>
                {showTable ? 'Nascondi Tabella Dettaglio' : 'Mostra Tabella Anno per Anno'}
              </Text>
            </TouchableOpacity>

            {showTable && (
              <View style={styles.tableCard}>
                <View style={styles.tableHeaderRow}>
                  <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 0.35, textAlign: 'center' }]}>Anno</Text>
                  <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 0.35, textAlign: 'center' }]}>Età</Text>
                  <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 0.85, textAlign: 'center' }]}>Fase</Text>
                  <Text style={[styles.tableCell, styles.tableHeaderCell, styles.numCell, { flex: 1.1 }]}>Nominale</Text>
                  <Text style={[styles.tableCell, styles.tableHeaderCell, styles.numCell, { flex: 1.1 }]}>Euro Oggi</Text>
                  <Text style={[styles.tableCell, styles.tableHeaderCell, styles.numCell, { flex: 1.15 }]}>Capitale</Text>
                </View>
                {result.yearlyData.map((row, idx) => (
                  <View
                    key={row.year}
                    style={[
                      styles.tableRow,
                      idx === result.yearlyData.length - 1 && { borderBottomWidth: 0 },
                    ]}
                  >
                    <Text style={[styles.tableCell, { flex: 0.35, textAlign: 'center' }]}>{row.year}</Text>
                    <Text style={[styles.tableCell, { flex: 0.35, color: colors.info, fontWeight: 'bold', textAlign: 'center' }]}>
                      {row.age ?? '-'}
                    </Text>
                    <View style={{ flex: 0.85, justifyContent: 'center', alignItems: 'center' }}>
                      <View
                        style={{
                          backgroundColor: row.phase === 'accumulation' ? withAlpha(colors.positive, 0.12) : withAlpha(colors.chartWithdrawal, 0.12),
                          paddingHorizontal: 4,
                          paddingVertical: 2,
                          borderRadius: 4,
                        }}
                      >
                        <Text
                          numberOfLines={1}
                          style={{
                            fontSize: 9,
                            fontWeight: 'bold',
                            color: row.phase === 'accumulation' ? colors.positive : colors.chartWithdrawal,
                          }}
                        >
                          {row.phase === 'accumulation' ? 'Versamento' : 'Prelievo'}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.tableCell, styles.numCell, { flex: 1.1 }]}>
                      {row.phase === 'accumulation'
                        ? `+€${formatNumber(row.contributionsThisYear)}`
                        : `-€${formatNumber(row.withdrawalsThisYear)}`}
                    </Text>
                    <Text style={[styles.tableCell, styles.numCell, { flex: 1.1, color: colors.warning }]}>
                      {row.phase === 'accumulation'
                        ? `€${formatNumber(row.realContributionsThisYear)}`
                        : `€${formatNumber(row.realWithdrawalsThisYear)}`}
                    </Text>
                    <Text style={[styles.tableCell, styles.numCell, { flex: 1.15, fontWeight: 'bold' }]}>
                      €{formatNumber(displayRealValues ? row.realEndBalance : row.endBalance)}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        {/* ==================================================== */}
        {/* TAB 2: GOAL SEEKER                                   */}
        {/* ==================================================== */}
        {activeTab === 'goal' && (
          <View style={styles.moduleSection}>
            <View style={styles.titleSection}>
              <Text style={styles.mainTitle}>Calcolatore Inverso per Obiettivo</Text>
              <Text style={styles.mainSubtitle}>
                Definisci il capitale finale che desideri raggiungere e scopri quanto devi versare o quanti anni ti servono.
              </Text>
            </View>

            <View style={styles.inputCard}>
              <Text style={styles.fieldHeading}>Qual è il tuo Capitale Obiettivo?</Text>
              <View style={styles.bbvaInputBox}>
                <Text style={styles.floatingLabel}>Capitale Target Desiderato</Text>
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.bbvaTextInput}
                    value={targetGoalStr}
                    onChangeText={setTargetGoalStr}
                    keyboardType="numeric"
                    placeholder="100000"
                    placeholderTextColor={colors.textSecondary}
                  />
                  <Text style={styles.currencySuffix}>€</Text>
                </View>
              </View>
              <View style={styles.presetRow}>
                {[50000, 100000, 200000, 500000, 1000000].map((val) => (
                  <TouchableOpacity
                    key={val}
                    style={[styles.presetChip, targetGoal === val && styles.presetChipActive]}
                    onPress={() => setPresetGoal(val)}
                  >
                    <Text style={[styles.presetChipText, targetGoal === val && styles.presetChipTextActive]}>
                      €{val >= 1000000 ? `${val / 1000000}M` : `${val / 1000}k`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.modeSwitchBox}>
              <TouchableOpacity
                style={[styles.modeSwitchBtn, goalMode === 'periodic' && styles.modeSwitchBtnActive]}
                onPress={() => setGoalMode('periodic')}
              >
                <Text style={[styles.modeSwitchText, goalMode === 'periodic' && styles.modeSwitchTextActive]}>
                  Calcola Rata Mensile
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeSwitchBtn, goalMode === 'years' && styles.modeSwitchBtnActive]}
                onPress={() => setGoalMode('years')}
              >
                <Text style={[styles.modeSwitchText, goalMode === 'years' && styles.modeSwitchTextActive]}>
                  Calcola Anni Necessari
                </Text>
              </TouchableOpacity>
            </View>

            {goalMode === 'periodic' ? (
              <View style={styles.heroResultCard}>
                <Text style={styles.heroResultSub}>Per raggiungere €{formatNumber(targetGoal)} in {years} anni ({expectedReturn}% annuo):</Text>
                <Text style={styles.heroResultMain}>
                  € {formatNumber(goalPeriodicResult.requiredMonthlyAmount)} <Text style={{ fontSize: 18, fontWeight: 'normal' }}>/ mese</Text>
                </Text>
                <View style={styles.heroResultDivider} />
                <View style={styles.heroResultRow}>
                  <Text style={styles.heroResultRowLabel}>Totale che verserai di tasca tua:</Text>
                  <Text style={styles.heroResultRowVal}>€ {formatNumber(goalPeriodicResult.totalInvested)}</Text>
                </View>
                <View style={styles.heroResultRow}>
                  <Text style={styles.heroResultRowLabel}>Interessi generati dal mercato:</Text>
                  <Text style={[styles.heroResultRowVal, { color: colors.positive }]}>+€ {formatNumber(goalPeriodicResult.totalInterest)}</Text>
                </View>
              </View>
            ) : (
              <View style={styles.heroResultCard}>
                <Text style={styles.heroResultSub}>Versando €{formatNumber(periodicAmount)}/mese al {expectedReturn}% annuo:</Text>
                <Text style={styles.heroResultMain}>
                  {goalYearsResult.requiredYears} <Text style={{ fontSize: 20, fontWeight: 'normal' }}>Anni di Versamenti</Text>
                </Text>
                <View style={styles.heroResultDivider} />
                <View style={styles.heroResultRow}>
                  <Text style={styles.heroResultRowLabel}>Capitale finale effettivo:</Text>
                  <Text style={styles.heroResultRowVal}>€ {formatNumber(goalYearsResult.finalBalance)}</Text>
                </View>
                <View style={styles.heroResultRow}>
                  <Text style={styles.heroResultRowLabel}>Totale versato:</Text>
                  <Text style={styles.heroResultRowVal}>€ {formatNumber(goalYearsResult.totalInvested)}</Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* ==================================================== */}
        {/* TAB 3: CONFRONTO SCENARI                             */}
        {/* ==================================================== */}
        {activeTab === 'scenarios' && (
          <View style={styles.moduleSection}>
            <View style={styles.titleSection}>
              <Text style={styles.mainTitle}>Confronto Scenari di Rendimento</Text>
              <Text style={styles.mainSubtitle}>
                Guarda a confronto cosa accade con €{periodicAmount}/mese per {years} anni nei 3 profili di rischio tipici.
              </Text>
            </View>

            <View style={styles.scenarioCard}>
              <View style={styles.scenarioCardHeader}>
                <View style={[styles.statDot, { backgroundColor: colors.info }]} />
                <Text style={styles.scenarioTitle}>Prudente / Obbligazionario (4%)</Text>
              </View>
              <Text style={styles.scenarioValue}>€ {formatNumber(scenariosResult.prudent.result.finalBalance)}</Text>
              <Text style={styles.scenarioSub}>Guadagno: +€{formatNumber(scenariosResult.prudent.result.totalInterest)}</Text>
            </View>

            <View style={[styles.scenarioCard, { borderColor: colors.positive, borderWidth: 2 }]}>
              <View style={styles.scenarioCardHeader}>
                <View style={[styles.statDot, { backgroundColor: colors.positive }]} />
                <Text style={[styles.scenarioTitle, { color: colors.positive }]}>Bilanciato (7% - Scenario Base)</Text>
              </View>
              <Text style={[styles.scenarioValue, { color: colors.positive }]}>€ {formatNumber(scenariosResult.balanced.result.finalBalance)}</Text>
              <Text style={styles.scenarioSub}>Guadagno: +€{formatNumber(scenariosResult.balanced.result.totalInterest)}</Text>
            </View>

            <View style={styles.scenarioCard}>
              <View style={styles.scenarioCardHeader}>
                <View style={[styles.statDot, { backgroundColor: colors.warning }]} />
                <Text style={styles.scenarioTitle}>Dinamico / Azionario Globale (10%)</Text>
              </View>
              <Text style={styles.scenarioValue}>€ {formatNumber(scenariosResult.dynamic.result.finalBalance)}</Text>
              <Text style={styles.scenarioSub}>Guadagno: +€{formatNumber(scenariosResult.dynamic.result.totalInterest)}</Text>
            </View>
          </View>
        )}

        {/* ==================================================== */}
        {/* TAB 4: MONTE CARLO                                   */}
        {/* ==================================================== */}
        {activeTab === 'montecarlo' && (
          <View style={styles.moduleSection}>
            <View style={styles.titleSection}>
              <Text style={styles.mainTitle}>Simulazione Monte Carlo & Stress Test</Text>
              <Text style={styles.mainSubtitle}>
                I mercati non crescono a tasso fisso. Questo modello simula 150 traiettorie con oscillazioni casuali di mercato (volatilità reale).
              </Text>
            </View>

            <View style={styles.inputCard}>
              <Text style={styles.fieldHeading}>Volatilità di Mercato Annua (Deviazione Standard)</Text>
              <View style={styles.bbvaInputBox}>
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.bbvaTextInput}
                    value={volatility.toString()}
                    onChangeText={(val) => {
                      const parsed = parseFloat(val);
                      if (!isNaN(parsed)) setVolatility(Math.max(5, Math.min(30, parsed)));
                    }}
                    keyboardType="numeric"
                  />
                  <Text style={styles.currencySuffix}>% annua</Text>
                </View>
              </View>
              <PacSlider
                value={volatility}
                min={5}
                max={30}
                step={1}
                minLabel="5% (Bassa Volatilità)"
                maxLabel="30% (Alta Volatilità)"
                onChange={setVolatility}
              />
            </View>

            <MonteCarloChart data={monteCarloResult.yearlyPoints} totalInvested={monteCarloResult.totalInvested} height={280} />

            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <Text style={styles.statCardLabel}>90° Percentile (Ottimistico)</Text>
                <Text style={[styles.statCardValue, { color: colors.positive }]}>€ {formatNumber(monteCarloResult.finalP90)}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statCardLabel}>50° Percentile (Mediana)</Text>
                <Text style={[styles.statCardValue, { color: colors.info }]}>€ {formatNumber(monteCarloResult.finalP50)}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statCardLabel}>10° Percentile (Pessimistico)</Text>
                <Text style={[styles.statCardValue, { color: colors.negative }]}>€ {formatNumber(monteCarloResult.finalP10)}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statCardLabel}>Totale Versato</Text>
                <Text style={styles.statCardValue}>€ {formatNumber(monteCarloResult.totalInvested)}</Text>
              </View>
            </View>
          </View>
        )}

        {/* ==================================================== */}
        {/* TAB 5: COSTI & FEE DRAG                              */}
        {/* ==================================================== */}
        {activeTab === 'feedrag' && (
          <View style={styles.moduleSection}>
            <View style={styles.titleSection}>
              <Text style={styles.mainTitle}>Impatto dei Costi di Gestione (TER)</Text>
              <Text style={styles.mainSubtitle}>
                Confronta l&apos;effetto a lungo termine di uno strumento a basso costo (ETF) rispetto a un fondo comune tradizionale.
              </Text>
            </View>

            <View style={styles.inputCard}>
              <Text style={styles.fieldHeading}>Commissione ETF a basso costo: {lowCostTER}% TER</Text>
              <PacSlider
                value={lowCostTER}
                min={0.05}
                max={0.80}
                step={0.05}
                minLabel="0.05%"
                maxLabel="0.80%"
                onChange={setLowCostTER}
              />
            </View>

            <View style={styles.inputCard}>
              <Text style={styles.fieldHeading}>Commissione Fondo Bancario: {highCostTER}% TER</Text>
              <PacSlider
                value={highCostTER}
                min={1.0}
                max={3.0}
                step={0.1}
                minLabel="1.00%"
                maxLabel="3.00%"
                onChange={setHighCostTER}
              />
            </View>

            <FeeDragComparisonChart
              baseParams={pacParams}
              lowCostTER={lowCostTER}
              highCostTER={highCostTER}
              height={260}
            />

            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <Text style={styles.statCardLabel}>Capitale Finale con ETF</Text>
                <Text style={[styles.statCardValue, { color: colors.positive }]}>€ {formatNumber(feeDragResult.lowCostBalance)}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statCardLabel}>Capitale con Fondo Banca</Text>
                <Text style={styles.statCardValue}>€ {formatNumber(feeDragResult.highCostBalance)}</Text>
              </View>
            </View>
          </View>
        )}

        {/* ==================================================== */}
        {/* TAB 6: FIRE                                          */}
        {/* ==================================================== */}
        {activeTab === 'fire' && (
          <View style={styles.moduleSection}>
            <View style={styles.titleSection}>
              <Text style={styles.mainTitle}>Indipendenza Finanziaria (FIRE Calculator)</Text>
              <Text style={styles.mainSubtitle}>
                Calcola il capitale necessario per vivere di rendita perpetua secondo la Regola del 4% (Trinity Study).
              </Text>
            </View>

            <View style={styles.inputCard}>
              <Text style={styles.fieldHeading}>Spese Mensili Desiderate per Vivere di Rendita</Text>
              <View style={styles.bbvaInputBox}>
                <Text style={styles.floatingLabel}>Spesa mensile (€/mese)</Text>
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.bbvaTextInput}
                    value={fireMonthlyExpensesStr}
                    onChangeText={setFireMonthlyExpensesStr}
                    keyboardType="numeric"
                    placeholder="2000"
                    placeholderTextColor={colors.textSecondary}
                  />
                  <Text style={styles.currencySuffix}>€ / mese</Text>
                </View>
              </View>
              <View style={styles.presetRow}>
                {[1500, 2000, 2500, 3000, 4000].map((val) => (
                  <TouchableOpacity
                    key={val}
                    style={[styles.presetChip, fireMonthlyExpenses === val && styles.presetChipActive]}
                    onPress={() => setPresetFireExpenses(val)}
                  >
                    <Text style={[styles.presetChipText, fireMonthlyExpenses === val && styles.presetChipTextActive]}>
                      {val} €
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.inputCard}>
              <Text style={styles.fieldHeading}>Tasso di Prelievo Sicuro (Safe Withdrawal Rate): {fireSWR}%</Text>
              <PacSlider
                value={fireSWR}
                min={3.0}
                max={5.0}
                step={0.25}
                minLabel="3.0% (Molto Prudente)"
                maxLabel="5.0% (Aggressivo)"
                onChange={setFireSWR}
              />
            </View>

            <View style={styles.heroResultCard}>
              <Text style={styles.heroResultSub}>Capitale FIRE necessario per €{formatNumber(fireMonthlyExpenses)}/mese:</Text>
              <Text style={[styles.heroResultMain, { color: colors.warning }]}>
                € {formatNumber(fireResult.targetFireCapital)}
              </Text>
              <View style={styles.heroResultDivider} />
              <View style={styles.heroResultRow}>
                <Text style={styles.heroResultRowLabel}>Anni di PAC necessari con €{periodicAmount}/mese:</Text>
                <Text style={[styles.heroResultRowVal, { color: colors.positive }]}>
                  {fireResult.yearsToFIREWithPac} Anni
                </Text>
              </View>
              <View style={styles.heroResultRow}>
                <Text style={styles.heroResultRowLabel}>Rendita mensile sostenibile dal tuo PAC a 25y:</Text>
                <Text style={styles.heroResultRowVal}>€ {formatNumber((result.finalBalance * (fireSWR / 100)) / 12)} / mese</Text>
              </View>
            </View>
          </View>
        )}

        {/* ==================================================== */}
        {/* TAB 7: SCALABLE SAVINGS PLANS & REBALANCING          */}
        {/* ==================================================== */}
        {activeTab === 'scalable_plans' && (
          <View style={styles.moduleSection}>
            <View style={styles.titleSection}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Cpu size={24} color={colors.scalable} style={{ marginRight: 8 }} />
                <Text style={styles.mainTitle}>Piani di Accumulo Scalable</Text>
              </View>
              <Text style={styles.mainSubtitle}>
                Analisi dell&apos;allocazione e ribilanciamento automatico tramite flussi di cassa (Smart DCA Rebalancing).
              </Text>
            </View>

            {/* Overview Card */}
            <View style={[styles.heroResultCard, { backgroundColor: colors.scalableSurface, borderColor: colors.scalable }]}>
              <Text style={styles.heroResultSub}>Totale PAC Mensile Programmato:</Text>
              <Text style={[styles.heroResultMain, { color: colors.scalable }]}>
                € {formatNumber(scalableTotalMonthly)} / mese
              </Text>
              <View style={styles.heroResultDivider} />
              <View style={styles.heroResultRow}>
                <Text style={styles.heroResultRowLabel}>Piani attivi sul broker:</Text>
                <Text style={[styles.heroResultRowVal, { color: colors.scalable }]}>
                  {scalablePlans.length} strumenti ETF/Azioni
                </Text>
              </View>
              <View style={styles.heroResultRow}>
                <Text style={styles.heroResultRowLabel}>Giorno addebito ricorrente:</Text>
                <Text style={styles.heroResultRowVal}>2 del mese</Text>
              </View>
            </View>

            {/* Rebalancing Suggestion Card */}
            <View style={styles.inputCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <Sliders size={18} color={rebalanceAnalysis.rebalancingNeeded ? colors.warning : colors.scalable} style={{ marginRight: 8 }} />
                <Text style={[styles.fieldHeading, { marginBottom: 0 }]}>
                  Ribilanciamento Intelligente Flussi di Cassa
                </Text>
              </View>
              <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 14, lineHeight: 18 }}>
                {rebalanceAnalysis.summaryMessage}
              </Text>

              {/* Items List */}
              {rebalanceAnalysis.items.map((item) => {
                const isUnder = item.status === 'underweight';
                const isOver = item.status === 'overweight';
                const statusColor = isUnder ? colors.positive : isOver ? colors.warning : colors.textSecondary;
                const statusBadge = isUnder ? 'Sottopesato' : isOver ? 'Sovrapesato' : 'In Linea';

                return (
                  <View key={item.id} style={styles.rebalancePlanRow}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={styles.rebalancePlanSymbol}>{item.symbol}</Text>
                        <View style={[styles.statusMiniBadge, { backgroundColor: withAlpha(statusColor, 0.125) }]}>
                          <Text style={[styles.statusMiniBadgeText, { color: statusColor }]}>
                            {statusBadge}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.rebalancePlanName} numberOfLines={1}>{item.name}</Text>
                      <Text style={styles.rebalanceWeightsText}>
                        Peso attuale: {formatNumber(item.currentWeightPercent)}% • Target: {formatNumber(item.targetWeightPercent)}%
                      </Text>
                    </View>

                    <View style={{ alignItems: 'flex-end', marginLeft: 12 }}>
                      <Text style={styles.rebalanceCurrentAmount}>
                        Attuale: €{formatNumber(item.currentAmount)}
                      </Text>
                      <Text style={[styles.rebalanceSuggestedAmount, { color: statusColor }]}>
                        Suggerito: €{formatNumber(item.suggestedAmount)}
                      </Text>
                      {item.diffAmount !== 0 && (
                        <Text style={[styles.rebalanceDiffText, { color: statusColor }]}>
                          ({item.diffAmount > 0 ? '+' : ''}€{formatNumber(item.diffAmount)})
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })}

              <View style={styles.rebalanceTaxBenefitBox}>
                <CheckCircle2 size={16} color={colors.positive} style={{ marginRight: 8, marginTop: 2 }} />
                <Text style={styles.rebalanceTaxBenefitText}>
                  Vantaggio fiscale: il ribilanciamento incrementale convoglia la nuova liquidità negli asset rimasti indietro, evitando vendite forzate e tassazione immediata del 26%.
                </Text>
              </View>

              <TouchableOpacity
                style={styles.simulatePacButton}
                onPress={() => {
                  setPeriodicAmountStr(scalableTotalMonthly.toString());
                  setFrequency('monthly');
                  setActiveTab('pac');
                }}
              >
                <TrendingUp size={16} color={colors.onAccent} style={{ marginRight: 6 }} />
                <Text style={styles.simulatePacButtonText}>
                  Simula questo PAC a lungo termine nel Calcolatore
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Disclaimer Box */}
        <View style={styles.disclaimerBox}>
          <Text style={styles.disclaimerText}>
            Il simulatore ha finalità puramente illustrativa ed educativa: le stime ipotizzano rendimenti medi costanti o distribuzioni statistiche e non costituiscono garanzia di rendimenti futuri. Gli investimenti comportano rischi di perdita del capitale.
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Frequency Modal (Accumulation) */}
      <Modal
        visible={showFreqModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowFreqModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowFreqModal(false)}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Frequenza Versamenti</Text>
            {FREQUENCIES.map((f, idx) => (
              <TouchableOpacity
                key={f.value}
                style={[
                  styles.modalOption,
                  idx === FREQUENCIES.length - 1 && { borderBottomWidth: 0 },
                ]}
                onPress={() => {
                  setFrequency(f.value);
                  setShowFreqModal(false);
                }}
              >
                <Text style={styles.modalOptionText}>{f.label}</Text>
                {frequency === f.value && <Check size={20} color={colors.positive} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Frequency Modal (Withdrawal) */}
      <Modal
        visible={showWithFreqModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowWithFreqModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowWithFreqModal(false)}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Frequenza Prelievi</Text>
            {FREQUENCIES.map((f, idx) => (
              <TouchableOpacity
                key={f.value}
                style={[
                  styles.modalOption,
                  idx === FREQUENCIES.length - 1 && { borderBottomWidth: 0 },
                ]}
                onPress={() => {
                  setWithdrawalFrequency(f.value);
                  setShowWithFreqModal(false);
                }}
              >
                <Text style={styles.modalOptionText}>{f.label}</Text>
                {withdrawalFrequency === f.value && <Check size={20} color={colors.chartWithdrawal} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Saved Simulations & Export Modal */}
      <SavedPacModal
        visible={showSavedModal}
        onClose={() => setShowSavedModal(false)}
        currentParams={pacParams}
        currentFinalBalance={result.finalBalance}
        currentYearlyData={result.yearlyData}
        onLoadSimulation={handleLoadSavedSimulation}
      />
    </SafeAreaView>
  );
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backButton: {
      width: 40,
      height: 40,
      justifyContent: 'center',
      alignItems: 'flex-start',
    },
    headerTitle: {
      color: colors.text,
      fontSize: 18,
      fontWeight: 'bold',
    },
    headerActionBtn: {
      width: 40,
      height: 40,
      justifyContent: 'center',
      alignItems: 'flex-end',
    },
    tabsScrollBar: {
      maxHeight: 52,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.card,
    },
    tabsContainer: {
      flexDirection: 'row',
      paddingHorizontal: 12,
      paddingVertical: 8,
      gap: 8,
      alignItems: 'center',
    },
    tabItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 20,
      backgroundColor: colors.inputBackground,
      borderWidth: 1,
      borderColor: colors.border,
    },
    tabItemActive: {
      backgroundColor: colors.selection,
      borderColor: colors.selection,
    },
    tabItemText: {
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: '600',
    },
    tabItemTextActive: {
      color: colors.onStrong,
      fontWeight: 'bold',
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      padding: 16,
    },
    titleSection: {
      marginBottom: 18,
      marginTop: 4,
    },
    mainTitle: {
      color: colors.text,
      fontSize: 22,
      fontWeight: 'bold',
      lineHeight: 28,
      marginBottom: 6,
    },
    mainSubtitle: {
      color: colors.textSecondary,
      fontSize: 14,
      lineHeight: 20,
    },
    moduleSection: {
      marginBottom: 10,
    },
    phaseHeaderBox: {
      backgroundColor: colors.inputBackground,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
      marginBottom: 14,
    },
    phaseHeaderTitle: {
      color: colors.text,
      fontSize: 13,
      fontWeight: 'bold',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    inputCard: {
      marginBottom: 16,
    },
    fieldHeading: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '600',
      marginBottom: 8,
    },
    bbvaInputBox: {
      backgroundColor: colors.card,
      borderRadius: 8,
      borderWidth: 1.5,
      borderColor: colors.border,
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 8,
    },
    bbvaSelectBox: {
      backgroundColor: colors.card,
      borderRadius: 8,
      borderWidth: 1.5,
      borderColor: colors.border,
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 8,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    floatingLabel: {
      color: colors.textSecondary,
      fontSize: 11,
      marginBottom: 2,
    },
    selectValueText: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '600',
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    bbvaTextInput: {
      color: colors.text,
      fontSize: 17,
      fontWeight: 'bold',
      flex: 1,
      padding: 0,
    },
    currencySuffix: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '600',
      marginLeft: 8,
    },
    minInfoText: {
      color: colors.textSecondary,
      fontSize: 11,
      marginTop: 4,
      marginLeft: 4,
    },
    presetRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 8,
    },
    presetChip: {
      backgroundColor: colors.card,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    presetChipActive: {
      borderColor: colors.positive,
      backgroundColor: withAlpha(colors.positive, 0.1),
    },
    presetChipText: {
      color: colors.text,
      fontSize: 12,
      fontWeight: '500',
    },
    presetChipTextActive: {
      color: colors.positive,
      fontWeight: 'bold',
    },
    inflationSectionCard: {
      backgroundColor: colors.card,
      borderRadius: 14,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1.5,
      borderColor: colors.warning,
    },
    inflationSectionTitle: {
      color: colors.text,
      fontSize: 15,
      fontWeight: 'bold',
    },
    inflationDesc: {
      color: colors.textSecondary,
      fontSize: 12,
      lineHeight: 16,
      marginBottom: 12,
      marginTop: 2,
    },
    switchRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 6,
    },
    switchLabel: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '600',
      marginBottom: 2,
    },
    helperText: {
      color: colors.textSecondary,
      fontSize: 11,
      lineHeight: 15,
    },
    withdrawalToggleCard: {
      backgroundColor: colors.card,
      borderRadius: 14,
      padding: 14,
      marginBottom: 16,
      borderWidth: 1.5,
      borderColor: colors.chartWithdrawal,
    },
    withdrawalToggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    withdrawalToggleTitle: {
      color: colors.text,
      fontSize: 15,
      fontWeight: 'bold',
    },
    withdrawalToggleSubtitle: {
      color: colors.textSecondary,
      fontSize: 12,
      lineHeight: 16,
    },
    withdrawalSection: {
      marginBottom: 10,
    },
    todayEuroSwitchCard: {
      backgroundColor: colors.inputBackground,
      borderRadius: 12,
      padding: 14,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: withAlpha(colors.chartWithdrawal, 0.3),
    },
    startingWithdrawalBadge: {
      backgroundColor: withAlpha(colors.chartWithdrawal, 0.12),
      borderRadius: 8,
      padding: 10,
      marginTop: 10,
      borderWidth: 1,
      borderColor: withAlpha(colors.chartWithdrawal, 0.25),
    },
    startingWithdrawalText: {
      color: colors.text,
      fontSize: 12,
      lineHeight: 17,
    },
    warningCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: withAlpha(colors.negative, 0.1),
      borderWidth: 1,
      borderColor: colors.negative,
      borderRadius: 12,
      padding: 12,
      marginTop: 6,
      marginBottom: 14,
    },
    warningTitle: {
      color: colors.negative,
      fontSize: 13,
      fontWeight: 'bold',
      marginBottom: 2,
    },
    warningText: {
      color: colors.text,
      fontSize: 12,
      lineHeight: 16,
    },
    taxSectionCard: {
      backgroundColor: colors.card,
      borderRadius: 14,
      padding: 14,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    taxSectionTitle: {
      color: colors.text,
      fontSize: 15,
      fontWeight: 'bold',
    },
    taxRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    taxLabel: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '600',
      marginBottom: 2,
    },
    taxDesc: {
      color: colors.textSecondary,
      fontSize: 11,
      lineHeight: 15,
    },
    viewModeToggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.card,
      padding: 14,
      borderRadius: 12,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    viewModeTitle: {
      color: colors.text,
      fontSize: 14,
      fontWeight: 'bold',
      marginBottom: 2,
    },
    viewModeSubtitle: {
      color: colors.textSecondary,
      fontSize: 11,
      lineHeight: 15,
    },
    viewModeBtn: {
      backgroundColor: colors.inputBackground,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
      marginLeft: 8,
    },
    viewModeBtnActive: {
      backgroundColor: colors.warning,
      borderColor: colors.warning,
    },
    viewModeBtnText: {
      color: colors.text,
      fontSize: 12,
      fontWeight: 'bold',
    },
    viewModeBtnTextActive: {
      color: colors.onAccent,
      fontWeight: 'bold',
    },
    resultsHeaderSection: {
      marginTop: 8,
      marginBottom: 8,
    },
    resultsSectionTitle: {
      color: colors.text,
      fontSize: 20,
      fontWeight: 'bold',
    },
    statsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      marginTop: 14,
      gap: 10,
    },
    statCard: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 12,
      width: '48%',
      borderWidth: 1,
      borderColor: colors.border,
    },
    statCardHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 6,
      minHeight: 30,
    },
    statDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      marginRight: 6,
      marginTop: 3,
    },
    multiDotGroup: {
      flexDirection: 'row',
      marginRight: 6,
      marginTop: 4,
      gap: 2,
    },
    miniDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    statCardLabel: {
      color: colors.textSecondary,
      fontSize: 11,
      flex: 1,
      lineHeight: 15,
    },
    statCardValue: {
      color: colors.text,
      fontSize: 16,
      fontWeight: 'bold',
    },
    dutyInfoBadge: {
      backgroundColor: colors.inputBackground,
      borderRadius: 8,
      padding: 10,
      marginTop: 10,
      alignItems: 'center',
    },
    dutyInfoText: {
      color: colors.textSecondary,
      fontSize: 12,
    },
    toggleTableBtn: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 12,
      alignItems: 'center',
      marginTop: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    toggleTableBtnText: {
      color: colors.primary,
      fontSize: 13,
      fontWeight: '600',
    },
    tableCard: {
      backgroundColor: colors.card,
      borderRadius: 12,
      marginTop: 10,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    tableHeaderRow: {
      flexDirection: 'row',
      backgroundColor: colors.inputBackground,
      paddingVertical: 8,
      paddingHorizontal: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      alignItems: 'center',
    },
    tableRow: {
      flexDirection: 'row',
      paddingVertical: 8,
      paddingHorizontal: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      alignItems: 'center',
    },
    tableCell: {
      flex: 1,
      color: colors.text,
      fontSize: 10.5,
    },
    tableHeaderCell: {
      color: colors.textSecondary,
      fontWeight: '600',
    },
    numCell: {
      textAlign: 'right',
    },
    modeSwitchBox: {
      flexDirection: 'row',
      backgroundColor: colors.card,
      borderRadius: 10,
      padding: 4,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    modeSwitchBtn: {
      flex: 1,
      paddingVertical: 10,
      alignItems: 'center',
      borderRadius: 8,
    },
    modeSwitchBtnActive: {
      backgroundColor: colors.selection,
    },
    modeSwitchText: {
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: '600',
    },
    modeSwitchTextActive: {
      color: colors.onStrong,
      fontWeight: 'bold',
    },
    heroResultCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 18,
      borderWidth: 1.5,
      borderColor: colors.border,
      marginBottom: 16,
    },
    heroResultSub: {
      color: colors.textSecondary,
      fontSize: 13,
      marginBottom: 6,
    },
    heroResultMain: {
      color: colors.positive,
      fontSize: 28,
      fontWeight: 'bold',
      marginBottom: 12,
    },
    heroResultDivider: {
      height: 1,
      backgroundColor: colors.border,
      marginBottom: 12,
    },
    heroResultRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 6,
    },
    heroResultRowLabel: {
      color: colors.textSecondary,
      fontSize: 13,
    },
    heroResultRowVal: {
      color: colors.text,
      fontSize: 14,
      fontWeight: 'bold',
    },
    scenarioCard: {
      backgroundColor: colors.card,
      borderRadius: 14,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    scenarioCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
    },
    scenarioTitle: {
      color: colors.text,
      fontSize: 14,
      fontWeight: 'bold',
    },
    scenarioValue: {
      color: colors.text,
      fontSize: 22,
      fontWeight: 'bold',
      marginBottom: 4,
    },
    scenarioSub: {
      color: colors.textSecondary,
      fontSize: 12,
    },
    disclaimerBox: {
      backgroundColor: 'transparent',
      marginTop: 20,
      paddingHorizontal: 4,
    },
    disclaimerText: {
      color: colors.textSecondary,
      fontSize: 11,
      lineHeight: 16,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 24,
      paddingBottom: 48,
    },
    modalTitle: {
      color: colors.text,
      fontSize: 18,
      fontWeight: 'bold',
      marginBottom: 16,
    },
    modalOption: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    modalOptionText: {
      color: colors.text,
      fontSize: 16,
    },
    scalablePacSyncBanner: {
      backgroundColor: colors.scalableSurface,
      borderRadius: 14,
      padding: 14,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: withAlpha(colors.scalable, 0.376),
    },
    scalablePacBadgeIcon: {
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: withAlpha(colors.scalable, 0.125),
      alignItems: 'center',
      justifyContent: 'center',
    },
    scalablePacBannerTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.text,
    },
    scalablePacBannerSubtitle: {
      fontSize: 12,
      color: colors.scalable,
      marginTop: 2,
    },
    scalablePacImportBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.scalable,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    scalablePacImportBtnText: {
      color: colors.onAccent,
      fontSize: 12,
      fontWeight: '700',
    },
    scalablePacRebalanceBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'transparent',
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderWidth: 1,
      borderColor: colors.scalable,
    },
    scalablePacRebalanceBtnText: {
      color: colors.scalable,
      fontSize: 12,
      fontWeight: '600',
    },
    rebalancePlanRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    rebalancePlanSymbol: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text,
      marginRight: 6,
    },
    statusMiniBadge: {
      borderRadius: 4,
      paddingHorizontal: 5,
      paddingVertical: 1,
    },
    statusMiniBadgeText: {
      fontSize: 10,
      fontWeight: '700',
    },
    rebalancePlanName: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    rebalanceWeightsText: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 3,
    },
    rebalanceCurrentAmount: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    rebalanceSuggestedAmount: {
      fontSize: 13,
      fontWeight: '700',
      marginTop: 2,
    },
    rebalanceDiffText: {
      fontSize: 11,
      fontWeight: '600',
      marginTop: 1,
    },
    rebalanceTaxBenefitBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: colors.inputBackground,
      borderRadius: 10,
      padding: 12,
      marginTop: 14,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    rebalanceTaxBenefitText: {
      fontSize: 11,
      color: colors.textSecondary,
      flex: 1,
      lineHeight: 16,
    },
    simulatePacButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.scalable,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 16,
    },
    simulatePacButtonText: {
      color: colors.onAccent,
      fontSize: 13,
      fontWeight: '700',
    },
  });
