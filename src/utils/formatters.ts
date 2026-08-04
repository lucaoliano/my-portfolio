export const formatNumber = (value: number): string => {
  if (isNaN(value)) return '0.00';
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
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
  // Replace comma with dot to allow parseFloat to work regardless of user input format
  const normalized = value.replace(',', '.');
  return parseFloat(normalized);
};
