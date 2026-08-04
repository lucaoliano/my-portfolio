import { ThemeColors } from '../theme/colors';
import React, { useEffect } from 'react';
import { Animated, StyleSheet, ViewStyle, StyleProp, DimensionValue, Platform } from 'react-native';
import { useAppTheme } from '../theme/ThemeContext';

interface SkeletonProps {
  width?: DimensionValue;
  height?: DimensionValue;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

export const Skeleton: React.FC<SkeletonProps> = ({ 
  width, 
  height, 
  borderRadius = 8, 
  style 
}) => {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);
  const [opacity] = React.useState(() => new Animated.Value(0.3));

  useEffect(() => {
    const isNative = Platform.OS !== 'web';
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: isNative,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: isNative,
        }),
      ])
    );
    animation.start();
    
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        styles.skeleton,
        { width, height, borderRadius, opacity },
        style,
      ]}
    />
  );
};

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  skeleton: {
    backgroundColor: colors.border,
  },
});
