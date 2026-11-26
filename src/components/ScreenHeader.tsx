import React from 'react';
import { View, StyleSheet, Pressable, StyleProp, ViewStyle, TextStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, X } from 'lucide-react-native';
import { useAppTheme } from '../theme/ThemeContext';
import { spacing } from '../theme/spacing';
import { radii, continuousCurve } from '../theme/radius';
import { ThemedText } from './ui/ThemedText';

export interface ScreenHeaderProps {
  title?: string;
  subtitle?: string;
  children?: React.ReactNode;
  titleNode?: React.ReactNode;
  onBack?: () => void;
  showBack?: boolean;
  backIcon?: 'arrow' | 'close';
  rightAction?: React.ReactNode;
  leftAlignTitle?: boolean;
  style?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
  testID?: string;
}

export const ScreenHeader: React.FC<ScreenHeaderProps> = ({
  title,
  subtitle,
  children,
  titleNode,
  onBack,
  showBack = true,
  backIcon = 'arrow',
  rightAction,
  leftAlignTitle = false,
  style,
  titleStyle,
  testID,
}) => {
  const { colors } = useAppTheme();
  const router = useRouter();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  return (
    <View
      style={[
        styles.header,
        { backgroundColor: colors.background, borderBottomColor: colors.border },
        style,
      ]}
      testID={testID}
    >
      {children ? (
        children
      ) : (
        <>
          <View style={styles.sideContainer}>
            {showBack && (
              <Pressable
                style={({ pressed }) => [
                  styles.iconButton,
                  { opacity: pressed ? 0.7 : 1 },
                ]}
                onPress={handleBack}
                accessibilityRole="button"
                accessibilityLabel={backIcon === 'close' ? 'Chiudi' : 'Torna indietro'}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {backIcon === 'close' ? (
                  <X size={22} color={colors.text} />
                ) : (
                  <ArrowLeft size={22} color={colors.text} />
                )}
              </Pressable>
            )}
          </View>

          <View style={[styles.titleContainer, leftAlignTitle && styles.titleContainerLeft]}>
            {titleNode ? (
              titleNode
            ) : (
              <>
                {title ? (
                  <ThemedText
                    variant="headerTitle"
                    style={[
                      leftAlignTitle ? styles.headerTitleLeft : styles.headerTitleCenter,
                      titleStyle,
                    ]}
                    numberOfLines={1}
                    accessibilityRole="header"
                  >
                    {title}
                  </ThemedText>
                ) : null}
                {subtitle ? (
                  <ThemedText
                    variant="caption"
                    color={colors.textSecondary}
                    style={[
                      styles.headerSubtitle,
                      leftAlignTitle && styles.headerSubtitleLeft,
                    ]}
                    numberOfLines={1}
                  >
                    {subtitle}
                  </ThemedText>
                ) : null}
              </>
            )}
          </View>

          <View style={styles.sideContainer}>
            {rightAction || (showBack && !leftAlignTitle && <View style={styles.spacer} />)}
          </View>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.headerPaddingHorizontal,
    paddingTop: spacing.headerPaddingTop,
    paddingBottom: spacing.headerPaddingBottom,
    minHeight: spacing.headerMinHeight,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sideContainer: {
    minWidth: spacing.headerButtonSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  titleContainerLeft: {
    alignItems: 'flex-start',
    paddingHorizontal: spacing.sm,
  },
  iconButton: {
    width: spacing.headerButtonSize,
    height: spacing.headerButtonSize,
    borderRadius: radii.sm,
    ...continuousCurve,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spacer: {
    width: spacing.headerButtonSize,
  },
  headerTitleCenter: {
    textAlign: 'center',
  },
  headerTitleLeft: {
    textAlign: 'left',
  },
  headerSubtitle: {
    marginTop: 2,
    textAlign: 'center',
  },
  headerSubtitleLeft: {
    textAlign: 'left',
  },
});
