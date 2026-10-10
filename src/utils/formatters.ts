// Alcune localizzazioni (es. it-IT su Safari) non raggruppano i numeri a 4 cifre:
// forziamo il separatore delle migliaia per avere "4.064,54" coerente con "38.392,42".
const amountFormatter = (() => {
  const options = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  try {
    return new Intl.NumberFormat(undefined, { ...options, useGrouping: 'always' } as Intl.NumberFormatOptions);
  } catch {
    return new Intl.NumberFormat(undefined, options);
  }
})();

export const formatNumber = (value: number): string => {
  return amountFormatter.format(isNaN(value) ? 0 : value);
};

export const formatDate = (dateString: string): string => {
  if (!dateString) return '';
  const parts = dateString.split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const date = new Date(year, month, day);
    if (!isNaN(date.getTime())) {
      return new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }).format(date);
    }
  }
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(date);
};

export const getCurrencySymbol = (currency?: string): string => {
  if (!currency) return '€';
  switch (currency.toUpperCase()) {
    case 'USD':
      return '$';
    case 'EUR':
      return '€';
    case 'GBP':
      return '£';
    case 'CHF':
      return 'CHF ';
    case 'JPY':
      return '¥';
    default:
      return `${currency} `;
  }
};

/**
 * Valore iniziale di un campo numerico modificabile: tutti i decimali significativi (fino a 8),
 * niente separatore delle migliaia. Mai arrotondare qui: il campo viene salvato così com'è.
 */
export const formatInputNumber = (value: number): string => {
  if (!isFinite(value)) return '';
  return new Intl.NumberFormat('it-IT', {
    useGrouping: false,
    minimumFractionDigits: 0,
    maximumFractionDigits: 8,
  }).format(value);
};

/**
 * Legge un numero scritto all'italiana ("1.234,56", "150,5") o con il punto decimale ("150.50").
 * Testo non numerico ("12abc", "1,2,3") dà NaN invece di un numero inventato.
 */
export const parseLocalNumber = (value: string): number => {
  if (!value) return NaN;
  let normalized = value.trim().replace(/\s/g, '');
  if (!/^[+-]?[\d.,]+$/.test(normalized)) return NaN;
  const commas = (normalized.match(/,/g) || []).length;
  if (commas > 1) return NaN;
  if (commas === 1) {
    // Formato italiano "1.234,56": i punti sono separatori delle migliaia
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else if ((normalized.match(/\./g) || []).length > 1) {
    // "1.234.567": più punti possono essere solo separatori delle migliaia
    normalized = normalized.replace(/\./g, '');
  }
  const n = Number(normalized);
  return isFinite(n) ? n : NaN;
};

/** "+€1.234,56" / "-€1.234,56": il segno va prima del simbolo di valuta, non "€-1.234,56". */
export const formatSignedCurrency = (value: number, currencySymbol = '€'): string => {
  const sign = value < 0 ? '-' : '+';
  return `${sign}${currencySymbol}${formatNumber(Math.abs(value))}`;
};

/** Numero con un numero fisso di decimali nel formato locale ("70,0", "48.574"): sostituisce toFixed nei testi. */
export const formatDecimal = (value: number, digits: number): string => {
  const options = { minimumFractionDigits: digits, maximumFractionDigits: digits };
  try {
    return new Intl.NumberFormat(undefined, { ...options, useGrouping: 'always' } as Intl.NumberFormatOptions).format(value);
  } catch {
    return new Intl.NumberFormat(undefined, options).format(value);
  }
};
