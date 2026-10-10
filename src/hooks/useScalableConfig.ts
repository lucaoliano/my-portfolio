import { useState, useEffect, useRef } from 'react';
import { ScalableMcpConfig } from '../types';
import { subscribeScalableConfig, refreshScalableSession } from '../services/scalableMcp';

export const useScalableConfig = (userId: string | undefined) => {
  const [config, setConfig] = useState<ScalableMcpConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const lastRefreshAttemptRef = useRef<number>(0);

  useEffect(() => {
    if (!userId) {
      const timeoutId = setTimeout(() => {
        setConfig(null);
        setLoading(false);
      }, 0);
      return () => clearTimeout(timeoutId);
    }

    const unsubscribe = subscribeScalableConfig(userId, (cfg) => {
      setConfig(cfg);
      setLoading(false);

      // Proactive silent refresh if token is expired or expiring within 10 minutes
      if (
        cfg &&
        cfg.enabled &&
        cfg.hasRefreshToken &&
        (cfg.status === 'connected' || cfg.status === 'expired')
      ) {
        const expiresAtMs = cfg.tokenExpiresAt ? new Date(cfg.tokenExpiresAt).getTime() : 0;
        const now = Date.now();
        const isExpiredOrExpiringSoon = !expiresAtMs || expiresAtMs <= now + 10 * 60 * 1000;
        const timeSinceLastAttempt = now - lastRefreshAttemptRef.current;

        // Prevent rapid refresh loops: limit to at most once every 3 minutes
        if (isExpiredOrExpiringSoon && timeSinceLastAttempt > 3 * 60 * 1000) {
          lastRefreshAttemptRef.current = now;
          console.log('[useScalableConfig] Token expired or expiring soon, triggering silent background refresh...');
          refreshScalableSession().catch((err) => {
            console.warn('[useScalableConfig] Silent token refresh failed:', err);
          });
        }
      }
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [userId]);

  return { config, loading };
};
