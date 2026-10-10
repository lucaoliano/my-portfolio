import { ThemeColors, withAlpha } from '../theme/colors';
import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
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
} from 'lucide-react-native';

import { useAppTheme } from '../theme/ThemeContext';
import { formatNumber, formatDecimal, formatSignedCurrency } from '../utils/formatters';
import {
  calculatePAC,
  calculateGoalSeekerPeriodic,
  calculateGoalSeekerYears,
  calculateScenarios,
  calculateMonteCarlo,
  calculateFIRE,
  accumulationOnly,
  getPeriodsPerYear,
  GOAL_SEEKER_MAX_YEARS,
  FIRE_MAX_YEARS,
  SCENARIO_SPREAD,
  PacParams,
  ContributionFrequency,
  PacResult,
} from '../utils/pacCalculator';
import { PacGrowthChart } from '../components/PacGrowthChart';
import { PacSlider } from '../components/PacSlider';
import { MonteCarloChart } from '../components/MonteCarloChart';
import { FeeDragComparisonChart } from '../components/FeeDragComparisonChart';
import { SavedPacModal } from '../components/SavedPacModal';
import { NumericField } from '../components/pac/NumericField';

import { auth } from '../config/firebase';
import { useTransactions } from '../hooks/useTransactions';
import { useScalableSavingsPlans } from '../hooks/useScalableSavingsPlans';
import { calculatePacRebalancing } from '../utils/savingsPlansRebalance';
import { calculatePosition } from '../utils/portfolioAggregator';

const FREQUENCIES: { label: string; value: ContributionFrequency; period: string }[] = [
  { label: 'Mensile', value: 'monthly', period: 'mese' },
  { label: 'Bimestrale', value: 'bimonthly', period: 'bimestre' },
  { label: 'Trimestrale', value: 'quarterly', period: 'trimestre' },
  { label: 'Semestrale', value: 'semiannually', period: 'semestre' },
  { label: 'Annuale', value: 'annually', period: 'anno' },
];

const MONTE_CARLO_ITERATIONS = 2000;
const TAX_RATE = 26;
const STAMP_DUTY_RATE = 0.2;

type ActiveTab = 'pac' | 'goal' | 'scenarios' | 'montecarlo' | 'feedrag' | 'fire' | 'scalable_plans';

/** Un solo stile per gli importi: €1.234,56 */
const eur = (value: number) => `€${formatNumber(value)}`;

/** Importo tondo per i chip di scelta rapida: €1.000 */
const eurShort = (value: number) => `€${formatDecimal(value, 0)}`;

/** Percentuale nel formato locale con i decimali che servono davvero (7%, 0,25%, 2,5%) */
const pct = (value: number) => {
  const digits = Number.isInteger(value) ? 0 : Number.isInteger(Math.round(value * 1000) / 100) ? 1 : 2;
  return `${formatDecimal(value, digits)}%`;
};

