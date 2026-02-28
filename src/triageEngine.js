const DECISIONS = {
  AUTO_CLOSE: 'AUTO_CLOSE',
  ANALYST_REVIEW: 'ANALYST_REVIEW',
  ESCALATE: 'ESCALATE'
};

const REASON_CODES = {
  VELOCITY_PATTERN: 'VELOCITY_PATTERN',
  THRESHOLD_AVOIDANCE: 'THRESHOLD_AVOIDANCE',
  HIGH_RISK_CUSTOMER: 'HIGH_RISK_CUSTOMER',
  MEDIUM_RISK_CUSTOMER: 'MEDIUM_RISK_CUSTOMER',
  KYC_INCOMPLETE: 'KYC_INCOMPLETE',
  NEW_ACCOUNT: 'NEW_ACCOUNT',
  STABLE_ACCOUNT: 'STABLE_ACCOUNT',
  LARGE_CASH_ACTIVITY: 'LARGE_CASH_ACTIVITY',
  MULTI_CHANNEL_MOVEMENT: 'MULTI_CHANNEL_MOVEMENT',
  MULTI_RULE_TRIGGER: 'MULTI_RULE_TRIGGER'
};

function clampScore(score) {
  return Math.max(0, Math.min(100, score));
}

export function computeDeterministicRisk(input) {
  const customer = input.customer_profile ?? {};
  const alert = input.alert ?? {};
  const txns = input.transactions ?? [];

  let score = 0;
  const trace = [];
  const reasonCodes = new Set();

  const txCount = txns.length;
  const avgAmount = txCount
    ? txns.reduce((sum, t) => sum + (Number(t.amount) || 0), 0) / txCount
    : 0;
  const maxAmount = txCount
    ? Math.max(...txns.map((t) => Number(t.amount) || 0))
    : 0;

  if (txCount >= 3) {
    score += 25;
    trace.push({
      signal: 'Multiple transactions in a short window',
      weight: 25,
      why: 'Higher chance of velocity-based laundering behavior.'
    });
    reasonCodes.add(REASON_CODES.VELOCITY_PATTERN);
  }

  const nearThresholdCount = txns.filter((t) => {
    const amount = Number(t.amount) || 0;
    return amount >= 90000 && amount < 100000;
  }).length;

  if (nearThresholdCount >= 2) {
    score += 20;
    trace.push({
      signal: 'Amounts repeatedly near reporting threshold (90k-99,999)',
      weight: 20,
      why: 'Could indicate structuring/threshold avoidance behavior.'
    });
    reasonCodes.add(REASON_CODES.THRESHOLD_AVOIDANCE);
  }

  if (customer.risk_category === 'High') {
    score += 20;
    trace.push({
      signal: 'High-risk customer category',
      weight: 20,
      why: 'Baseline risk from customer profile is elevated.'
    });
    reasonCodes.add(REASON_CODES.HIGH_RISK_CUSTOMER);
  } else if (customer.risk_category === 'Medium') {
    score += 10;
    trace.push({
      signal: 'Medium-risk customer category',
      weight: 10,
      why: 'Moderate baseline risk from customer profile.'
    });
    reasonCodes.add(REASON_CODES.MEDIUM_RISK_CUSTOMER);
  }

  if (customer.kyc_status && customer.kyc_status !== 'Completed') {
    score += 15;
    trace.push({
      signal: 'KYC not fully completed',
      weight: 15,
      why: 'Insufficient due diligence increases unknown risk.'
    });
    reasonCodes.add(REASON_CODES.KYC_INCOMPLETE);
  }

  const accountAgeMonths = Number(customer.account_age_months) || 0;
  if (accountAgeMonths > 12) {
    score -= 15;
    trace.push({
      signal: 'Account age above 12 months',
      weight: -15,
      why: 'Longer, stable account history can reduce suspicion.'
    });
    reasonCodes.add(REASON_CODES.STABLE_ACCOUNT);
  } else if (accountAgeMonths > 0 && accountAgeMonths <= 3) {
    score += 10;
    trace.push({
      signal: 'New account (<=3 months)',
      weight: 10,
      why: 'Newly opened accounts are often less behaviorally understood.'
    });
    reasonCodes.add(REASON_CODES.NEW_ACCOUNT);
  }

  const cashTxCount = txns.filter((t) => t.channel === 'Cash').length;
  if (cashTxCount >= 2 && maxAmount >= 50000) {
    score += 10;
    trace.push({
      signal: 'Large cash activity',
      weight: 10,
      why: 'Cash makes source-of-funds verification more difficult.'
    });
    reasonCodes.add(REASON_CODES.LARGE_CASH_ACTIVITY);
  }

  const uniqueChannels = new Set(txns.map((t) => t.channel)).size;
  if (uniqueChannels >= 3) {
    score += 8;
    trace.push({
      signal: 'Multi-channel movement',
      weight: 8,
      why: 'Rapid movement across channels may indicate layering.'
    });
    reasonCodes.add(REASON_CODES.MULTI_CHANNEL_MOVEMENT);
  }

  const triggeredRulesCount = Array.isArray(alert.triggered_rules)
    ? alert.triggered_rules.length
    : 0;
  if (triggeredRulesCount >= 2) {
    score += 10;
    trace.push({
      signal: 'Multiple rules triggered',
      weight: 10,
      why: 'Several controls firing together increases confidence in concern.'
    });
    reasonCodes.add(REASON_CODES.MULTI_RULE_TRIGGER);
  }

  const finalRiskScore = clampScore(score);

  return {
    riskScore: finalRiskScore,
    trace,
    reasonCodes: [...reasonCodes],
    metrics: {
      txCount,
      avgAmount,
      maxAmount,
      nearThresholdCount,
      triggeredRulesCount,
      uniqueChannels
    }
  };
}

export function finalDecision({ riskScore, llmDisagreement }) {
  if (riskScore >= 80) return DECISIONS.ESCALATE;
  if (riskScore >= 45) return DECISIONS.ANALYST_REVIEW;

  // Hard rule: AUTO_CLOSE only when low risk and LLM agrees.
  if (riskScore < 45 && !llmDisagreement) {
    return DECISIONS.AUTO_CLOSE;
  }

  return DECISIONS.ANALYST_REVIEW;
}

export { DECISIONS, REASON_CODES };
