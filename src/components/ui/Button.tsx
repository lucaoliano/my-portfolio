import React from 'react';
import {
  Pressable,
  ActivityIndicator,
  ViewStyle,
  StyleProp,
  TextStyle,
  View,
} from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { spacing } from '../../theme/spacing';
import { radii, continuousCurve } from '../../theme/radius';
import { ThemedText } from './ThemedText';

export type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'ghost' | 'scalable';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  title?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  children?: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  variant = 'primary',
  size = 'lg',
  loading = false,
  disabled = false,
  fullWidth = false,
  icon,
  iconPosition = 'left',
  style,
  textStyle,
  children,
  onPress,
  accessibilityLabel,
  testID,
}) => {
  const { colors } = useAppTheme();
  const isDisabled = disabled || loading;

  const getVariantStyles = (): {
    container: ViewStyle;
    textColor: string;
    spinnerColor: string;
  } => {
    switch (variant) {
      case 'primary':
        return {
          container: {
            backgroundColor: colors.positive,
          },
          textColor: colors.onAccent,
          spinnerColor: colors.onAccent,
        };
      case 'secondary':
        return {
          container: {
            backgroundColor: colors.inputBackground,
            borderWidth: 1,
            borderColor: colors.border,
          },
          textColor: colors.text,
          spinnerColor: colors.text,
        };
      case 'destructive':
        return {
          container: {
            backgroundColor: 'transparent',
            borderWidth: 1,
            borderColor: colors.negative,
          },
          textColor: colors.negative,
          spinnerColor: colors.negative,
        };
      case 'ghost':
        return {
          container: {
            backgroundColor: 'transparent',
          },
          textColor: colors.text,
          spinnerColor: colors.text,
        };
      case 'scalable':
        return {
          container: {
            backgroundColor: colors.scalableSurface,
            borderWidth: 1,
            borderColor: colors.scalable,
          },
          textColor: colors.scalable,
          spinnerColor: colors.scalable,
        };
    }
  };

  const getSizeStyles = (): {
    container: ViewStyle;
    textVariant: 'bodyBold' | 'subheadBold' | 'caption';
  } => {
    switch (size) {
      case 'lg':
        return {
          container: {
            height: 50,
            borderRadius: radii.pill,
            paddingHorizontal: spacing.xl,
          },
          textVariant: 'bodyBold',
        };
      case 'md':
        return {
          container: {
            height: 44,
            borderRadius: radii.pill,
            paddingHorizontal: spacing.lg,
          },
          textVariant: 'subheadBold',
        };
      case 'sm':
        return {
          container: {
            height: 34,
            borderRadius: radii.sm,
            paddingHorizontal: spacing.md,
          },
          textVariant: 'caption',
        };
    }
  };

  const variantStyle = getVariantStyles();
  const sizeStyle = getSizeStyles();

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityState={{ disabled: isDisabled, busy: !!loading }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          ...continuousCurve,
          ...variantStyle.container,
          ...sizeStyle.container,
          ...(fullWidth && { alignSelf: 'stretch', width: '100%' }),
          opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
          transform: [{ scale: pressed && !isDisabled ? 0.985 : 1 }],
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={variantStyle.spinnerColor} />
      ) : (
        <>
          {icon && iconPosition === 'left' && (
            <View style={{ marginRight: spacing.sm }}>{icon}</View>
          )}
          {children ? (
            children
          ) : title ? (
            <ThemedText
              variant={sizeStyle.textVariant}
              style={[{ color: variantStyle.textColor }, textStyle]}
            >
              {title}
            </ThemedText>
          ) : null}
          {icon && iconPosition === 'right' && (
            <View style={{ marginLeft: spacing.sm }}>{icon}</View>
          )}
        </>
      )}
    </Pressable>
  );
};
