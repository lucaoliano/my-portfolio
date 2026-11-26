import React from 'react';
import { Text, TextProps, StyleProp, TextStyle } from 'react-native';
import { typography, TypographyVariant } from '../../theme/typography';
import { useAppTheme } from '../../theme/ThemeContext';

export interface ThemedTextProps extends TextProps {
  variant?: TypographyVariant;
  color?: string;
  tabular?: boolean;
  style?: StyleProp<TextStyle>;
}

export const ThemedText: React.FC<ThemedTextProps> = ({
  variant = 'body',
  color,
  tabular,
  style,
  allowFontScaling = true,
  children,
  ...props
}) => {
  const { colors } = useAppTheme();

  const defaultColor =
    variant === 'subhead' ||
    variant === 'subheadMedium' ||
    variant === 'subheadBold' ||
    variant === 'caption' ||
    variant === 'captionSmall'
      ? colors.textSecondary
      : colors.text;

  const resolvedColor = color ?? defaultColor;
  const baseStyle = typography[variant];

  return (
    <Text
      allowFontScaling={allowFontScaling}
      style={[
        baseStyle,
        { color: resolvedColor },
        tabular && { fontVariant: ['tabular-nums'] },
        style,
      ]}
      {...props}
    >
      {children}
    </Text>
  );
};
