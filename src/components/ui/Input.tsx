import React, { useState } from 'react';
import {
  View,
  TextInput,
  TextInputProps,
  StyleProp,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { spacing } from '../../theme/spacing';
import { radii, continuousCurve } from '../../theme/radius';
import { ThemedText } from './ThemedText';

export interface InputProps extends TextInputProps {
  label?: string;
  hint?: string;
  error?: string;
  sizeVariant?: 'md' | 'lg';
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  rightElement?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({
  label,
  hint,
  error,
  sizeVariant = 'lg',
  containerStyle,
  inputStyle,
  rightElement,
  onFocus,
  onBlur,
  style,
  ...props
}) => {
  const { colors } = useAppTheme();
  const [isFocused, setIsFocused] = useState(false);

  const height = sizeVariant === 'lg' ? 50 : 44;

  const borderColor = error
    ? colors.negative
    : isFocused
    ? colors.text
    : colors.inputBorder;

  return (
    <View style={[{ marginBottom: spacing.lg }, containerStyle]}>
      {label && (
        <ThemedText
          variant="subheadMedium"
          color={colors.textSecondary}
          style={{ marginBottom: spacing.xs }}
        >
          {label}
        </ThemedText>
      )}

      <View
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.inputBackground,
            height,
            borderRadius: radii.sm,
            borderWidth: 1,
            borderColor,
            paddingHorizontal: spacing.lg,
            ...continuousCurve,
          },
          style,
        ]}
      >
        <TextInput
          placeholderTextColor={colors.textSecondary}
          style={[
            {
              flex: 1,
              color: colors.text,
              fontSize: 16,
              height: '100%',
              paddingVertical: 0,
            },
            inputStyle,
          ]}
          onFocus={(e) => {
            setIsFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            onBlur?.(e);
          }}
          {...props}
        />
        {rightElement && (
          <View style={{ marginLeft: spacing.sm }}>{rightElement}</View>
        )}
      </View>

      {error ? (
        <ThemedText
          variant="caption"
          color={colors.negative}
          style={{ marginTop: spacing.xs }}
          accessibilityRole="alert"
        >
          {error}
        </ThemedText>
      ) : hint ? (
        <ThemedText
          variant="caption"
          color={colors.textSecondary}
          style={{ marginTop: spacing.xs }}
        >
          {hint}
        </ThemedText>
      ) : null}
    </View>
  );
};
