import React from 'react';
import { View, ScrollView, ViewStyle, StyleProp } from 'react-native';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';
import { useAppTheme } from '../../theme/ThemeContext';
import { spacing } from '../../theme/spacing';

export interface ScreenContainerProps {
  children?: React.ReactNode;
  scrollable?: boolean;
  edges?: Edge[];
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  keyboardShouldPersistTaps?: 'always' | 'never' | 'handled';
  testID?: string;
}

export const ScreenContainer: React.FC<ScreenContainerProps> = ({
  children,
  scrollable = false,
  edges = ['top', 'left', 'right'],
  style,
  contentContainerStyle,
  keyboardShouldPersistTaps = 'handled',
  testID,
}) => {
  const { colors } = useAppTheme();

  return (
    <SafeAreaView
      testID={testID}
      edges={edges}
      style={[
        {
          flex: 1,
          backgroundColor: colors.background,
        },
        style,
      ]}
    >
      {scrollable ? (
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps={keyboardShouldPersistTaps}
          contentContainerStyle={[
            {
              paddingHorizontal: spacing.screenPaddingHorizontal,
              paddingBottom: spacing.xxxl,
            },
            contentContainerStyle,
          ]}
        >
          {children}
        </ScrollView>
      ) : (
        <View
          style={[
            {
              flex: 1,
              paddingHorizontal: spacing.screenPaddingHorizontal,
            },
            contentContainerStyle,
          ]}
        >
          {children}
        </View>
      )}
    </SafeAreaView>
  );
};
