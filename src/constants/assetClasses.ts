/** Classi di attivo selezionabili per un titolo (stessi valori usati dall'analisi della salute). */
export const ASSET_CLASSES = [
  'Azioni',
  'Obbligazioni',
  'Materie prime',
  'Criptovalute',
  'Liquidità',
  'Altro',
] as const;

export type AssetCategorySource = 'user' | 'scalable';

export interface AssetCategoryInfo {
  category: string;
  /** 'scalable' = proposta dalla sincronizzazione, non ancora confermata dall'utente */
  source: AssetCategorySource;
}

/**
 * Categoria effettiva di un documento `assets`: la scelta dell'utente, altrimenti la proposta di Scalable.
 * Le sync precedenti scrivevano tipi di strumento ("ETF", "Cripto"): non sono classi di attivo.
 */
export const resolveAssetCategory = (data: {
  category?: unknown;
  categorySource?: unknown;
  scalableAssetClass?: unknown;
}): AssetCategoryInfo | null => {
  const raw = typeof data.category === 'string' ? data.category : '';
  const scalableClass = typeof data.scalableAssetClass === 'string' ? data.scalableAssetClass : '';
  const legacy = !data.categorySource && (raw === 'ETF' || raw === 'Cripto');
  if (raw && !legacy) {
    return { category: raw, source: data.categorySource === 'scalable' ? 'scalable' : 'user' };
  }
  if (raw === 'Cripto') return { category: 'Criptovalute', source: 'scalable' };
  if (scalableClass) return { category: scalableClass, source: 'scalable' };
  return null;
};
