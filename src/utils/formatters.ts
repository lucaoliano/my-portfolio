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

export const formatInputNumber = (value: number): string => {
  if (isNaN(value)) return '';
  // Formats using local decimal separator but without thousand separators
  return new Intl.NumberFormat(undefined, {
    useGrouping: false,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
};

export const parseLocalNumber = (value: string): number => {
  if (!value) return NaN;
  let normalized = value.trim().replace(/\s/g, '');
  if (normalized.includes(',')) {
    // Formato italiano "1.234,56": i punti sono separatori delle migliaia
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  }
  return parseFloat(normalized);
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
