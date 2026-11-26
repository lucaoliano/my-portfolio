import React, { useState, useCallback, useMemo, createElement } from 'react';
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  LayoutChangeEvent,
  GestureResponderEvent,
  Platform,
} from 'react-native';
import { ThemeColors } from '../theme/colors';
import { shadows } from '../theme/shadows';
import { radii } from '../theme/radius';
import { useAppTheme } from '../theme/ThemeContext';

interface PacSliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  minLabel?: string;
  maxLabel?: string;
  onChange: (value: number) => void;
  /** Nome letto dagli screen reader (aria-label) */
  label?: string;
  /** Valore letto dagli screen reader (aria-valuetext), es. "25 anni" */
  formatValue?: (value: number) => string;
}

export const PacSlider: React.FC<PacSliderProps> = ({
  value,
  min,
  max,
  step = 1,
  minLabel,
  maxLabel,
  onChange,
  label,
  formatValue,
}) => {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);
  
  const [trackWidth, setTrackWidth] = useState<number>(0);

  const clampedValue = Math.max(min, Math.min(max, value));
  const fraction = (clampedValue - min) / (max - min || 1);
  const valueText = formatValue ? formatValue(clampedValue) : String(clampedValue);

  const stepBy = (direction: 1 | -1) => {
    const next = Math.round((clampedValue + direction * step) / step) * step;
    onChange(Math.max(min, Math.min(max, next)));
  };

  const updateFromPosition = useCallback(
    (posX: number) => {
      if (trackWidth <= 0 || isNaN(posX)) return;
      const ratio = Math.max(0, Math.min(1, posX / trackWidth));
      const rawVal = min + ratio * (max - min);
      const steppedVal = Math.round(rawVal / step) * step;
      const finalVal = Math.max(min, Math.min(max, steppedVal));
      onChange(finalVal);
    },
    [trackWidth, min, max, step, onChange]
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt: GestureResponderEvent) => {
          if (evt.nativeEvent && typeof evt.nativeEvent.locationX === 'number') {
            updateFromPosition(evt.nativeEvent.locationX);
          }
        },
        onPanResponderMove: (evt: GestureResponderEvent) => {
          if (evt.nativeEvent && typeof evt.nativeEvent.locationX === 'number') {
            updateFromPosition(evt.nativeEvent.locationX);
          }
        },
        onPanResponderRelease: () => {},
        onPanResponderTerminate: () => {},
      }),
    [updateFromPosition]
  );

  const onLayout = (e: LayoutChangeEvent) => {
    setTrackWidth(e.nativeEvent.layout.width);
  };

  return (
    <View style={styles.container}>
      <View
        style={styles.touchArea}
        onLayout={onLayout}
        {...(Platform.OS !== 'web'
          ? {
              ...panResponder.panHandlers,
              accessible: true,
              accessibilityRole: 'adjustable' as const,
              accessibilityLabel: label,
              accessibilityValue: { min, max, now: clampedValue, text: valueText },
              accessibilityActions: [{ name: 'increment' as const }, { name: 'decrement' as const }],
              onAccessibilityAction: (e: { nativeEvent: { actionName: string } }) => {
                if (e.nativeEvent.actionName === 'increment') stepBy(1);
                if (e.nativeEvent.actionName === 'decrement') stepBy(-1);
              },
            }
          : {})}
      >
        {/* Visual Custom Track */}
        <View style={styles.trackBackground} pointerEvents="none">
          <View style={[styles.trackFill, { width: `${fraction * 100}%` }]} />
        </View>

        {/* Visual Custom Thumb */}
        <View
          style={[
            styles.thumb,
            {
              left: `${fraction * 100}%`,
            },
          ]}
          pointerEvents="none"
        >
          <View style={styles.thumbInner} />
        </View>

        {/* Transparent Native Range Input on Web */}
        {Platform.OS === 'web' &&
          createElement('input', {
            type: 'range',
            min,
            max,
            step,
            value: clampedValue,
            'aria-label': label,
            'aria-valuetext': valueText,
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
              const val = parseFloat(e.target.value);
              if (!isNaN(val)) onChange(val);
            },
            onInput: (e: React.FormEvent<HTMLInputElement>) => {
              const val = parseFloat((e.target as HTMLInputElement).value);
              if (!isNaN(val)) onChange(val);
            },
            style: {
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              opacity: 0,
              cursor: 'pointer',
              margin: 0,
              padding: 0,
              zIndex: 10,
              WebkitAppearance: 'none',
              // pan-y: un trascinamento verticale scorre la pagina invece di restare bloccato sul cursore
              touchAction: 'pan-y',
            },
          })}
      </View>

      <View style={styles.labelsRow}>
        <Text style={styles.rangeLabel}>{minLabel || `Min. ${min}`}</Text>
        <Text style={styles.rangeLabel}>{maxLabel || `Max. ${max}`}</Text>
      </View>
    </View>
  );
};

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      width: '100%',
      paddingVertical: 8,
      ...(Platform.OS === 'web'
        ? ({
            userSelect: 'none',
            WebkitUserSelect: 'none',
          } as object)
        : {}),
    },
    touchArea: {
      height: 44,
      justifyContent: 'center',
      position: 'relative',
      ...(Platform.OS === 'web'
        ? ({
            cursor: 'pointer',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            touchAction: 'pan-y',
          } as object)
        : {}),
    },
    trackBackground: {
      height: 6,
      backgroundColor: colors.inputBackground,
      borderRadius: radii.xs,
      overflow: 'hidden',
      width: '100%',
    },
    trackFill: {
      height: '100%',
      backgroundColor: colors.positive,
      borderRadius: radii.xs,
    },
    thumb: {
      position: 'absolute',
      width: 24,
      height: 24,
      borderRadius: radii.round,
      backgroundColor: colors.positive,
      marginLeft: -12,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 3,
      borderColor: colors.card,
      boxShadow: shadows.segmentLift,
    },
    thumbInner: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.onAccent,
    },
    labelsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 2,
    },
    rangeLabel: {
      color: colors.textSecondary,
      fontSize: 12,
      ...(Platform.OS === 'web'
        ? ({
            userSelect: 'none',
            WebkitUserSelect: 'none',
          } as object)
        : {}),
    },
  });
