import { ThemeColors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { View, StyleSheet } from 'react-native';
import { Skeleton } from './Skeleton';
import { useAppTheme } from '../theme/ThemeContext';

export const PortfolioSkeleton = () => {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);
  return (
    <View style={styles.container}>
      {/* Top Bar Skeleton */}
      <View style={styles.topBar}>
        <View style={styles.iconSlot}>
          <Skeleton width={28} height={28} borderRadius={6} />
        </View>
        <View style={styles.iconSlot}>
          <Skeleton width={28} height={28} borderRadius={14} />
        </View>
      </View>

      {/* Header Skeleton */}
      <View style={styles.header}>
        <View>
          <Skeleton width={100} height={16} style={{ marginBottom: 8 }} />
          <Skeleton width={180} height={36} />
          <View style={{ flexDirection: 'column', marginTop: 12 }}>
            <Skeleton width={140} height={20} borderRadius={6} style={{ marginBottom: 8 }} />
            <Skeleton width={140} height={20} borderRadius={6} />
          </View>
        </View>
      </View>

      {/* Group Skeleton 1 */}
      <View style={styles.groupOuterContainer}>
        <View style={styles.sectionHeaderContainer}>
          <View style={styles.sectionHeaderTop}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Skeleton width={20} height={20} borderRadius={10} style={{ marginRight: 8 }} />
              <Skeleton width={120} height={24} />
            </View>
            <Skeleton width={80} height={22} />
          </View>
          <View style={styles.sectionMetricsRow}>
            <Skeleton width={100} height={18} borderRadius={6} style={{ marginRight: 8 }} />
            <Skeleton width={100} height={18} borderRadius={6} />
          </View>
        </View>
        
        {/* Asset Skeletons */}
        <View style={[styles.card, styles.cardFirst, styles.cardBorderBottom]}>
          <View style={styles.leftContent}>
            <Skeleton width={48} height={48} borderRadius={24} style={{ marginRight: 12 }} />
            <View style={{ flex: 1, marginRight: 12 }}>
              <Skeleton width={100} height={18} style={{ marginBottom: 6 }} />
              <Skeleton width={60} height={12} style={{ marginBottom: 4 }} />
              <Skeleton width={80} height={12} style={{ marginBottom: 4 }} />
              <Skeleton width={70} height={12} />
            </View>
          </View>
          <View style={styles.rightContent}>
            <Skeleton width={70} height={18} style={{ marginBottom: 6 }} />
            <Skeleton width={80} height={16} borderRadius={6} style={{ marginBottom: 4 }} />
            <Skeleton width={80} height={16} borderRadius={6} />
          </View>
        </View>

        <View style={[styles.card, styles.cardLast]}>
          <View style={styles.leftContent}>
            <Skeleton width={48} height={48} borderRadius={24} style={{ marginRight: 12 }} />
            <View style={{ flex: 1, marginRight: 12 }}>
              <Skeleton width={120} height={18} style={{ marginBottom: 6 }} />
              <Skeleton width={50} height={12} style={{ marginBottom: 4 }} />
              <Skeleton width={90} height={12} style={{ marginBottom: 4 }} />
              <Skeleton width={60} height={12} />
            </View>
          </View>
          <View style={styles.rightContent}>
            <Skeleton width={80} height={18} style={{ marginBottom: 6 }} />
            <Skeleton width={70} height={16} borderRadius={6} style={{ marginBottom: 4 }} />
            <Skeleton width={70} height={16} borderRadius={6} />
          </View>
        </View>
      </View>

      {/* Group Skeleton 2 */}
      <View style={[styles.groupOuterContainer, { marginTop: 16 }]}>
        <View style={styles.sectionHeaderContainer}>
          <View style={styles.sectionHeaderTop}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Skeleton width={20} height={20} borderRadius={10} style={{ marginRight: 8 }} />
              <Skeleton width={90} height={24} />
            </View>
            <Skeleton width={70} height={22} />
          </View>
          <View style={styles.sectionMetricsRow}>
            <Skeleton width={110} height={18} borderRadius={6} style={{ marginRight: 8 }} />
            <Skeleton width={90} height={18} borderRadius={6} />
          </View>
        </View>
      </View>
    </View>
  );
};

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.headerPaddingHorizontal,
    paddingTop: spacing.headerPaddingTop,
    paddingBottom: spacing.headerPaddingBottom,
  },
  iconSlot: {
    width: spacing.headerButtonSize,
    height: spacing.headerButtonSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  groupOuterContainer: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: 'transparent',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  sectionHeaderContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    backgroundColor: 'transparent',
  },
  sectionHeaderTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  sectionMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    paddingLeft: 28,
  },
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: colors.card,
  },
  cardFirst: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  cardLast: {
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  cardBorderBottom: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  leftContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  rightContent: {
    alignItems: 'flex-end',
  },
});
