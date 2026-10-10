import { ScalablePriceAlert } from '../types';
import { YahooQuote } from '../services/yahooFinance';
import { formatNumber, getCurrencySymbol } from './formatters';

export type AlertBadgeStatus = 'triggered' | 'approaching' | 'active' | 'disabled' | 'unknown';

export interface AlertCalculation {
  isTriggered: boolean;
  isApproaching: boolean;
  distancePercent: number;
  /** Distanza dalla soglia senza segno ("5,0%"), "-" se il prezzo non è noto */
  distanceFormatted: string;
  /** Frase con la direzione: "serve un calo del 5,0%" */
  distanceDescription: string;
  statusBadge: AlertBadgeStatus;
  statusLabel: string;
  directionLabel: string;
  targetPriceFormatted: string;
  currentPriceFormatted: string;
}

/**
 * Deterministically evaluates a Scalable Capital price alert against the latest market price.
 * Zero LLM required - 100% mathematical logic.
 */
export function calculateAlertStatus(
  alert: ScalablePriceAlert,
  currentPrice?: number,
  currency = 'EUR'
): AlertCalculation {
  const target = alert.targetPrice;
  const isBelow = alert.direction === 'BELOW';
  const symbol = getCurrencySymbol(currency);
  const directionLabel = isBelow ? 'Se scende a' : 'Se sale a';
  const targetPriceFormatted = `${symbol}${formatNumber(target)}`;
  const base = { directionLabel, targetPriceFormatted };

  // Un avviso disattivato non è mai "raggiunto", qualunque sia il prezzo
  if (alert.status === 'DISABLED') {
    return {
      ...base,
      isTriggered: false,
      isApproaching: false,
      distancePercent: 0,
      distanceFormatted: '-',
      distanceDescription: 'Avviso disattivato',
      statusBadge: 'disabled',
      statusLabel: 'Disattivato',
      currentPriceFormatted: currentPrice ? `${symbol}${formatNumber(currentPrice)}` : 'n/d',
    };
  }

  if (currentPrice === undefined || currentPrice === null || !(currentPrice > 0)) {
    const isTriggered = alert.status === 'TRIGGERED';
    return {
      ...base,
      isTriggered,
      isApproaching: false,
      distancePercent: 0,
      distanceFormatted: '-',
      distanceDescription: isTriggered ? 'Soglia raggiunta (dato Scalable)' : 'Prezzo attuale non disponibile',
      statusBadge: isTriggered ? 'triggered' : 'unknown',
      statusLabel: isTriggered ? 'Raggiunto' : 'Prezzo n/d',
      currentPriceFormatted: 'n/d',
    };
  }

  // Distanza sempre in percentuale del prezzo attuale: quanto deve muoversi il prezzo da qui
  const isTriggered = alert.status === 'TRIGGERED' || (isBelow ? currentPrice <= target : currentPrice >= target);
  const distancePercent = Math.abs((target - currentPrice) / currentPrice) * 100;
  const isApproaching = !isTriggered && distancePercent <= 2.5;
  const distanceFormatted = `${formatNumber(distancePercent)}%`;
  const distanceDescription = isTriggered
    ? 'Soglia raggiunta'
    : `Serve ${isBelow ? 'un calo' : 'un rialzo'} del ${distanceFormatted}`;

  return {
    ...base,
    isTriggered,
    isApproaching,
    distancePercent,
    distanceFormatted,
    distanceDescription,
    statusBadge: isTriggered ? 'triggered' : isApproaching ? 'approaching' : 'active',
    statusLabel: isTriggered ? 'Raggiunto' : isApproaching ? 'Vicino alla soglia' : 'Attivo',
    currentPriceFormatted: `${symbol}${formatNumber(currentPrice)}`,
  };
}

/**
 * Filters alerts belonging to a specific asset symbol.
 */
export function getAlertsForSymbol(
  alerts: ScalablePriceAlert[],
  symbol: string
): ScalablePriceAlert[] {
  if (!alerts || !symbol) return [];
  const cleanSymbol = symbol.trim().toLowerCase();
  return alerts.filter(
    (a) => a.symbol.trim().toLowerCase() === cleanSymbol
  );
}

export interface EvaluatedAlert {
  alert: ScalablePriceAlert;
  quote?: YahooQuote;
  calculation: AlertCalculation;
}

/**
 * Evaluates all alerts with current quote data.
 */
export function evaluateAllAlerts(
  alerts: ScalablePriceAlert[],
  quotes: Record<string, YahooQuote>
): EvaluatedAlert[] {
  if (!alerts || alerts.length === 0) return [];

  return alerts.map((alert) => {
    const quote = quotes[alert.symbol] || Object.values(quotes).find(
      (q) => q.symbol.toLowerCase() === alert.symbol.toLowerCase()
    );
    const currentPrice = quote?.regularMarketPrice;
    const calculation = calculateAlertStatus(alert, currentPrice, quote?.currency);

    return {
      alert,
      quote,
      calculation,
    };
  });
}

/**
 * Returns all triggered alerts based on current market prices.
 */
export function getTriggeredAlerts(
  alerts: ScalablePriceAlert[],
  quotes: Record<string, YahooQuote>
): EvaluatedAlert[] {
  const evaluated = evaluateAllAlerts(alerts, quotes);
  return evaluated.filter((item) => item.calculation.isTriggered);
}

/**
 * Returns all alerts that are approaching their threshold (within 2.5%).
 */
export function getApproachingAlerts(
  alerts: ScalablePriceAlert[],
  quotes: Record<string, YahooQuote>
): EvaluatedAlert[] {
  const evaluated = evaluateAllAlerts(alerts, quotes);
  return evaluated.filter((item) => item.calculation.isApproaching);
}
