// Token semantici del tema (vedi DESIGN.md). Ogni colore usato nell'app passa da qui:
// niente hex scritti a mano nei componenti, così tema chiaro e scuro restano coerenti.

export const darkColors = {
  background: "#121212", // Scalable uses a very dark theme
  card: "#1E1E1E",
  text: "#F3F4F6", // Grigio chiarissimo, non bianco puro (#FFFFFF) per evitare affaticamento visivo
  textSecondary: "#9CA3AF", // Grigio per testi secondari
  primary: "#F3F4F6", // Niente bianco puro neanche per il colore primario
  positive: "#00D166", // Scalable's signature vibrant green
  negative: "#FF6961", // Rosso vivo: ≥4.5:1 anche sulla sua tinta al 12,5% sulle card
  border: "#2C2C2C",
  inputBackground: "#2C2C2C",
  // Contorni che sono l'unico indizio del controllo (campi, interruttori spenti, chip, tracce): ≥3:1
  inputBorder: "#6B7280",

  // Solo per ciò che arriva dall'integrazione Scalable Capital (The Teal Belongs to Scalable Rule)
  scalable: "#28EBCF",
  scalableSurface: "#102A27",
  // Avvisi non bloccanti, price alert in avvicinamento
  warning: "#F59E0B",
  warningSurface: "#3A2E12",
  negativeSurface: "#37181C",
  // Informazioni neutre (note, suggerimenti); chiaro abbastanza da leggersi sulla sua tinta
  info: "#60A5FA",
  infoSurface: "#1E293B",
  // Stato selezionato dei controlli segmentati del calcolatore PAC
  selection: "#004481",
  // Testo/icone sopra riempimenti pieni
  onAccent: "#000000", // su positive / scalable / warning
  onStrong: "#FFFFFF", // su selection / negative / overlay scuri
  overlay: "rgba(0, 0, 0, 0.6)",
  // Tooltip dei grafici: superficie scura fluttuante in entrambi i temi
  tooltipBackground: "rgba(18, 18, 18, 0.95)",
  tooltipBorder: "rgba(255, 255, 255, 0.15)",
  tooltipText: "#FFFFFF",
  tooltipTextSecondary: "#AAAAAA",
  // Serie dei grafici PAC (stesso significato in entrambi i temi)
  chartInvested: "#E58E26",
  chartGrowth: "#7BC676",
  chartWithdrawal: "#A855F7",
  chartContributions: "#3498DB",
};

export const lightColors: ThemeColors = {
  background: "#F9FAFB", // Sfondo molto chiaro e moderno
  card: "#FFFFFF", // Carte bianche per risaltare sullo sfondo
  text: "#334155", // Slate-700, palesemente non nero puro
  textSecondary: "#58677C", // Blu-grigio: ≥4.5:1 anche su inputBackground e border
  primary: "#334155",
  positive: "#046C4E", // Verde scuro: ≥4.5:1 anche sulla sua tinta al 12,5%
  negative: "#B91C1C", // Rosso scuro: ≥4.5:1 anche sulla sua tinta al 12,5%
  border: "#E5E7EB", // Bordi leggeri
  inputBackground: "#F3F4F6", // Sfondo input leggermente scuro
  inputBorder: "#858D9B", // ≥3:1 su card e sfondo: campi, interruttori spenti, chip

  scalable: "#0D6660", // ≥4.5:1 anche sulle sue tinte su sfondo chiaro
  scalableSurface: "#E6F7F4",
  warning: "#A14A0B", // ≥4.5:1 anche sulla sua tinta e su warningSurface
  warningSurface: "#FEF3C7",
  negativeSurface: "#FEE2E2",
  info: "#1D4ED8",
  infoSurface: "#DBEAFE",
  selection: "#004481",
  onAccent: "#FFFFFF", // i riempimenti del tema chiaro sono scuri
  onStrong: "#FFFFFF",
  overlay: "rgba(15, 23, 42, 0.45)",
  // Tooltip chiaro: i colori delle serie del tema chiaro sono leggibili solo su fondo chiaro
  tooltipBackground: "rgba(255, 255, 255, 0.98)",
  tooltipBorder: "#D1D5DB",
  tooltipText: "#334155",
  tooltipTextSecondary: "#58677C",
  chartInvested: "#C2410C",
  chartGrowth: "#4D7C0F",
  chartWithdrawal: "#7E22CE",
  chartContributions: "#1D4ED8",
};

export type ThemeColors = typeof darkColors;

/**
 * Applica un'opacità a un colore del tema: sostituisce il trucco `colore + '20'`,
 * che funziona solo con hex a 6 cifre e non è leggibile.
 */
export const withAlpha = (color: string, alpha: number): string => {
  const hex = color.replace('#', '');
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return color;
};
