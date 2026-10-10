import React, { useState } from 'react';
import { TextInput, TextInputProps } from 'react-native';
import { formatInputNumber, parseLocalNumber } from '../../utils/formatters';

/**
 * Legge un numero digitato nel simulatore PAC.
 * Per gli importi, "1.000" o "12.500.000" (gruppi di tre cifre separati da punti) sono migliaia,
 * non decimali: parseLocalNumber da solo leggerebbe "1.000" come 1.
 */
export const parsePacNumber = (raw: string, isAmount: boolean): number => {
  const trimmed = raw.trim().replace(/\s/g, '');
  if (!trimmed) return NaN;
  if (isAmount && /^\d{1,3}(\.\d{3})+$/.test(trimmed)) {
    return Number(trimmed.replace(/\./g, ''));
  }
  return parseLocalNumber(trimmed);
};

interface NumericFieldProps extends Omit<TextInputProps, 'value' | 'onChange' | 'onChangeText' | 'onBlur' | 'onFocus' | 'keyboardType' | 'inputMode'> {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  /** Importo in euro: accetta il punto come separatore delle migliaia */
  isAmount?: boolean;
  /** Solo numeri interi (anni, età) */
  integer?: boolean;
}

/**
 * Campo numerico con testo proprio: si può svuotare e riscrivere senza che il valore salti,
 * il numero viene letto in formato italiano e riportato nell'intervallo [min, max] all'uscita dal campo.
 */
export const NumericField: React.FC<NumericFieldProps> = ({
  value,
  onChange,
  min,
  max,
  isAmount = false,
  integer = false,
  ...inputProps
}) => {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState('');

  const clamp = (n: number) => {
    const v = integer ? Math.round(n) : n;
    return Math.max(min, Math.min(max, v));
  };

  const handleChange = (raw: string) => {
    setText(raw);
    if (raw.trim() === '') {
      // Campo svuotato: il calcolo usa il minimo finché non si scrive un nuovo numero
      onChange(min);
      return;
    }
    const parsed = parsePacNumber(raw, isAmount);
    if (!isNaN(parsed) && parsed >= min && parsed <= max) {
      onChange(integer ? Math.round(parsed) : parsed);
    }
  };

  const handleBlur = () => {
    setFocused(false);
    const parsed = parsePacNumber(text, isAmount);
    const next = isNaN(parsed) ? clamp(value) : clamp(parsed);
    if (next !== value) onChange(next);
  };

  return (
    <TextInput
      {...inputProps}
      value={focused ? text : formatInputNumber(value)}
      onChangeText={handleChange}
      onFocus={() => {
        setText(formatInputNumber(value));
        setFocused(true);
      }}
      onBlur={handleBlur}
      keyboardType={integer ? 'number-pad' : 'decimal-pad'}
      inputMode={integer ? 'numeric' : 'decimal'}
    />
  );
};
