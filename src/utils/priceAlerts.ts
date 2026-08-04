import { ScalablePriceAlert } from '../types';
import { YahooQuote } from '../services/yahooFinance';

export type AlertBadgeStatus = 'triggered' | 'approaching' | 'active';

export interface AlertCalculation {
  isTriggered: boolean;
  isApproaching: boolean;
  distancePercent: number;
  distanceFormatted: string;
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
  currentPrice?: number
): AlertCalculation {
  const target = alert.targetPrice;
  const isBelow = alert.direction === 'BELOW';
  const directionLabel = isBelow ? 'Al ribasso (≤)' : 'Al rialzo (≥)';
  const targetPriceFormatted = `€${target.toFixed(2)}`;

  if (currentPrice === undefined || currentPrice === null || currentPrice <= 0) {
    const isTriggered = alert.status === 'TRIGGERED';
    return {
      isTriggered,
      isApproaching: false,
      distancePercent: 0,
      distanceFormatted: '-',
      statusBadge: isTriggered ? 'triggered' : 'active',
      statusLabel: isTriggered ? 'Target Raggiunto' : 'In Monitoraggio',
      directionLabel,
      targetPriceFormatted,
      currentPriceFormatted: 'N/D',
    };
  }

  const currentPriceFormatted = `€${currentPrice.toFixed(2)}`;

  let isTriggered = alert.status === 'TRIGGERED';
  let distancePercent = 0;

  if (isBelow) {
    // Alert triggers when market price drops to or below target
    if (currentPrice <= target) {
      isTriggered = true;
      distancePercent = ((currentPrice - target) / target) * 100; // negative or 0
    } else {
      distancePercent = ((currentPrice - target) / currentPrice) * 100; // positive (% drop needed)
    }
  } else {
    // Alert triggers when market price rises to or above target
    if (currentPrice >= target) {
      isTriggered = true;
      distancePercent = ((currentPrice - target) / target) * 100; // positive or 0
    } else {
      distancePercent = ((target - currentPrice) / currentPrice) * 100; // positive (% rise needed)
    }
  }

  const isApproaching = !isTriggered && Math.abs(distancePercent) <= 2.5;

  let statusBadge: AlertBadgeStatus = 'active';
  let statusLabel = 'In Monitoraggio';

  if (isTriggered) {
    statusBadge = 'triggered';
    statusLabel = 'Target Raggiunto';
  } else if (isApproaching) {
    statusBadge = 'approaching';
    statusLabel = 'In Avvicinamento';
  }

  const sign = distancePercent > 0 ? '+' : '';
  const distanceFormatted = `${sign}${distancePercent.toFixed(1)}%`;

  return {
    isTriggered,
    isApproaching,
    distancePercent,
    distanceFormatted,
    statusBadge,
    statusLabel,
    directionLabel,
    targetPriceFormatted,
    currentPriceFormatted,
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
    const calculation = calculateAlertStatus(alert, currentPrice);

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
