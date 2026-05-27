/**
 * useCustomerScore
 *
 * Mirrors the server-side AlgorithmService signal computation using
 * data already present in useAuthStore — no extra API call needed.
 *
 * Returns a `profile` object the rest of the UI can consume:
 *   segment        — 'champion' | 'loyal' | 'at_risk' | 'dormant' | 'new' | 'guest'
 *   score          — 0-100 approximate weighted score
 *   signals        — { recency, frequency, loyalty } each 0-100
 *   daysSinceOrder — integer
 *   tierNext       — slug of the next tier above current, or null
 *   insights       — array of { type, message, cta?, ctaLink? }
 */

import { useMemo } from 'react';
import { useAuthStore } from '../store';

// Mirror server-side weights (must match algorithm_config 'weights' seed row)
const W = { recency: 25, frequency: 20, monetary: 20, loyalty: 15, engagement: 10, service: 5, referral: 5 };
const TOTAL_W = Object.values(W).reduce((a, b) => a + b, 0);

const TIER_ORDER = ['bronze', 'silver', 'gold', 'platinum', 'diamond'];

function recencyRaw(lastOrderDate) {
  if (!lastOrderDate) return 0;
  const days = Math.max(0, Math.floor((Date.now() - new Date(lastOrderDate).getTime()) / 86_400_000));
  return Math.max(0, Math.round(100 - days / 3.65));
}

function frequencyRaw(totalOrders) {
  if (!totalOrders || totalOrders <= 0) return 0;
  return Math.min(100, Math.round(Math.log(totalOrders + 1) / Math.log(50) * 100));
}

function loyaltyRaw(loyaltyPoints) {
  return Math.min(100, Math.round((loyaltyPoints || 0) / 100));
}

export function useCustomerScore() {
  const { isAuthenticated, user } = useAuthStore();

  return useMemo(() => {
    if (!isAuthenticated || !user) {
      return { segment: 'guest', score: 0, signals: {}, daysSinceOrder: null, tierNext: null, insights: [] };
    }

    const customer = user.customer ?? user; // works whether auth returns nested or flat

    const recency   = recencyRaw(customer.last_order_date);
    const frequency = frequencyRaw(customer.total_orders);
    const loyalty   = loyaltyRaw(customer.loyalty_points);

    // Partial weighted score from the signals we can compute client-side
    // (monetary, engagement, service, referral default to 50 as neutral — server fills real values)
    const score = Math.round(
      (recency   * W.recency   / TOTAL_W) +
      (frequency * W.frequency / TOTAL_W) +
      (50        * W.monetary  / TOTAL_W) +
      (loyalty   * W.loyalty   / TOTAL_W) +
      (50        * (W.engagement + W.service + W.referral) / TOTAL_W)
    );

    const daysSinceOrder = customer.last_order_date
      ? Math.floor((Date.now() - new Date(customer.last_order_date).getTime()) / 86_400_000)
      : null;

    const totalOrders   = parseInt(customer.total_orders  || 0);
    const loyaltyPoints = parseInt(customer.loyalty_points || 0);
    const currentTier   = customer.tier || 'bronze';
    const tierIdx       = TIER_ORDER.indexOf(currentTier);
    const tierNext      = tierIdx >= 0 && tierIdx < TIER_ORDER.length - 1
      ? TIER_ORDER[tierIdx + 1] : null;

    // ── Segment classification ──────────────────────────────────────────────
    let segment;
    if (totalOrders === 0)                  segment = 'new';
    else if (score >= 68)                   segment = 'champion';
    else if (score >= 48)                   segment = 'loyal';
    else if (daysSinceOrder > 90)           segment = 'dormant';
    else                                    segment = 'at_risk';

    // ── Insights — context-aware nudges the UI can render ──────────────────
    const insights = [];
    const name = customer.first_name || user.name?.split(' ')[0] || 'there';

    if (segment === 'new') {
      insights.push({
        type: 'welcome',
        message: `Welcome, ${name}! Your first order earns double loyalty points.`,
        cta: 'Browse Products', ctaLink: '/products',
      });
    }

    if (segment === 'champion') {
      insights.push({
        type: 'champion',
        message: `You're one of our top customers, ${name} 🏆`,
        cta: null,
      });
    }

    if (segment === 'at_risk' && daysSinceOrder !== null) {
      insights.push({
        type: 'winback',
        message: `It's been ${daysSinceOrder} day${daysSinceOrder !== 1 ? 's' : ''} since your last order — see what's new.`,
        cta: 'Shop Now', ctaLink: '/products',
      });
    }

    if (segment === 'dormant') {
      insights.push({
        type: 'dormant',
        message: `Long time no see, ${name}! Check out what's arrived since your last visit.`,
        cta: 'New Arrivals', ctaLink: '/products?is_new=true',
      });
    }

    if (loyaltyPoints > 0) {
      const pointsToRedeem = 1000; // typical redemption threshold
      if (loyaltyPoints >= pointsToRedeem) {
        insights.push({
          type: 'redeem',
          message: `You have ${loyaltyPoints.toLocaleString()} loyalty points ready to redeem.`,
          cta: 'View Rewards', ctaLink: '/profile',
        });
      } else {
        insights.push({
          type: 'points',
          message: `${loyaltyPoints.toLocaleString()} loyalty points · ${(pointsToRedeem - loyaltyPoints).toLocaleString()} to go until first redemption.`,
          cta: null,
        });
      }
    }

    if (tierNext && totalOrders > 0) {
      insights.push({
        type: 'tier',
        message: `Keep ordering to reach ${tierNext.charAt(0).toUpperCase() + tierNext.slice(1)} tier and unlock better rewards.`,
        cta: null,
      });
    }

    return {
      segment,
      score,
      signals: { recency, frequency, loyalty },
      daysSinceOrder,
      tierNext,
      loyaltyPoints,
      totalOrders,
      currentTier,
      customerName: name,
      insights,
    };
  }, [isAuthenticated, user]);
}