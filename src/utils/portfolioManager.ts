import { Portfolio } from '../types';

export const DEFAULT_PORTFOLIO_ID = 'default';

export const DEFAULT_PORTFOLIO: Portfolio = {
  id: DEFAULT_PORTFOLIO_ID,
  name: 'Principale',
  isDefault: true,
  groups: ['Generale'],
  defaultGroup: 'Generale',
};

/**
 * Pulisce un oggetto Portfolio prima del salvataggio su Firestore.
 * Firestore non supporta valori 'undefined' all'interno di array o documenti.
 */
export const cleanPortfolio = (p: Portfolio): Portfolio => {
  const clean: Portfolio = {
    id: p.id,
    name: p.name.trim(),
  };
  if (p.isDefault) clean.isDefault = true;
  if (p.createdAt) clean.createdAt = p.createdAt;
  const desc = p.description?.trim();
  if (desc) clean.description = desc;
  if (Array.isArray(p.groups)) {
    const cleanedGroups = p.groups
      .map(g => (typeof g === 'string' ? g.trim() : ''))
      .filter(Boolean);
    clean.groups = cleanedGroups.length > 0 ? Array.from(new Set(cleanedGroups)) : ['Generale'];
  }
  const defG = p.defaultGroup?.trim();
  if (defG) clean.defaultGroup = defG;
  return clean;
};

export const cleanPortfolios = (list: Portfolio[]): Portfolio[] =>
  list.map(cleanPortfolio);

export interface AddPortfolioResult {
  ok: boolean;
  error?: string;
  portfolios?: Portfolio[];
  newPortfolio?: Portfolio;
}

