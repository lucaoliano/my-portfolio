export const darkColors = {
  background: "#121212", // Scalable uses a very dark theme
  card: "#1E1E1E",
  text: "#F3F4F6", // Grigio chiarissimo, non bianco puro (#FFFFFF) per evitare affaticamento visivo
  textSecondary: "#9CA3AF", // Grigio per testi secondari
  primary: "#F3F4F6", // Niente bianco puro neanche per il colore primario
  positive: "#00D166", // Scalable's signature vibrant green
  negative: "#FF453A", // Vibrant red
  border: "#2C2C2C",
  inputBackground: "#2C2C2C",
};

export const lightColors = {
  background: "#F9FAFB", // Sfondo molto chiaro e moderno
  card: "#FFFFFF", // Carte bianche per risaltare sullo sfondo
  text: "#334155", // Slate-700, palesemente non nero puro
  textSecondary: "#64748B", // Blu-grigio per i testi secondari (slate-500)
  primary: "#334155", 
  positive: "#059669", // Verde scuro per accessibilità/contrasto su sfondo chiaro
  negative: "#DC2626", // Rosso scuro per accessibilità/contrasto
  border: "#E5E7EB", // Bordi leggeri
  inputBackground: "#F3F4F6", // Sfondo input leggermente scuro
};

export type ThemeColors = typeof darkColors;
