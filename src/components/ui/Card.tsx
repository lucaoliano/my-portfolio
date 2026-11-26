import React from 'react';
import { View, Pressable, ViewStyle, StyleProp } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { spacing } from '../../theme/spacing';
import { radii, continuousCurve } from '../../theme/radius';

export type CardVariant = 'default' | 'flat' | 'grouped';

export interface CardProps {
  children?: React.ReactNode;
  variant?: CardVariant;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  testID?: string;
  accessibilityLabel?: string;
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'default',
  style,
  onPress,
  testID,
  accessibilityLabel,
}) => {
  const { colors } = useAppTheme();

  const getContainerStyle = (): ViewStyle => {
    switch (variant) {
      case 'default':
        return {
          backgroundColor: colors.card,
          borderRadius: radii.lg,
          borderWidth: 1,
          borderColor: colors.border,
          padding: spacing.lg,
          ...continuousCurve,
        };
      case 'flat':
        return {
          backgroundColor: colors.card,
          borderRadius: radii.lg,
          padding: spacing.lg,
          ...continuousCurve,
        };
      case 'grouped':
        return {
          backgroundColor: 'transparent',
          borderRadius: radii.lg,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: 'hidden',
          ...continuousCurve,
        };
    }
  };

  const containerStyle = getContainerStyle();

  if (onPress) {
    return (
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={({ pressed }) => [
          containerStyle,
          { opacity: pressed ? 0.75 : 1 },
          style,
        ]}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View testID={testID} style={[containerStyle, style]}>
      {children}
    </View>
  );
};
