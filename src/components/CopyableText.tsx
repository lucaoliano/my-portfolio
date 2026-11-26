import React, { useRef, useState } from 'react';
import { Text, TextProps, TouchableOpacity, Modal, View, Pressable, StyleSheet, useWindowDimensions, Platform, StyleProp, ViewStyle } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Copy } from 'lucide-react-native';
import { useAppTheme } from '../theme/ThemeContext';
import { ThemeColors } from '../theme/colors';
import { radii, continuousCurve } from '../theme/radius';
import { shadows } from '../theme/shadows';

interface CopyableTextProps extends TextProps {
  valueToCopy: string;
  /** Stile del contenitore toccabile (es. altezza minima del bersaglio) */
  touchableStyle?: StyleProp<ViewStyle>;
  /** true = il valore è già annunciato da un controllo vicino: niente doppia lettura */
  hiddenFromAccessibility?: boolean;
}

export const CopyableText: React.FC<CopyableTextProps> = ({
  valueToCopy,
  children,
  style,
  onPress,
  accessibilityLabel,
  touchableStyle,
  hiddenFromAccessibility = false,
  ...props
}) => {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);
  const { width: screenWidth } = useWindowDimensions();
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuCoords, setMenuCoords] = useState({ x: 0, y: 0, height: 0 });
  const touchableRef = useRef<React.ComponentRef<typeof TouchableOpacity>>(null);

  const handleLongPress = () => {
    if (touchableRef.current) {
      touchableRef.current.measure((x: number, y: number, width: number, height: number, pageX: number, pageY: number) => {
        setMenuCoords({ x: pageX + width / 2, y: pageY, height });
        setMenuVisible(true);
      });
    }
  };

  const handleCopy = async () => {
    await Clipboard.setStringAsync(valueToCopy);
    setMenuVisible(false);
  };

  const bubbleWidth = 140;
  let leftPos = menuCoords.x - bubbleWidth / 2;
  if (leftPos + bubbleWidth > screenWidth - 16) leftPos = screenWidth - bubbleWidth - 16;
  if (leftPos < 16) leftPos = 16;

  const topPos = menuCoords.y - 54 > 40 ? menuCoords.y - 54 : menuCoords.y + menuCoords.height + 10;

  return (
    <>
      <TouchableOpacity 
        ref={touchableRef}
        style={touchableStyle}
        onLongPress={handleLongPress} 
        // Senza onPress il tocco veniva "mangiato": ora passa all'azione del contenitore (es. aprire il gruppo)
        onPress={onPress}
        activeOpacity={0.6}
        delayLongPress={300}
        // Senza un'azione al tocco non è un controllo: sul web non deve diventare una tappa vuota del Tab
        focusable={!hiddenFromAccessibility && !!onPress}
        accessible={!hiddenFromAccessibility}
        aria-hidden={hiddenFromAccessibility || undefined}
        accessibilityRole={onPress ? 'button' : 'text'}
        // Il suggerimento vale dove la pressione lunga è raggiungibile con lo screen reader (iOS/Android)
        accessibilityHint={Platform.OS === 'web' ? undefined : 'Tieni premuto per copiare il valore'}
        accessibilityLabel={accessibilityLabel}
      >
        <Text style={style} selectable={false} {...props}>
          {children}
        </Text>
      </TouchableOpacity>

      <Modal
        visible={menuVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable 
          style={StyleSheet.absoluteFill} 
          onPress={() => setMenuVisible(false)}
        >
          <View 
            style={[styles.menuBubble, { top: topPos, left: leftPos, width: bubbleWidth }]}
            onStartShouldSetResponder={() => true}
          >
            <TouchableOpacity onPress={handleCopy} style={styles.menuItem}>
              <Text style={styles.menuText}>Copia</Text>
              <Copy size={18} color={colors.text} />
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </>
  );
};

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  menuBubble: {
    position: 'absolute',
    backgroundColor: colors.card,
    borderRadius: radii.md,
    ...continuousCurve,
    boxShadow: shadows.raised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  menuText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '500',
  }
});