export default function PacCalculatorScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = getStyles(colors);

  const userId = auth.currentUser?.uid;
  const { transactions } = useTransactions(userId);
  const { plans: scalablePlans, totalMonthlyAmount: scalableTotalMonthly } = useScalableSavingsPlans(userId);

  // Pesi al costo di acquisto: questa schermata non carica le quotazioni di mercato
  const holdingsAtCost = useMemo(() => {
    const holdings: Record<string, { currentTotalValue: number }> = {};
    const symbolTxs: Record<string, typeof transactions> = {};

    transactions.forEach((tx) => {
      if (!symbolTxs[tx.symbol]) symbolTxs[tx.symbol] = [];
      symbolTxs[tx.symbol].push(tx);
    });

    Object.entries(symbolTxs).forEach(([symbol, txList]) => {
      const { totalQuantity, averagePrice } = calculatePosition(txList);
      holdings[symbol] = { currentTotalValue: totalQuantity * averagePrice };
    });

    return holdings;
  }, [transactions]);

  const rebalanceAnalysis = useMemo(() => {
    return calculatePacRebalancing(scalablePlans, holdingsAtCost);
  }, [scalablePlans, holdingsAtCost]);

  const [activeTab, setActiveTab] = useState<ActiveTab>('pac');

  // Accumulation Phase Inputs
  const [initialAmount, setInitialAmount] = useState(1);
  const [periodicAmount, setPeriodicAmount] = useState(500);
  const [frequency, setFrequency] = useState<ContributionFrequency>('monthly');
  const [years, setYears] = useState<number>(25);
  const [startingAge, setStartingAge] = useState<number>(30);
  const [expectedReturn, setExpectedReturn] = useState<number>(7);
  const [annualStepUp, setAnnualStepUp] = useState(0);

  // Inflation Settings
  const [inflationRate, setInflationRate] = useState<number>(2.0);
  const [autoAdjustAccumulation, setAutoAdjustAccumulation] = useState(false);

  // Taxes & Stamp Duty
  const [applyStampDuty, setApplyStampDuty] = useState(true);
  const [applyTaxes, setApplyTaxes] = useState(false);

  // View Mode: Nominal vs Real (Today's Purchasing Power)
  const [displayRealValues, setDisplayRealValues] = useState(false);

  // Withdrawal Phase Inputs (Decumulo / Rendita)
  const [enableWithdrawal, setEnableWithdrawal] = useState(false);
  const [withdrawalYears, setWithdrawalYears] = useState<number>(15);
  const [withdrawalAmount, setWithdrawalAmount] = useState(1000);
  const [withdrawalFrequency, setWithdrawalFrequency] = useState<ContributionFrequency>('monthly');
  const [withdrawalReturn, setWithdrawalReturn] = useState<number>(5);
  const [withdrawalInTodayEuros, setWithdrawalInTodayEuros] = useState(true);

  // Goal Seeker State
  const [targetGoal, setTargetGoal] = useState(200000);
  const [goalMode, setGoalMode] = useState<'periodic' | 'years'>('periodic');

  // Monte Carlo State
  const [volatility, setVolatility] = useState<number>(15);

  // Fee Drag State
  const [lowCostTER, setLowCostTER] = useState<number>(0.20);
  const [highCostTER, setHighCostTER] = useState<number>(1.80);

  // FIRE State
  const [fireMonthlyExpenses, setFireMonthlyExpenses] = useState(2000);
  const [fireSWR, setFireSWR] = useState<number>(4.0);

  // Modals & UI Toggles
  const [showFreqModal, setShowFreqModal] = useState(false);
  const [showWithFreqModal, setShowWithFreqModal] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const [showSavedModal, setShowSavedModal] = useState(false);

  const accYears = Math.max(1, Math.min(35, years));
  const accReturn = Math.max(0, Math.min(25, expectedReturn));

  const pacParams: PacParams = {
    initialAmount,
    periodicAmount,
    frequency,
    years: accYears,
    startingAge: Math.max(18, Math.min(80, startingAge)),
    expectedAnnualReturn: accReturn,
    annualStepUp,
    inflationRate,
    autoAdjustAccumulationToInflation: autoAdjustAccumulation,
    applyTaxes,
    taxRate: TAX_RATE,
    applyStampDuty,
    stampDutyRate: STAMP_DUTY_RATE,
    withdrawalConfig: {
      enabled: enableWithdrawal,
      durationYears: Math.max(1, Math.min(35, withdrawalYears)),
      periodicAmount: withdrawalAmount,
      frequency: withdrawalFrequency,
      expectedAnnualReturn: Math.max(0, Math.min(25, withdrawalReturn)),
      withdrawalInTodayEuros,
    },
  };
  // Scenari, costi, Monte Carlo e FIRE confrontano il capitale a fine accumulo, non dopo i prelievi
  const accumulationParams = accumulationOnly(pacParams);

  const result: PacResult = calculatePAC(pacParams);

  const goalPeriodicResult = calculateGoalSeekerPeriodic(
    targetGoal,
    accYears,
    accReturn,
    initialAmount,
    frequency,
    applyStampDuty
  );
  const goalYearsResult = calculateGoalSeekerYears(
    targetGoal,
    periodicAmount,
    accReturn,
    initialAmount,
    frequency,
    applyStampDuty
  );

  const scenariosResult = calculateScenarios(accumulationParams);

  const monteCarloResult = useMemo(
    () =>
      calculateMonteCarlo(
        {
          initialAmount,
          periodicAmount,
          frequency,
          years: accYears,
          expectedAnnualReturn: accReturn,
          annualStepUp,
          inflationRate,
          autoAdjustAccumulationToInflation: autoAdjustAccumulation,
          applyStampDuty,
          stampDutyRate: STAMP_DUTY_RATE,
        },
        volatility,
        MONTE_CARLO_ITERATIONS
      ),
    [initialAmount, periodicAmount, frequency, accYears, accReturn, annualStepUp, inflationRate, autoAdjustAccumulation, applyStampDuty, volatility]
  );

  // FIRE: dal capitale di oggi con il versamento mensile equivalente, obiettivo in euro di oggi
  const monthlyEquivalentContribution = (periodicAmount * getPeriodsPerYear(frequency)) / 12;
  const fireResult = calculateFIRE(fireMonthlyExpenses, initialAmount, monthlyEquivalentContribution, accReturn, fireSWR, {
    inflationRate,
    applyStampDuty,
    stampDutyRate: STAMP_DUTY_RATE,
  });

  const getFreq = (val: ContributionFrequency) => FREQUENCIES.find((f) => f.value === val) ?? FREQUENCIES[0];
  const getFreqLabel = (val: ContributionFrequency) => getFreq(val).label;
  const perPeriod = (val: ContributionFrequency) => `/ ${getFreq(val).period}`;

  const currentYear = new Date().getFullYear();
  const accumulationEndYear = currentYear + accYears;

  // Valore a fine accumulo, coerente con le impostazioni di vista (nominale/reale) e imposte
  const peakNominal = applyTaxes && result.netPeakBalance !== undefined ? result.netPeakBalance : result.peakBalance;
  const peakReal = applyTaxes && result.realNetPeakBalance !== undefined ? result.realNetPeakBalance : result.realPeakBalance;
  const heroValue = displayRealValues ? peakReal : peakNominal;
  const investedShown = displayRealValues ? result.realTotalInvestedAtPeak : result.totalInvested;
  const estimatedGain = heroValue - investedShown;

  const finalNominal = applyTaxes && result.netFinalBalance !== undefined ? result.netFinalBalance : result.finalBalance;
  const finalReal = applyTaxes && result.realNetFinalBalance !== undefined ? result.realNetFinalBalance : result.realFinalBalance;
  const lastYearRow = result.yearlyData[result.yearlyData.length - 1];

  const assumptionsNote =
    `*Ipotesi: rendimento costante del ${pct(accReturn)} annuo, versamenti a fine periodo, inflazione ${pct(inflationRate)}` +
    (applyStampDuty ? `, bollo ${pct(STAMP_DUTY_RATE)} annuo` : '') +
    (applyTaxes ? `, imposta del ${TAX_RATE}% sulle plusvalenze` : ', senza imposta sulle plusvalenze') +
    '. Sono stime, non previsioni.';

  const switchColors = {
    trackColor: { false: colors.inputBorder, true: colors.selection },
    thumbColor: colors.card,
    // react-native-web usa activeThumbColor per il pallino acceso
    ...({ activeThumbColor: colors.onStrong } as object),
  };

  const handleLoadSavedSimulation = (loaded: PacParams) => {
    setInitialAmount(loaded.initialAmount);
    setPeriodicAmount(loaded.periodicAmount);
    setFrequency(loaded.frequency);
    setYears(loaded.years);
    if (loaded.startingAge) setStartingAge(loaded.startingAge);
    setExpectedReturn(loaded.expectedAnnualReturn);
    setAnnualStepUp(loaded.annualStepUp ?? 0);
    setInflationRate(loaded.inflationRate ?? 2.0);
    setAutoAdjustAccumulation(!!loaded.autoAdjustAccumulationToInflation);
    setApplyStampDuty(!!loaded.applyStampDuty);
    setApplyTaxes(!!loaded.applyTaxes);
    if (loaded.withdrawalConfig) {
      setEnableWithdrawal(loaded.withdrawalConfig.enabled);
      setWithdrawalYears(loaded.withdrawalConfig.durationYears);
      setWithdrawalAmount(loaded.withdrawalConfig.periodicAmount);
      setWithdrawalFrequency(loaded.withdrawalConfig.frequency);
      setWithdrawalReturn(loaded.withdrawalConfig.expectedAnnualReturn);
      setWithdrawalInTodayEuros(!!loaded.withdrawalConfig.withdrawalInTodayEuros);
    } else {
      setEnableWithdrawal(false);
    }
  };

  const renderPresetChip = (key: string | number, label: string, active: boolean, onPress: () => void) => (
    <TouchableOpacity
      key={key}
      style={[styles.presetChip, active && styles.presetChipActive]}
      onPress={onPress}
      role="button"
      {...({ 'aria-pressed': active } as object)}
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.presetChipText, active && styles.presetChipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );

  const TABS: { key: ActiveTab; label: string; Icon: typeof BarChart3 }[] = [
    { key: 'pac', label: 'PAC e rendita', Icon: BarChart3 },
    { key: 'goal', label: 'Obiettivo', Icon: Target },
    { key: 'scenarios', label: 'Scenari', Icon: TrendingUp },
    { key: 'montecarlo', label: 'Monte Carlo', Icon: Sliders },
    { key: 'feedrag', label: 'Costi e TER', Icon: Percent },
    { key: 'fire', label: 'FIRE', Icon: Flame },
  ];

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          role="button"
          aria-label="Indietro"
        >
          <ChevronLeft size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} role="heading">Pianificazione patrimoniale</Text>
        <TouchableOpacity
          style={styles.headerActionBtn}
          onPress={() => setShowSavedModal(true)}
          role="button"
          aria-label="Piani salvati ed esportazione"
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
        role="tablist"
      >
        {TABS.map(({ key, label, Icon }) => {
          const active = activeTab === key;
          return (
            <TouchableOpacity
              key={key}
              style={[styles.tabItem, active && styles.tabItemActive]}
              onPress={() => setActiveTab(key)}
              role="tab"
              aria-selected={active}
            >
              <Icon size={16} color={active ? colors.onStrong : colors.textSecondary} style={{ marginRight: 6 }} />
              <Text style={[styles.tabItemText, active && styles.tabItemTextActive]}>{label}</Text>
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity
          style={[
            styles.tabItem,
            activeTab === 'scalable_plans' && { backgroundColor: colors.scalableSurface, borderColor: colors.scalable },
          ]}
          onPress={() => setActiveTab('scalable_plans')}
          role="tab"
          aria-selected={activeTab === 'scalable_plans'}
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
              <Text style={styles.mainTitle} role="heading">Simula il tuo piano di accumulo (PAC)</Text>
              <Text style={styles.mainSubtitle}>
                Stima la crescita del capitale, l&apos;effetto dell&apos;inflazione e un&apos;eventuale fase di prelievo.
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
                      {scalablePlans.length} piani di accumulo sincronizzati da Scalable
                    </Text>
                    <Text style={styles.scalablePacBannerSubtitle}>
                      Totale programmato: {eur(scalableTotalMonthly)} / mese
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <TouchableOpacity
                    style={styles.scalablePacImportBtn}
                    onPress={() => {
                      setPeriodicAmount(scalableTotalMonthly);
                      setFrequency('monthly');
                    }}
                    role="button"
                  >
                    <Download size={14} color={colors.onAccent} style={{ marginRight: 4 }} />
                    <Text style={styles.scalablePacImportBtnText}>Usa {eur(scalableTotalMonthly)}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.scalablePacRebalanceBtn}
                    onPress={() => setActiveTab('scalable_plans')}
                    role="button"
                  >
                    <Sliders size={14} color={colors.scalable} style={{ marginRight: 4 }} />
                    <Text style={styles.scalablePacRebalanceBtnText}>Ribilanciamento</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Fase 1: Accumulo */}
            <View style={styles.phaseHeaderBox}>
              <Text style={styles.phaseHeaderTitle} role="heading">1. Fase di accumulo (versamenti)</Text>
            </View>

            {/* Iniziale */}
            <View style={styles.inputCard}>
              <Text style={styles.fieldHeading}>Qual è l&apos;importo iniziale che desideri investire?</Text>
              <View style={styles.bbvaInputBox}>
                <Text style={styles.floatingLabel}>Importo iniziale</Text>
                <View style={styles.inputRow}>
                  <NumericField
                    style={styles.bbvaTextInput}
                    value={initialAmount}
                    onChange={setInitialAmount}
                    min={0}
                    max={100_000_000}
                    isAmount
                    placeholder="0"
                    placeholderTextColor={colors.textSecondary}
                    aria-label="Importo iniziale in euro"
                  />
                  <Text style={styles.currencySuffix}>€</Text>
                </View>
              </View>
              <View style={styles.presetRow}>
                {[0, 1000, 5000].map((val) =>
                  renderPresetChip(val, eurShort(val), initialAmount === val, () => setInitialAmount(val))
                )}
              </View>
            </View>

            {/* Periodico */}
            <View style={styles.inputCard}>
              <Text style={styles.fieldHeading}>Quanto vuoi versare periodicamente?</Text>
              <View style={styles.bbvaInputBox}>
                <Text style={styles.floatingLabel}>Importo periodico</Text>
                <View style={styles.inputRow}>
                  <NumericField
                    style={styles.bbvaTextInput}
                    value={periodicAmount}
                    onChange={setPeriodicAmount}
                    min={0}
                    max={1_000_000}
                    isAmount
                    placeholder="50"
                    placeholderTextColor={colors.textSecondary}
                    aria-label="Importo periodico in euro"
                  />
                  <Text style={styles.currencySuffix}>€ {perPeriod(frequency)}</Text>
                </View>
              </View>
              <View style={styles.presetRow}>
                {[50, 100, 200, 500, 1000].map((val) =>
                  renderPresetChip(val, eurShort(val), periodicAmount === val, () => setPeriodicAmount(val))
                )}
              </View>
            </View>

            {/* Frequenza */}
            <View style={styles.inputCard}>
              <Text style={styles.fieldHeading}>Scegli la frequenza dei versamenti</Text>
              <TouchableOpacity
                style={styles.bbvaSelectBox}
                onPress={() => setShowFreqModal(true)}
                activeOpacity={0.7}
                role="button"
                aria-label={`Frequenza dei versamenti: ${getFreqLabel(frequency)}`}
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
                  <NumericField
                    style={styles.bbvaTextInput}
                    value={years}
                    onChange={setYears}
                    min={1}
                    max={35}
                    integer
                    aria-label="Durata dell'accumulo in anni"
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
                label="Durata dell'accumulo"
                formatValue={(v) => `${v} anni`}
              />
            </View>

            {/* Età a inizio piano */}
            <View style={styles.inputCard}>
              <Text style={styles.fieldHeading}>Quanti anni hai all&apos;inizio del piano?</Text>
              <View style={styles.bbvaInputBox}>
                <Text style={styles.floatingLabel}>Età attuale</Text>
                <View style={styles.inputRow}>
                  <NumericField
                    style={styles.bbvaTextInput}
                    value={startingAge}
                    onChange={setStartingAge}
                    min={18}
                    max={80}
                    integer
                    aria-label="Età attuale in anni"
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
                label="Età attuale"
                formatValue={(v) => `${v} anni`}
              />
              <View style={styles.presetRow}>
                {[20, 25, 30, 35, 40, 50].map((val) =>
                  renderPresetChip(val, `${val} anni`, startingAge === val, () => setStartingAge(val))
                )}
              </View>
            </View>

            {/* Rendimento */}
            <View style={styles.inputCard}>
              <Text style={styles.fieldHeading}>Che rendimento annuo ipotizzi?</Text>
              <View style={styles.bbvaInputBox}>
                <View style={styles.inputRow}>
                  <NumericField
                    style={styles.bbvaTextInput}
                    value={expectedReturn}
                    onChange={setExpectedReturn}
                    min={0}
                    max={25}
                    aria-label="Rendimento annuo ipotizzato in percentuale"
                  />
                  <Text style={styles.currencySuffix}>%</Text>
                </View>
              </View>
              <PacSlider
                value={expectedReturn}
                min={0}
                max={25}
                step={1}
                minLabel="Min. 0%"
                maxLabel="Max. 25%"
                onChange={setExpectedReturn}
                label="Rendimento annuo ipotizzato"
                formatValue={pct}
              />
            </View>

            {/* ==================================================== */}
            {/* INFLAZIONE & POTERE D'ACQUISTO                      */}
            {/* ==================================================== */}
            <View style={styles.sectionCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <Coins size={20} color={colors.textSecondary} style={{ marginRight: 8 }} />
                <Text style={styles.sectionCardTitle} role="heading">Inflazione e potere d&apos;acquisto</Text>
              </View>
              <Text style={styles.sectionCardDesc}>
                L&apos;inflazione riduce il potere d&apos;acquisto nel tempo. Imposta il tasso medio ipotizzato (l&apos;obiettivo BCE è il 2%).
              </Text>

              <View style={styles.inputCard}>
                <Text style={styles.fieldHeading}>Inflazione annua ipotizzata: {pct(inflationRate)}</Text>
                <PacSlider
                  value={inflationRate}
                  min={0}
                  max={6}
                  step={0.25}
                  minLabel="0%"
                  maxLabel="6%"
                  onChange={setInflationRate}
                  label="Inflazione annua ipotizzata"
                  formatValue={pct}
                />
              </View>

              <View style={styles.switchRow}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={styles.switchLabel}>Adegua i versamenti all&apos;inflazione</Text>
                  <Text style={styles.helperText}>
                    Aumenta la rata del {pct(inflationRate)} ogni anno, così il versamento resta costante in euro di oggi.
                  </Text>
                </View>
                <Switch
                  value={autoAdjustAccumulation}
                  onValueChange={setAutoAdjustAccumulation}
                  {...switchColors}
                  aria-label="Adegua i versamenti all'inflazione"
                  aria-checked={autoAdjustAccumulation}
                />
              </View>
            </View>

            {/* ==================================================== */}
            {/* FASE 2: DECUMULO (RENDITA INDICIZZATA)               */}
            {/* ==================================================== */}
            <View style={styles.sectionCard}>
              <View style={styles.withdrawalToggleRow}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                    <Wallet size={20} color={colors.textSecondary} style={{ marginRight: 8 }} />
                    <Text style={styles.sectionCardTitle}>Fase di prelievo (decumulo)</Text>
                  </View>
                  <Text style={styles.sectionCardDesc}>
                    Dopo {accYears} anni di versamenti, simula prelievi periodici dal capitale accumulato.
                  </Text>
                </View>
                <Switch
                  value={enableWithdrawal}
                  onValueChange={setEnableWithdrawal}
                  {...switchColors}
                  aria-label="Fase di prelievo"
                  aria-checked={enableWithdrawal}
                />
              </View>
            </View>

            {enableWithdrawal && (
              <View style={styles.withdrawalSection}>
                <View style={styles.phaseHeaderBox}>
                  <Text style={styles.phaseHeaderTitle} role="heading">
                    2. Prelievi (dal {accYears + 1}° anno)
                  </Text>
                </View>

                {/* Today's Euro Mode Switch */}
                <View style={styles.todayEuroSwitchCard}>
                  <View style={styles.switchRow}>
                    <View style={{ flex: 1, marginRight: 12 }}>
                      <Text style={styles.switchLabel}>Prelievo in euro di oggi</Text>
                      <Text style={styles.helperText}>
                        Se attivo, l&apos;importo inserito è espresso in potere d&apos;acquisto di oggi e viene rivalutato ogni anno all&apos;inflazione ipotizzata.
                      </Text>
                    </View>
                    <Switch
                      value={withdrawalInTodayEuros}
                      onValueChange={setWithdrawalInTodayEuros}
                      {...switchColors}
                      aria-label="Prelievo in euro di oggi"
                      aria-checked={withdrawalInTodayEuros}
                    />
                  </View>

                  {withdrawalInTodayEuros && result.startingNominalWithdrawal !== undefined && (
                    <View style={styles.startingWithdrawalBadge}>
                      <Text style={styles.startingWithdrawalText}>
                        Tra {accYears} anni, {eur(withdrawalAmount)} di oggi corrisponderanno a una prima rata nominale di{' '}
                        <Text style={{ fontWeight: 'bold' }}>{eur(result.startingNominalWithdrawal)} {perPeriod(withdrawalFrequency)}</Text>, poi rivalutata del {pct(inflationRate)} ogni anno.
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.inputCard}>
                  <Text style={styles.fieldHeading}>
                    {withdrawalInTodayEuros ? 'Importo di ogni prelievo, in euro di oggi' : 'Importo nominale di ogni prelievo'}
                  </Text>
                  <View style={styles.bbvaInputBox}>
                    <Text style={styles.floatingLabel}>Prelievo lordo</Text>
                    <View style={styles.inputRow}>
                      <NumericField
                        style={styles.bbvaTextInput}
                        value={withdrawalAmount}
                        onChange={setWithdrawalAmount}
                        min={0}
                        max={1_000_000}
                        isAmount
                        placeholder="1000"
                        placeholderTextColor={colors.textSecondary}
                        aria-label="Importo di ogni prelievo in euro"
                      />
                      <Text style={styles.currencySuffix}>€ {perPeriod(withdrawalFrequency)}</Text>
                    </View>
                  </View>
                  <View style={styles.presetRow}>
                    {[500, 1000, 1500, 2000, 3000].map((val) =>
                      renderPresetChip(val, eurShort(val), withdrawalAmount === val, () => setWithdrawalAmount(val))
                    )}
                  </View>
                </View>

                <View style={styles.inputCard}>
                  <Text style={styles.fieldHeading}>Frequenza di prelievo</Text>
                  <TouchableOpacity
                    style={styles.bbvaSelectBox}
                    onPress={() => setShowWithFreqModal(true)}
                    activeOpacity={0.7}
                    role="button"
                    aria-label={`Frequenza dei prelievi: ${getFreqLabel(withdrawalFrequency)}`}
                  >
                    <View>
                      <Text style={styles.floatingLabel}>Frequenza dei prelievi</Text>
                      <Text style={styles.selectValueText}>{getFreqLabel(withdrawalFrequency)}</Text>
                    </View>
                    <ChevronDown size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>

                <View style={styles.inputCard}>
                  <Text style={styles.fieldHeading}>Per quanti anni vuoi prelevare?</Text>
                  <View style={styles.bbvaInputBox}>
                    <View style={styles.inputRow}>
                      <NumericField
                        style={styles.bbvaTextInput}
                        value={withdrawalYears}
                        onChange={setWithdrawalYears}
                        min={1}
                        max={35}
                        integer
                        aria-label="Durata dei prelievi in anni"
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
                    label="Durata dei prelievi"
                    formatValue={(v) => `${v} anni`}
                  />
                </View>

                <View style={styles.inputCard}>
                  <Text style={styles.fieldHeading}>Rendimento annuo ipotizzato durante i prelievi</Text>
                  <View style={styles.bbvaInputBox}>
                    <View style={styles.inputRow}>
                      <NumericField
                        style={styles.bbvaTextInput}
                        value={withdrawalReturn}
                        onChange={setWithdrawalReturn}
                        min={0}
                        max={25}
                        aria-label="Rendimento annuo durante i prelievi in percentuale"
                      />
                      <Text style={styles.currencySuffix}>%</Text>
                    </View>
                  </View>
                  <PacSlider
                    value={withdrawalReturn}
                    min={0}
                    max={20}
                    step={1}
                    minLabel="Min. 0%"
                    maxLabel="Max. 20%"
                    onChange={setWithdrawalReturn}
                    label="Rendimento annuo durante i prelievi"
                    formatValue={pct}
                  />
                </View>

                {result.isDepleted && result.depletedYear !== undefined && (
                  <View style={styles.warningCard}>
                    <AlertTriangle size={22} color={colors.warning} style={{ marginRight: 12 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.warningTitle}>Capitale esaurito nel {currentYear + result.depletedYear}</Text>
                      <Text style={styles.warningText}>
                        Con prelievi di {eur(withdrawalAmount)} {perPeriod(withdrawalFrequency)}
                        {withdrawalInTodayEuros ? ` in euro di oggi, rivalutati del ${pct(inflationRate)} annuo,` : ''} il capitale stimato si esaurisce
                        dopo {result.depletedYear - accYears} anni di prelievi su {pacParams.withdrawalConfig?.durationYears} impostati.
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* Fiscalità */}
            <View style={styles.sectionCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <Landmark size={20} color={colors.textSecondary} style={{ marginRight: 8 }} />
                <Text style={styles.sectionCardTitle} role="heading">Parametri fiscali</Text>
              </View>

              <View style={styles.taxRow}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={styles.switchLabel}>Imposta di bollo ({pct(STAMP_DUTY_RATE)} annuo)</Text>
                  <Text style={styles.helperText}>
                    Detratta ogni anno sul controvalore del dossier titoli.
                  </Text>
                </View>
                <Switch
                  value={applyStampDuty}
                  onValueChange={setApplyStampDuty}
                  {...switchColors}
                  aria-label="Imposta di bollo"
                  aria-checked={applyStampDuty}
                />
              </View>

              <View style={[styles.taxRow, { borderBottomWidth: 0, paddingBottom: 0 }]}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={styles.switchLabel}>Imposta sulle plusvalenze ({TAX_RATE}%)</Text>
                  <Text style={styles.helperText}>
                    Mostra il valore al netto dell&apos;imposta sui guadagni; nei prelievi si applica alla sola quota di guadagno (costo medio).
                  </Text>
                </View>
                <Switch
                  value={applyTaxes}
                  onValueChange={setApplyTaxes}
                  {...switchColors}
                  aria-label="Imposta sulle plusvalenze"
                  aria-checked={applyTaxes}
                />
              </View>
            </View>

            {/* View Mode Toggle: Nominal vs Real */}
            <View style={styles.modeSwitchBox} role="tablist" aria-label="Valori mostrati">
              <TouchableOpacity
                style={[styles.modeSwitchBtn, !displayRealValues && styles.modeSwitchBtnActive]}
                onPress={() => setDisplayRealValues(false)}
                role="tab"
                aria-selected={!displayRealValues}
              >
                <Text style={[styles.modeSwitchText, !displayRealValues && styles.modeSwitchTextActive]}>Valori nominali</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeSwitchBtn, displayRealValues && styles.modeSwitchBtnActive]}
                onPress={() => setDisplayRealValues(true)}
                role="tab"
                aria-selected={displayRealValues}
              >
                <Text style={[styles.modeSwitchText, displayRealValues && styles.modeSwitchTextActive]}>Euro di oggi</Text>
              </TouchableOpacity>
            </View>

            {/* Risultato principale */}
            <View style={styles.heroResultCard}>
              <Text style={styles.heroResultSub}>
                Valore stimato a {accumulationEndYear}
                {displayRealValues ? ', in euro di oggi' : ''}
                {applyTaxes ? ', al netto delle imposte' : ''}*
              </Text>
              <Text style={styles.heroResultMain}>{eur(heroValue)}</Text>
              <View style={styles.heroResultDivider} />
              <View style={styles.heroResultRow}>
                <Text style={styles.heroResultRowLabel}>Totale versato{displayRealValues ? ' (euro di oggi)' : ''}</Text>
                <Text style={styles.heroResultRowVal}>{eur(investedShown)}</Text>
              </View>
              <View style={styles.heroResultRow}>
                <Text style={styles.heroResultRowLabel}>Guadagno stimato</Text>
                <Text style={[styles.heroResultRowVal, { color: estimatedGain >= 0 ? colors.positive : colors.negative }]}>
                  {formatSignedCurrency(estimatedGain)}
                </Text>
              </View>
              {!displayRealValues && (
                <View style={styles.heroResultRow}>
                  <Text style={styles.heroResultRowLabel}>Lo stesso valore in euro di oggi</Text>
                  <Text style={styles.heroResultRowVal}>{eur(peakReal)}</Text>
                </View>
              )}
              <Text style={styles.footnoteText}>{assumptionsNote}</Text>
            </View>

            {/* Grafico */}
            <View style={styles.resultsHeaderSection}>
              <Text style={styles.resultsSectionTitle} role="heading">
                {enableWithdrawal ? 'Evoluzione stimata: accumulo e prelievi' : 'Evoluzione stimata del PAC'}
              </Text>
            </View>

            <PacGrowthChart
              data={result.yearlyData}
              height={280}
              hasWithdrawalPhase={enableWithdrawal}
              accumulationYears={accYears}
              applyTaxes={applyTaxes}
              displayRealValues={displayRealValues}
              withdrawalPeriodLabel={perPeriod(withdrawalFrequency)}
            />

            {/* Metriche */}
            <View style={styles.statsGrid}>
              {enableWithdrawal ? (
                <>
                  <View style={styles.statCard}>
                    <View style={styles.statCardHeader}>
                      <View style={[styles.statDot, { backgroundColor: colors.chartWithdrawal }]} />
                      <Text style={styles.statCardLabel}>
                        Prelievi totali lordi{displayRealValues ? ' (euro di oggi)' : ''}
                      </Text>
                    </View>
                    <Text style={styles.statCardValue}>
                      {eur(displayRealValues ? result.realTotalWithdrawn : result.totalWithdrawn)}
                    </Text>
                    {!displayRealValues && (
                      <Text style={styles.statCardSub}>(oggi: {eur(result.realTotalWithdrawn)})</Text>
                    )}
                    {applyTaxes && !displayRealValues && (
                      <Text style={styles.statCardSub}>
                        Netti dopo imposta: {eur(result.netTotalWithdrawn)}
                      </Text>
                    )}
                  </View>

                  <View style={styles.statCard}>
                    <View style={styles.statCardHeader}>
                      <View style={[styles.statDot, { backgroundColor: colors.info }]} />
                      <Text style={styles.statCardLabel}>
                        Capitale residuo a {lastYearRow?.dateLabel ?? ''}{applyTaxes ? ', netto' : ''}{displayRealValues ? ' (euro di oggi)' : ''}
                      </Text>
                    </View>
                    <Text style={styles.statCardValue}>{eur(displayRealValues ? finalReal : finalNominal)}</Text>
                    {!displayRealValues && <Text style={styles.statCardSub}>(oggi: {eur(finalReal)})</Text>}
                  </View>

                  <View style={styles.statCard}>
                    <View style={styles.statCardHeader}>
                      <View style={[styles.statDot, { backgroundColor: colors.chartInvested }]} />
                      <Text style={styles.statCardLabel}>Totale versato{displayRealValues ? ' (euro di oggi)' : ''}</Text>
                    </View>
                    <Text style={styles.statCardValue}>{eur(investedShown)}</Text>
                  </View>

                  {result.startingNominalWithdrawal !== undefined && (
                    <View style={styles.statCard}>
                      <View style={styles.statCardHeader}>
                        <View style={[styles.statDot, { backgroundColor: colors.chartWithdrawal }]} />
                        <Text style={styles.statCardLabel}>Prima rata nominale</Text>
                      </View>
                      <Text style={styles.statCardValue}>
                        {eur(result.startingNominalWithdrawal)} {perPeriod(withdrawalFrequency)}
                      </Text>
                    </View>
                  )}
                </>
              ) : (
                <>
                  <View style={styles.statCard}>
                    <View style={styles.statCardHeader}>
                      <View style={[styles.statDot, { backgroundColor: colors.chartContributions }]} />
                      <Text style={styles.statCardLabel}>Versamento iniziale</Text>
                    </View>
                    <Text style={styles.statCardValue}>{eur(result.initialAmount)}</Text>
                  </View>

                  <View style={styles.statCard}>
                    <View style={styles.statCardHeader}>
                      <View style={[styles.statDot, { backgroundColor: colors.chartInvested }]} />
                      <Text style={styles.statCardLabel}>Versamenti periodici{displayRealValues ? ' (euro di oggi)' : ''}</Text>
                    </View>
                    <Text style={styles.statCardValue}>
                      {eur(displayRealValues ? result.realTotalInvestedAtPeak - result.initialAmount : result.totalPeriodicInvested)}
                    </Text>
                  </View>

                  <View style={styles.statCard}>
                    <View style={styles.statCardHeader}>
                      <View style={[styles.statDot, { backgroundColor: colors.chartGrowth }]} />
                      <Text style={styles.statCardLabel}>Rendimento stimato{applyTaxes ? ' netto' : ''}</Text>
                    </View>
                    <Text style={[styles.statCardValue, { color: estimatedGain >= 0 ? colors.positive : colors.negative }]}>
                      {formatSignedCurrency(estimatedGain)}
                    </Text>
                  </View>

                  <View style={styles.statCard}>
                    <View style={styles.statCardHeader}>
                      <View style={[styles.statDot, { backgroundColor: colors.textSecondary }]} />
                      <Text style={styles.statCardLabel}>Totale versato{displayRealValues ? ' (euro di oggi)' : ''}</Text>
                    </View>
                    <Text style={styles.statCardValue}>{eur(investedShown)}</Text>
                  </View>
                </>
              )}
            </View>

            {applyStampDuty && (
              <View style={styles.dutyInfoBadge}>
                <Text style={styles.dutyInfoText}>
                  Imposta di bollo stimata pagata negli anni: <Text style={{ fontWeight: 'bold', color: colors.text }}>{eur(result.totalStampDutyPaid)}</Text>
                </Text>
              </View>
            )}

            {/* Table View Toggle */}
            <TouchableOpacity
              style={styles.toggleTableBtn}
              onPress={() => setShowTable(!showTable)}
              role="button"
              aria-expanded={showTable}
            >
              <Text style={styles.toggleTableBtnText}>
                {showTable ? 'Nascondi la tabella anno per anno' : 'Mostra la tabella anno per anno'}
              </Text>
            </TouchableOpacity>

            {showTable && (
              <View style={styles.tableCard}>
                <View style={styles.tableHeaderRow}>
                  <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 0.7 }]}>Anno</Text>
                  <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 0.9 }]}>Fase</Text>
                  <Text style={[styles.tableCell, styles.tableHeaderCell, styles.numCell, { flex: 1.2 }]}>Movimento</Text>
                  <Text style={[styles.tableCell, styles.tableHeaderCell, styles.numCell, { flex: 1.2 }]}>Euro di oggi</Text>
                  <Text style={[styles.tableCell, styles.tableHeaderCell, styles.numCell, { flex: 1.3 }]}>
                    Capitale{displayRealValues ? ' (oggi)' : ''}
                  </Text>
                </View>
                {result.yearlyData.map((row, idx) => (
                  <View
                    key={row.year}
                    style={[
                      styles.tableRow,
                      idx === result.yearlyData.length - 1 && { borderBottomWidth: 0 },
                    ]}
                  >
                    <View style={{ flex: 0.7 }}>
                      <Text style={styles.tableCell}>{row.dateLabel ?? row.year}</Text>
                      <Text style={styles.tableSubCell}>{row.age ?? '-'} anni</Text>
                    </View>
                    <Text style={[styles.tableCell, { flex: 0.9 }]} numberOfLines={1}>
                      {row.phase === 'accumulation' ? 'Versamento' : 'Prelievo'}
                    </Text>
                    <Text style={[styles.tableCell, styles.numCell, { flex: 1.2 }]}>
                      {row.phase === 'accumulation'
                        ? formatSignedCurrency(row.contributionsThisYear)
                        : formatSignedCurrency(-row.withdrawalsThisYear)}
                    </Text>
                    <Text style={[styles.tableCell, styles.numCell, { flex: 1.2, color: colors.textSecondary }]}>
                      {eur(row.phase === 'accumulation' ? row.realContributionsThisYear : row.realWithdrawalsThisYear)}
                    </Text>
                    <Text style={[styles.tableCell, styles.numCell, { flex: 1.3, fontWeight: 'bold' }]}>
                      {eur(displayRealValues ? row.realEndBalance : row.endBalance)}
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
              <Text style={styles.mainTitle} role="heading">Calcolo inverso per obiettivo</Text>
              <Text style={styles.mainSubtitle}>
                Indica il capitale che vuoi raggiungere: il calcolo stima quanto versare o quanti anni servono.
              </Text>
            </View>

            <View style={styles.inputCard}>
              <Text style={styles.fieldHeading}>Qual è il capitale obiettivo?</Text>
              <View style={styles.bbvaInputBox}>
                <Text style={styles.floatingLabel}>Capitale obiettivo</Text>
                <View style={styles.inputRow}>
                  <NumericField
                    style={styles.bbvaTextInput}
                    value={targetGoal}
                    onChange={setTargetGoal}
                    min={0}
                    max={1_000_000_000}
                    isAmount
                    placeholder="100000"
                    placeholderTextColor={colors.textSecondary}
                    aria-label="Capitale obiettivo in euro"
                  />
                  <Text style={styles.currencySuffix}>€</Text>
                </View>
              </View>
              <View style={styles.presetRow}>
                {[50000, 100000, 200000, 500000, 1000000].map((val) =>
                  renderPresetChip(
                    val,
                    `€${val >= 1000000 ? `${val / 1000000} mln` : `${val / 1000}k`}`,
                    targetGoal === val,
                    () => setTargetGoal(val)
                  )
                )}
              </View>
            </View>

            <View style={styles.modeSwitchBox} role="tablist" aria-label="Cosa calcolare">
              <TouchableOpacity
                style={[styles.modeSwitchBtn, goalMode === 'periodic' && styles.modeSwitchBtnActive]}
                onPress={() => setGoalMode('periodic')}
                role="tab"
                aria-selected={goalMode === 'periodic'}
              >
                <Text style={[styles.modeSwitchText, goalMode === 'periodic' && styles.modeSwitchTextActive]}>
                  Calcola la rata
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeSwitchBtn, goalMode === 'years' && styles.modeSwitchBtnActive]}
                onPress={() => setGoalMode('years')}
                role="tab"
                aria-selected={goalMode === 'years'}
              >
                <Text style={[styles.modeSwitchText, goalMode === 'years' && styles.modeSwitchTextActive]}>
                  Calcola gli anni
                </Text>
              </TouchableOpacity>
            </View>

            {goalMode === 'periodic' ? (
              <View style={styles.heroResultCard}>
                <Text style={styles.heroResultSub}>
                  Rata stimata per raggiungere {eur(targetGoal)} in {accYears} anni al {pct(accReturn)} annuo*
                </Text>
                <Text style={styles.heroResultMain}>
                  {eur(goalPeriodicResult.requiredMonthlyAmount)}{' '}
                  <Text style={{ fontSize: 18, fontWeight: 'normal' }}>{perPeriod(frequency)}</Text>
                </Text>
                <View style={styles.heroResultDivider} />
                <View style={styles.heroResultRow}>
                  <Text style={styles.heroResultRowLabel}>Totale versato</Text>
                  <Text style={styles.heroResultRowVal}>{eur(goalPeriodicResult.totalInvested)}</Text>
                </View>
                <View style={styles.heroResultRow}>
                  <Text style={styles.heroResultRowLabel}>Rendimento stimato</Text>
                  <Text style={[styles.heroResultRowVal, { color: colors.positive }]}>
                    {formatSignedCurrency(goalPeriodicResult.totalInterest)}
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.heroResultCard}>
                <Text style={styles.heroResultSub}>
                  Versando {eur(periodicAmount)} {perPeriod(frequency)} al {pct(accReturn)} annuo*
                </Text>
                {goalYearsResult.requiredYears === null ? (
                  <Text style={styles.heroResultMain}>Non raggiungibile in {GOAL_SEEKER_MAX_YEARS} anni</Text>
                ) : (
                  <>
                    <Text style={styles.heroResultMain}>
                      {goalYearsResult.requiredYears} <Text style={{ fontSize: 20, fontWeight: 'normal' }}>anni di versamenti</Text>
                    </Text>
                    <View style={styles.heroResultDivider} />
                    <View style={styles.heroResultRow}>
                      <Text style={styles.heroResultRowLabel}>Capitale stimato a fine periodo</Text>
                      <Text style={styles.heroResultRowVal}>{eur(goalYearsResult.finalBalance)}</Text>
                    </View>
                    <View style={styles.heroResultRow}>
                      <Text style={styles.heroResultRowLabel}>Totale versato</Text>
                      <Text style={styles.heroResultRowVal}>{eur(goalYearsResult.totalInvested)}</Text>
                    </View>
                  </>
                )}
              </View>
            )}
            <Text style={styles.footnoteText}>
              *Calcolo semplificato: rendimento costante, versamenti a fine periodo{applyStampDuty ? ', bollo incluso' : ''}. Non considera step-up dei versamenti, inflazione né imposta sulle plusvalenze.
            </Text>
          </View>
        )}

        {/* ==================================================== */}
        {/* TAB 3: CONFRONTO SCENARI                             */}
        {/* ==================================================== */}
        {activeTab === 'scenarios' && (
          <View style={styles.moduleSection}>
            <View style={styles.titleSection}>
              <Text style={styles.mainTitle} role="heading">Confronto tra ipotesi di rendimento</Text>
              <Text style={styles.mainSubtitle}>
                Cosa accade con {eur(periodicAmount)} {perPeriod(frequency)} per {accYears} anni con tre rendimenti costanti: il tuo ({pct(accReturn)}) e {SCENARIO_SPREAD} punti in meno o in più. Solo fase di accumulo.
              </Text>
            </View>

            {[scenariosResult.low, scenariosResult.base, scenariosResult.high].map((sc, idx) => {
              const isBase = idx === 1;
              const value = applyTaxes && sc.result.netPeakBalance !== undefined ? sc.result.netPeakBalance : sc.result.peakBalance;
              return (
                <View key={idx} style={[styles.scenarioCard, isBase && styles.scenarioCardBase]}>
                  <Text style={styles.scenarioTitle}>
                    Ipotesi {pct(sc.expectedReturn)}{isBase ? ' (il tuo rendimento ipotizzato)' : ''}
                  </Text>
                  <Text style={styles.scenarioValue}>{eur(value)}</Text>
                  <Text style={styles.scenarioSub}>
                    Valore stimato a {accumulationEndYear}{applyTaxes ? ', netto' : ''} · versato {eur(sc.result.totalInvested)}
                  </Text>
                </View>
              );
            })}
            <Text style={styles.footnoteText}>{assumptionsNote}</Text>
          </View>
        )}

        {/* ==================================================== */}
        {/* TAB 4: MONTE CARLO                                   */}
        {/* ==================================================== */}
        {activeTab === 'montecarlo' && (
          <View style={styles.moduleSection}>
            <View style={styles.titleSection}>
              <Text style={styles.mainTitle} role="heading">Simulazione Monte Carlo</Text>
              <Text style={styles.mainSubtitle}>
                I mercati non crescono a tasso fisso: il modello simula {formatDecimal(monteCarloResult.iterations, 0)} percorsi con rendimenti annui casuali (log-normali, mediana pari al {pct(accReturn)} ipotizzato). Solo fase di accumulo; stessi dati, stesso risultato.
              </Text>
            </View>

            <View style={styles.inputCard}>
              <Text style={styles.fieldHeading}>Volatilità annua ipotizzata (deviazione standard)</Text>
              <View style={styles.bbvaInputBox}>
                <View style={styles.inputRow}>
                  <NumericField
                    style={styles.bbvaTextInput}
                    value={volatility}
                    onChange={setVolatility}
                    min={5}
                    max={30}
                    aria-label="Volatilità annua in percentuale"
                  />
                  <Text style={styles.currencySuffix}>% annua</Text>
                </View>
              </View>
              <PacSlider
                value={volatility}
                min={5}
                max={30}
                step={1}
                minLabel="5%"
                maxLabel="30%"
                onChange={setVolatility}
                label="Volatilità annua ipotizzata"
                formatValue={pct}
              />
            </View>

            <MonteCarloChart data={monteCarloResult.yearlyPoints} totalInvested={monteCarloResult.totalInvested} height={280} />

            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <Text style={styles.statCardLabel}>90° percentile</Text>
                <Text style={styles.statCardValue}>{eur(monteCarloResult.finalP90)}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statCardLabel}>50° percentile (mediana)</Text>
                <Text style={styles.statCardValue}>{eur(monteCarloResult.finalP50)}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statCardLabel}>10° percentile</Text>
                <Text style={styles.statCardValue}>{eur(monteCarloResult.finalP10)}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statCardLabel}>Totale versato</Text>
                <Text style={styles.statCardValue}>{eur(monteCarloResult.totalInvested)}</Text>
              </View>
            </View>
            <Text style={styles.footnoteText}>
              In 8 percorsi simulati su 10 il capitale a {accumulationEndYear} resta tra {eur(monteCarloResult.finalP10)} e {eur(monteCarloResult.finalP90)}. Valori nominali, prima delle imposte sulle plusvalenze{applyStampDuty ? ', bollo incluso' : ''}.
            </Text>
          </View>
        )}

        {/* ==================================================== */}
        {/* TAB 5: COSTI & FEE DRAG                              */}
        {/* ==================================================== */}
        {activeTab === 'feedrag' && (
          <View style={styles.moduleSection}>
            <View style={styles.titleSection}>
              <Text style={styles.mainTitle} role="heading">Effetto dei costi di gestione (TER)</Text>
              <Text style={styles.mainSubtitle}>
                Confronta lo stesso PAC con due livelli di costo annuo, sottratti dal rendimento ipotizzato. Solo fase di accumulo.
              </Text>
            </View>

            <View style={styles.inputCard}>
              <Text style={styles.fieldHeading}>Costo basso: {pct(lowCostTER)} annuo</Text>
              <PacSlider
                value={lowCostTER}
                min={0.05}
                max={0.80}
                step={0.05}
                minLabel={pct(0.05)}
                maxLabel={pct(0.8)}
                onChange={setLowCostTER}
                label="Costo basso annuo"
                formatValue={pct}
              />
            </View>

            <View style={styles.inputCard}>
              <Text style={styles.fieldHeading}>Costo alto: {pct(highCostTER)} annuo</Text>
              <PacSlider
                value={highCostTER}
                min={1.0}
                max={3.0}
                step={0.1}
                minLabel={pct(1)}
                maxLabel={pct(3)}
                onChange={setHighCostTER}
                label="Costo alto annuo"
                formatValue={pct}
              />
            </View>

            <FeeDragComparisonChart
              baseParams={accumulationParams}
              lowCostTER={lowCostTER}
              highCostTER={highCostTER}
              height={260}
            />
            <Text style={styles.footnoteText}>{assumptionsNote}</Text>
          </View>
        )}

        {/* ==================================================== */}
        {/* TAB 6: FIRE                                          */}
        {/* ==================================================== */}
        {activeTab === 'fire' && (
          <View style={styles.moduleSection}>
            <View style={styles.titleSection}>
              <Text style={styles.mainTitle} role="heading">Indipendenza finanziaria (FIRE)</Text>
              <Text style={styles.mainSubtitle}>
                Stima il capitale che, secondo la regola empirica del 4% (studi USA, orizzonte 30 anni), sosterrebbe le spese indicate. Non è una garanzia di rendita.
              </Text>
            </View>

            <View style={styles.inputCard}>
              <Text style={styles.fieldHeading}>Spese mensili da coprire, in euro di oggi</Text>
              <View style={styles.bbvaInputBox}>
                <Text style={styles.floatingLabel}>Spesa mensile</Text>
                <View style={styles.inputRow}>
                  <NumericField
                    style={styles.bbvaTextInput}
                    value={fireMonthlyExpenses}
                    onChange={setFireMonthlyExpenses}
                    min={0}
                    max={1_000_000}
                    isAmount
                    placeholder="2000"
                    placeholderTextColor={colors.textSecondary}
                    aria-label="Spese mensili in euro"
                  />
                  <Text style={styles.currencySuffix}>€ / mese</Text>
                </View>
              </View>
              <View style={styles.presetRow}>
                {[1500, 2000, 2500, 3000, 4000].map((val) =>
                  renderPresetChip(val, eurShort(val), fireMonthlyExpenses === val, () => setFireMonthlyExpenses(val))
                )}
              </View>
            </View>

            <View style={styles.inputCard}>
              <Text style={styles.fieldHeading}>Tasso di prelievo annuo: {pct(fireSWR)}</Text>
              <PacSlider
                value={fireSWR}
                min={3.0}
                max={5.0}
                step={0.25}
                minLabel="3%"
                maxLabel="5%"
                onChange={setFireSWR}
                label="Tasso di prelievo annuo"
                formatValue={pct}
              />
            </View>

            <View style={styles.heroResultCard}>
              <Text style={styles.heroResultSub}>
                Capitale obiettivo per {eur(fireMonthlyExpenses)} / mese, in euro di oggi*
              </Text>
              <Text style={styles.heroResultMain}>{eur(fireResult.targetFireCapital)}</Text>
              <View style={styles.heroResultDivider} />
              <View style={styles.heroResultRowStack}>
                <Text style={styles.heroResultRowLabel}>
                  Anni di PAC stimati, partendo da {eur(initialAmount)} oggi con {eur(monthlyEquivalentContribution)} / mese (obiettivo rivalutato del {pct(inflationRate)} annuo)
                </Text>
                <Text style={styles.heroResultRowVal}>
                  {fireResult.yearsToFIREWithPac === null
                    ? `Non raggiungibile in ${FIRE_MAX_YEARS} anni`
                    : `${fireResult.yearsToFIREWithPac} anni`}
                </Text>
              </View>
              {fireResult.nominalTargetAtFIRE !== null && fireResult.yearsToFIREWithPac !== null && fireResult.yearsToFIREWithPac > 0 && (
                <Text style={styles.statCardSub}>
                  Nel {currentYear + fireResult.yearsToFIREWithPac} l&apos;obiettivo vale {eur(fireResult.nominalTargetAtFIRE)} nominali.
                </Text>
              )}
              <View style={styles.heroResultRowStack}>
                <Text style={styles.heroResultRowLabel}>Senza rivalutare l&apos;obiettivo per l&apos;inflazione</Text>
                <Text style={styles.heroResultRowVal}>
                  {fireResult.yearsToFIRENominal === null
                    ? `Non raggiungibile in ${FIRE_MAX_YEARS} anni`
                    : `${fireResult.yearsToFIRENominal} anni`}
                </Text>
              </View>
              <View style={styles.heroResultRowStack}>
                <Text style={styles.heroResultRowLabel}>
                  Rendita mensile sostenibile dal tuo PAC dopo {accYears} anni ({pct(fireSWR)} annuo{applyTaxes ? ', capitale netto' : ''})
                </Text>
                <Text style={styles.heroResultRowVal}>
                  {eur((peakNominal * (fireSWR / 100)) / 12)} / mese (oggi: {eur((peakReal * (fireSWR / 100)) / 12)})
                </Text>
              </View>
              <Text style={styles.footnoteText}>
                *Rendimento costante del {pct(accReturn)}, versamento mensile equivalente ({eur(periodicAmount)} × {getPeriodsPerYear(frequency)} versamenti l&apos;anno / 12) senza step-up{applyStampDuty ? ', bollo incluso' : ''}, imposte sulle plusvalenze escluse.
              </Text>
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
                <Text style={styles.mainTitle} role="heading">Piani di accumulo Scalable</Text>
              </View>
              <Text style={styles.mainSubtitle}>
                Pesi dei piani sincronizzati, calcolati sul costo di acquisto, e importi mensili che li riporterebbero al target.
              </Text>
            </View>

            {/* Overview Card */}
            <View style={[styles.heroResultCard, { backgroundColor: colors.scalableSurface, borderColor: colors.scalable }]}>
              <Text style={styles.heroResultSub}>Totale mensile programmato</Text>
              <Text style={[styles.heroResultMain, { color: colors.scalable }]}>
                {eur(scalableTotalMonthly)} / mese
              </Text>
              <View style={styles.heroResultDivider} />
              <View style={styles.heroResultRow}>
                <Text style={styles.heroResultRowLabel}>Piani sincronizzati</Text>
                <Text style={styles.heroResultRowVal}>{scalablePlans.length}</Text>
              </View>
            </View>

            {/* Rebalancing Card */}
            <View style={styles.inputCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <Sliders size={18} color={colors.textSecondary} style={{ marginRight: 8 }} />
                <Text style={[styles.fieldHeading, { marginBottom: 0 }]} role="heading">
                  Ribilanciamento tramite versamenti
                </Text>
              </View>
              <Text style={styles.rebalanceSummary}>
                {rebalanceAnalysis.items.length === 0
                  ? 'Nessun piano di accumulo attivo.'
                  : rebalanceAnalysis.rebalancingNeeded
                    ? `${rebalanceAnalysis.items.filter((it) => it.status === 'underweight').length} strumenti sotto il peso target (pesi calcolati sul costo di acquisto).`
                    : 'Pesi in linea con il target (calcolati sul costo di acquisto).'}
              </Text>

              {rebalanceAnalysis.items.map((item) => {
                const statusLabel =
                  item.status === 'underweight' ? 'Sottopeso' : item.status === 'overweight' ? 'Sovrappeso' : 'In linea';

                return (
                  <View key={item.id} style={styles.rebalancePlanRow}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={styles.rebalancePlanSymbol}>{item.symbol}</Text>
                        <View style={styles.statusMiniBadge}>
                          <Text style={styles.statusMiniBadgeText}>{statusLabel}</Text>
                        </View>
                      </View>
                      <Text style={styles.rebalancePlanName} numberOfLines={1}>{item.name}</Text>
                      <Text style={styles.rebalanceWeightsText}>
                        Peso al costo: {pct(Math.round(item.currentWeightPercent * 10) / 10)} · Target: {pct(Math.round(item.targetWeightPercent * 10) / 10)}
                      </Text>
                    </View>

                    <View style={{ alignItems: 'flex-end', marginLeft: 12, maxWidth: '48%' }}>
                      <Text style={styles.rebalanceCurrentAmount}>Attuale: {eur(item.currentAmount)}</Text>
                      <Text style={styles.rebalanceSuggestedLabel}>Importo per tornare al target (calcolo)</Text>
                      <Text style={styles.rebalanceSuggestedAmount}>{eur(item.suggestedAmount)}</Text>
                      {item.diffAmount !== 0 && (
                        <Text style={styles.rebalanceDiffText}>({formatSignedCurrency(item.diffAmount)})</Text>
                      )}
                    </View>
                  </View>
                );
              })}

              <TouchableOpacity
                style={styles.simulatePacButton}
                onPress={() => {
                  setPeriodicAmount(scalableTotalMonthly);
                  setFrequency('monthly');
                  setActiveTab('pac');
                }}
                role="button"
              >
                <TrendingUp size={16} color={colors.onAccent} style={{ marginRight: 6 }} />
                <Text style={styles.simulatePacButtonText}>
                  Simula questo PAC nel calcolatore
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Disclaimer Box */}
        <View style={styles.disclaimerBox}>
          <Text style={styles.disclaimerText}>
            Il simulatore ha finalità illustrative ed educative: le stime ipotizzano rendimenti costanti o distribuzioni statistiche, non sono previsioni né consulenza e non garantiscono rendimenti futuri. Gli investimenti comportano il rischio di perdita del capitale.
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
          aria-label="Chiudi"
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle} role="heading">Frequenza dei versamenti</Text>
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
                role="button"
                accessibilityState={{ selected: frequency === f.value }}
              >
                <Text style={styles.modalOptionText}>{f.label}</Text>
                {frequency === f.value && <Check size={20} color={colors.text} />}
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
          aria-label="Chiudi"
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle} role="heading">Frequenza dei prelievi</Text>
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
                role="button"
                accessibilityState={{ selected: withdrawalFrequency === f.value }}
              >
                <Text style={styles.modalOptionText}>{f.label}</Text>
                {withdrawalFrequency === f.value && <Check size={20} color={colors.text} />}
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
        currentFinalBalance={result.peakBalance}
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
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backButton: {
      width: 44,
      height: 44,
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerTitle: {
      color: colors.text,
      fontSize: 18,
      fontWeight: '600',
    },
    headerActionBtn: {
      width: 44,
      height: 44,
      justifyContent: 'center',
      alignItems: 'center',
    },
    tabsScrollBar: {
      maxHeight: 62,
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
      minHeight: 44,
      borderRadius: 22,
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
      fontSize: 20,
      fontWeight: 'bold',
      lineHeight: 26,
      marginBottom: 6,
      flexShrink: 1,
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
      fontSize: 14,
      fontWeight: 'bold',
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
      borderColor: colors.inputBorder,
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 8,
      minHeight: 50,
      justifyContent: 'center',
    },
    bbvaSelectBox: {
      backgroundColor: colors.card,
      borderRadius: 8,
      borderWidth: 1.5,
      borderColor: colors.inputBorder,
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 8,
      minHeight: 50,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    floatingLabel: {
      color: colors.textSecondary,
      fontSize: 12,
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
      minHeight: 28,
      fontVariant: ['tabular-nums'],
    },
    currencySuffix: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '600',
      marginLeft: 8,
    },
    presetRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 8,
    },
    presetChip: {
      backgroundColor: colors.card,
      paddingHorizontal: 14,
      minHeight: 44,
      justifyContent: 'center',
      borderRadius: 22,
      borderWidth: 1,
      borderColor: colors.inputBorder,
    },
    presetChipActive: {
      borderColor: colors.selection,
      backgroundColor: colors.selection,
    },
    presetChipText: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '500',
      fontVariant: ['tabular-nums'],
    },
    presetChipTextActive: {
      color: colors.onStrong,
      fontWeight: 'bold',
    },
    sectionCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    sectionCardTitle: {
      color: colors.text,
      fontSize: 15,
      fontWeight: 'bold',
    },
    sectionCardDesc: {
      color: colors.textSecondary,
      fontSize: 13,
      lineHeight: 18,
      marginBottom: 12,
      marginTop: 2,
    },
    switchRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 6,
      minHeight: 44,
    },
    switchLabel: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '600',
      marginBottom: 2,
    },
    helperText: {
      color: colors.textSecondary,
      fontSize: 12,
      lineHeight: 17,
    },
    withdrawalToggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
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
      borderColor: colors.border,
    },
    startingWithdrawalBadge: {
      backgroundColor: colors.card,
      borderRadius: 8,
      padding: 10,
      marginTop: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    startingWithdrawalText: {
      color: colors.text,
      fontSize: 13,
      lineHeight: 18,
    },
    warningCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.warningSurface,
      borderWidth: 1,
      borderColor: withAlpha(colors.warning, 0.5),
      borderRadius: 12,
      padding: 12,
      marginTop: 6,
      marginBottom: 14,
    },
    warningTitle: {
      color: colors.text,
      fontSize: 14,
      fontWeight: 'bold',
      marginBottom: 2,
    },
    warningText: {
      color: colors.text,
      fontSize: 13,
      lineHeight: 18,
    },
    taxRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
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
    statCardLabel: {
      color: colors.textSecondary,
      fontSize: 12,
      flex: 1,
      lineHeight: 16,
    },
    statCardValue: {
      color: colors.text,
      fontSize: 16,
      fontWeight: 'bold',
      fontVariant: ['tabular-nums'],
    },
    statCardSub: {
      color: colors.textSecondary,
      fontSize: 12,
      marginTop: 2,
      fontVariant: ['tabular-nums'],
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
      minHeight: 44,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 12,
      borderWidth: 1,
      borderColor: colors.inputBorder,
    },
    toggleTableBtnText: {
      color: colors.primary,
      fontSize: 14,
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
      fontSize: 12,
      fontVariant: ['tabular-nums'],
    },
    tableSubCell: {
      color: colors.textSecondary,
      fontSize: 12,
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
      backgroundColor: colors.inputBackground,
      borderRadius: 10,
      padding: 4,
      marginBottom: 16,
    },
    modeSwitchBtn: {
      flex: 1,
      minHeight: 44,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: 8,
    },
    modeSwitchBtnActive: {
      backgroundColor: colors.selection,
    },
    modeSwitchText: {
      color: colors.textSecondary,
      fontSize: 14,
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
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 16,
    },
    heroResultSub: {
      color: colors.textSecondary,
      fontSize: 14,
      marginBottom: 6,
    },
    heroResultMain: {
      color: colors.text,
      fontSize: 32,
      fontWeight: 'bold',
      marginBottom: 12,
      fontVariant: ['tabular-nums'],
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
      gap: 12,
    },
    heroResultRowStack: {
      marginTop: 8,
      marginBottom: 4,
    },
    heroResultRowLabel: {
      color: colors.textSecondary,
      fontSize: 13,
      flexShrink: 1,
      lineHeight: 18,
    },
    heroResultRowVal: {
      color: colors.text,
      fontSize: 15,
      fontWeight: 'bold',
      fontVariant: ['tabular-nums'],
    },
    footnoteText: {
      color: colors.textSecondary,
      fontSize: 12,
      lineHeight: 17,
      marginTop: 10,
    },
    scenarioCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    scenarioCardBase: {
      borderWidth: 2,
      borderColor: colors.inputBorder,
    },
    scenarioTitle: {
      color: colors.text,
      fontSize: 14,
      fontWeight: 'bold',
      marginBottom: 8,
    },
    scenarioValue: {
      color: colors.text,
      fontSize: 22,
      fontWeight: 'bold',
      marginBottom: 4,
      fontVariant: ['tabular-nums'],
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
      fontSize: 12,
      lineHeight: 17,
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
      paddingVertical: 14,
      minHeight: 44,
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
      minHeight: 44,
    },
    scalablePacImportBtnText: {
      color: colors.onAccent,
      fontSize: 13,
      fontWeight: '700',
    },
    scalablePacRebalanceBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'transparent',
      borderRadius: 8,
      paddingHorizontal: 12,
      minHeight: 44,
      borderWidth: 1,
      borderColor: colors.scalable,
    },
    scalablePacRebalanceBtnText: {
      color: colors.scalable,
      fontSize: 13,
      fontWeight: '600',
    },
    rebalanceSummary: {
      fontSize: 13,
      color: colors.textSecondary,
      marginBottom: 14,
      lineHeight: 18,
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
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 1,
      backgroundColor: colors.inputBackground,
    },
    statusMiniBadgeText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    rebalancePlanName: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    rebalanceWeightsText: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 3,
    },
    rebalanceCurrentAmount: {
      fontSize: 12,
      color: colors.textSecondary,
      fontVariant: ['tabular-nums'],
    },
    rebalanceSuggestedLabel: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 4,
      textAlign: 'right',
    },
    rebalanceSuggestedAmount: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text,
      fontVariant: ['tabular-nums'],
    },
    rebalanceDiffText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
      marginTop: 1,
      fontVariant: ['tabular-nums'],
    },
    simulatePacButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.scalable,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 16,
      minHeight: 44,
      marginTop: 16,
    },
    simulatePacButtonText: {
      color: colors.onAccent,
      fontSize: 14,
      fontWeight: '700',
    },
  });