export const createNewPortfolio = (
  currentList: Portfolio[],
  rawName: string,
  rawDescription?: string,
  initialGroups?: string[]
): AddPortfolioResult => {
  const name = rawName.trim();
  if (!name) {
    return { ok: false, error: 'Il nome del portafoglio non può essere vuoto.' };
  }

  const existing = cleanPortfolios(currentList.length > 0 ? currentList : [DEFAULT_PORTFOLIO]);
  if (existing.some(p => p.name.toLowerCase() === name.toLowerCase())) {
    return { ok: false, error: 'Esiste già un portafoglio con questo nome.' };
  }

  const desc = rawDescription?.trim();
  const groupsToUse = initialGroups && initialGroups.length > 0
    ? Array.from(new Set(initialGroups.map(g => g.trim()).filter(Boolean)))
    : ['Generale'];
  const newPortfolio: Portfolio = cleanPortfolio({
    id: `port_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    name,
    createdAt: new Date().toISOString(),
    ...(desc ? { description: desc } : {}),
    groups: groupsToUse,
    defaultGroup: groupsToUse[0] || 'Generale',
  });

  return {
    ok: true,
    portfolios: [...existing, newPortfolio],
    newPortfolio,
  };
};

export interface UpdatePortfolioResult {
  ok: boolean;
  error?: string;
  portfolios?: Portfolio[];
}

export const updateExistingPortfolio = (
  currentList: Portfolio[],
  id: string,
  rawName: string,
  rawDescription?: string
): UpdatePortfolioResult => {
  const name = rawName.trim();
  if (!name) {
    return { ok: false, error: 'Il nome del portafoglio non può essere vuoto.' };
  }

  const existing = cleanPortfolios(currentList);
  if (existing.some(p => p.id !== id && p.name.toLowerCase() === name.toLowerCase())) {
    return { ok: false, error: 'Esiste già un portafoglio con questo nome.' };
  }

  const desc = rawDescription?.trim();
  const updated = existing.map(p => {
    if (p.id !== id) return p;
    const item: Portfolio = {
      ...p,
      name,
    };
    if (desc) {
      item.description = desc;
    } else {
      delete item.description;
    }
    return cleanPortfolio(item);
  });

  return {
    ok: true,
    portfolios: updated,
  };
};

export const setAsDefaultPortfolio = (
  currentList: Portfolio[],
  id: string
): { portfolios: Portfolio[]; defaultPortfolioId: string } => {
  const portfolios = cleanPortfolios(currentList).map(item => ({
    ...item,
    isDefault: item.id === id,
  }));
  return {
    portfolios,
    defaultPortfolioId: id,
  };
};

export const reorderPortfoliosList = (
  currentList: Portfolio[],
  index: number,
  delta: -1 | 1
): Portfolio[] => {
  const target = index + delta;
  if (target < 0 || target >= currentList.length) return currentList;
  const list = [...cleanPortfolios(currentList)];
  [list[target], list[index]] = [list[index], list[target]];
  return list;
};

export interface DeletePortfolioValidation {
  canDelete: boolean;
  reason?: string;
  targetDefaultId?: string;
}

export const validatePortfolioDeletion = (
  currentList: Portfolio[],
  idToDelete: string,
  currentDefaultId?: string
): DeletePortfolioValidation => {
  if (currentList.length <= 1) {
    return {
      canDelete: false,
      reason: "Non puoi eliminare l'unico portafoglio presente.",
    };
  }

  const defaultId = currentDefaultId || DEFAULT_PORTFOLIO_ID;
  if (idToDelete === defaultId) {
    return {
      canDelete: false,
      reason: 'Non puoi eliminare il portafoglio predefinito. Impostane prima un altro come predefinito.',
    };
  }

  return {
    canDelete: true,
    targetDefaultId: defaultId,
  };
};

/**
 * Restituisce i gruppi per un determinato portafoglio.
 * Se non configurati, usa il fallback indicato o ['Generale'].
 */
export const getPortfolioGroups = (
  portfolio?: Portfolio | null,
  fallbackGroups?: string[]
): string[] => {
  if (portfolio?.groups && portfolio.groups.length > 0) {
    return portfolio.groups;
  }
  if (fallbackGroups && fallbackGroups.length > 0) {
    return fallbackGroups;
  }
  return ['Generale'];
};

/**
 * Aggiunge un nuovo gruppo al portafoglio indicato.
 */
export const addPortfolioGroup = (
  currentList: Portfolio[],
  portfolioId: string,
  rawGroupName: string
): { portfolios: Portfolio[]; error?: string } => {
  const groupName = rawGroupName.trim();
  if (!groupName) {
    return { portfolios: currentList, error: 'Il nome del gruppo non può essere vuoto.' };
  }

  const existingPortfolios = cleanPortfolios(currentList);
  const target = existingPortfolios.find(p => p.id === portfolioId);
  if (!target) {
    return { portfolios: currentList, error: 'Portafoglio non trovato.' };
  }

  const currentGroups = getPortfolioGroups(target);
  if (currentGroups.some(g => g.toLowerCase() === groupName.toLowerCase())) {
    return { portfolios: currentList, error: 'Esiste già un gruppo con questo nome in questo portafoglio.' };
  }

  const updatedPortfolios = existingPortfolios.map(p => {
    if (p.id !== portfolioId) return p;
    const groups = [...currentGroups, groupName];
    return cleanPortfolio({ ...p, groups });
  });

  return { portfolios: updatedPortfolios };
};

/**
 * Rinomina un gruppo all'interno di un portafoglio.
 */
export const renamePortfolioGroup = (
  currentList: Portfolio[],
  portfolioId: string,
  oldName: string,
  rawNewName: string
): { portfolios: Portfolio[]; error?: string } => {
  const newName = rawNewName.trim();
  if (!newName) {
    return { portfolios: currentList, error: 'Il nome del gruppo non può essere vuoto.' };
  }

  const existingPortfolios = cleanPortfolios(currentList);
  const target = existingPortfolios.find(p => p.id === portfolioId);
  if (!target) {
    return { portfolios: currentList, error: 'Portafoglio non trovato.' };
  }

  const currentGroups = getPortfolioGroups(target);
  if (
    oldName.toLowerCase() !== newName.toLowerCase() &&
    currentGroups.some(g => g.toLowerCase() === newName.toLowerCase())
  ) {
    return { portfolios: currentList, error: 'Esiste già un gruppo con questo nome.' };
  }

  const updatedPortfolios = existingPortfolios.map(p => {
    if (p.id !== portfolioId) return p;
    const groups = currentGroups.map(g => (g === oldName ? newName : g));
    const defaultGroup = p.defaultGroup === oldName ? newName : p.defaultGroup;
    return cleanPortfolio({ ...p, groups, defaultGroup });
  });

  return { portfolios: updatedPortfolios };
};

/**
 * Rimuove un gruppo da un portafoglio.
 */
export const removePortfolioGroup = (
  currentList: Portfolio[],
  portfolioId: string,
  groupName: string
): { portfolios: Portfolio[]; error?: string } => {
  const existingPortfolios = cleanPortfolios(currentList);
  const target = existingPortfolios.find(p => p.id === portfolioId);
  if (!target) {
    return { portfolios: currentList, error: 'Portafoglio non trovato.' };
  }

  const currentGroups = getPortfolioGroups(target);
  if (currentGroups.length <= 1) {
    return { portfolios: currentList, error: 'Non puoi eliminare l\'unico gruppo del portafoglio.' };
  }

  const updatedGroups = currentGroups.filter(g => g !== groupName);
  const updatedPortfolios = existingPortfolios.map(p => {
    if (p.id !== portfolioId) return p;
    const defaultGroup = p.defaultGroup === groupName ? updatedGroups[0] : p.defaultGroup;
    return cleanPortfolio({ ...p, groups: updatedGroups, defaultGroup });
  });

  return { portfolios: updatedPortfolios };
};

/**
 * Riordina i gruppi all'interno di un portafoglio.
 */
export const reorderPortfolioGroups = (
  currentList: Portfolio[],
  portfolioId: string,
  index: number,
  delta: -1 | 1
): Portfolio[] => {
  const existingPortfolios = cleanPortfolios(currentList);
  const target = existingPortfolios.find(p => p.id === portfolioId);
  if (!target) return currentList;

  const currentGroups = [...getPortfolioGroups(target)];
  const targetIndex = index + delta;
  if (targetIndex < 0 || targetIndex >= currentGroups.length) return currentList;

  [currentGroups[targetIndex], currentGroups[index]] = [currentGroups[index], currentGroups[targetIndex]];

  return existingPortfolios.map(p => {
    if (p.id !== portfolioId) return p;
    return cleanPortfolio({ ...p, groups: currentGroups });
  });
};
