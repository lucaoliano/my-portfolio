import { ThemeColors } from '../theme/colors';
import { View, Text, StyleSheet, TouchableOpacity, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, Check } from 'lucide-react-native';
import { useAppTheme, ThemePreference } from '../theme/ThemeContext';
import { useBiometrics } from '../hooks/useBiometrics';
import { auth } from '../config/firebase';

export default function SettingsScreen() {
  const router = useRouter();
  const { colors, preference, setPreference } = useAppTheme();
  const { isSupported, isEnabled, toggleBiometric } = useBiometrics(auth.currentUser?.uid);
  const styles = getStyles(colors);

  const options: { label: string; value: ThemePreference }[] = [
    { label: 'Automatico (Sistema)', value: 'automatic' },
    { label: 'Chiaro', value: 'light' },
    { label: 'Scuro', value: 'dark' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.canGoBack() ? router.back() : router.replace('/')}>
          <ChevronLeft size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Impostazioni</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.content}>
        <Text style={styles.sectionTitle}>Scegli l&apos;aspetto dell&apos;app</Text>
        
        <View style={styles.optionsCard}>
          {options.map((option, index) => (
            <TouchableOpacity 
              key={option.value}
              style={[
                styles.optionRow,
                index === options.length - 1 && { borderBottomWidth: 0 }
              ]}
              onPress={() => setPreference(option.value)}
            >
              <Text style={styles.optionText}>{option.label}</Text>
              {preference === option.value && (
                <Check size={20} color={colors.positive} />
              )}
            </TouchableOpacity>
          ))}
        </View>

        {isSupported && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Sicurezza</Text>
            <View style={styles.optionsCard}>
              <View style={[styles.optionRow, { borderBottomWidth: 0 }]}>
                <Text style={styles.optionText}>Sblocco Biometrico</Text>
                <Switch 
                  value={isEnabled} 
                  onValueChange={(val) => {
                    void toggleBiometric(val);
                  }}
                  trackColor={{ false: colors.border, true: colors.positive }}
                  thumbColor={colors.onStrong}
                />
              </View>
            </View>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
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
    fontSize: 20,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    padding: 24,
  },
  sectionTitle: {
    color: colors.textSecondary,
    fontSize: 14,
    textTransform: 'uppercase',
    fontWeight: '600',
    marginBottom: 12,
    marginLeft: 8,
  },
  optionsCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  optionText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '500',
  }
});
