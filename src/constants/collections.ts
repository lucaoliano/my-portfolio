export const COLLECTIONS = {
  PORTFOLIOS: 'portfolios',
  TRANSACTIONS: 'transactions',
  ASSETS: 'assets',
  SETTINGS: 'settings',
  PREFERENCES: 'preferences',
} as const;

/**
 * Helper to get the path for a user's transactions subcollection
 */
export const getUserTransactionsPath = (userId: string) => {
  return `${COLLECTIONS.PORTFOLIOS}/${userId}/${COLLECTIONS.TRANSACTIONS}`;
};

/**
 * Helper to get the path for a user's assets subcollection
 */
export const getUserAssetsPath = (userId: string) => {
  return `${COLLECTIONS.PORTFOLIOS}/${userId}/${COLLECTIONS.ASSETS}`;
};

/**
 * Helper to get the path for a user's preferences document
 */
export const getUserPreferencesPath = (userId: string) => {
  return `${COLLECTIONS.PORTFOLIOS}/${userId}/${COLLECTIONS.SETTINGS}/${COLLECTIONS.PREFERENCES}`;
};

/**
 * Helper to get the path for a user's integration settings document
 */
export const getUserIntegrationPath = (userId: string, integrationId: string) => {
  return `${COLLECTIONS.PORTFOLIOS}/${userId}/${COLLECTIONS.SETTINGS}/integration_${integrationId}`;
};
