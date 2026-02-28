/**
 * LLM layer contract:
 * - Identify suspicious behavioral patterns
 * - Validate or challenge deterministic score
 * - Surface uncertainty/missing signals
 *
 * This boilerplate supports two modes:
 * 1) No API key: heuristic mock reasoning (offline-friendly)
 * 2) OPENAI_API_KEY present: optional real LLM call (using fetch)
 */

function heuristicReasoning(input, deterministicResult) {
  const { metrics, riskScore } = deterministicResult;
  const patterns = [];
  const missingSignals = [];

  if (metrics.nearThresholdCount >= 2) patterns.push('Potential structuring / threshold avoidance');
  if (metrics.txCount >= 3) patterns.push('Velocity pattern across multiple transactions');
  if (metrics.uniqueChannels >= 3) patterns.push('Possible layering via multi-channel movement');

  if (!input.customer_profile?.occupation) {
    missingSignals.push('Missing customer occupation/business profile');
  }
  if (!input.transactions?.every((t) => t.timestamp)) {
    missingSignals.push('Missing full transaction timestamps for temporal analysis');
  }
  if (!input.customer_profile?.expected_monthly_volume) {
    missingSignals.push('Missing expected monthly volume baseline');
  }

  const llmRiskAdjustment = patterns.length >= 2 ? 5 : 0;
  const challenged = riskScore < 45 && patterns.length >= 2;

  return {
    summary: challenged
      ? 'Observed suspicious behavior suggests risk may be underestimated by deterministic logic.'
      : 'Behavioral analysis is broadly consistent with deterministic score.',
    patterns,
    missingSignals,
    llmRiskAdjustment,
    llmDisagreement: challenged,
    confidence: missingSignals.length >= 2 ? 0.62 : 0.8
  };
}

async function openAIReasoning(input, deterministicResult) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return heuristicReasoning(input, deterministicResult);
  }

  const payload = {
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content:
          'You are an AML triage reviewer. Validate/challenge deterministic score. Return strict JSON only.'
      },
      {
        role: 'user',
        content: JSON.stringify({ input, deterministic: deterministicResult })
      }
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'aml_llm_reasoning',
        schema: {
          type: 'object',
          properties: {
            summary: { type: 'string' },
            patterns: { type: 'array', items: { type: 'string' } },
            missingSignals: { type: 'array', items: { type: 'string' } },
            llmRiskAdjustment: { type: 'number' },
            llmDisagreement: { type: 'boolean' },
            confidence: { type: 'number' }
          },
          required: [
            'summary',
            'patterns',
            'missingSignals',
            'llmRiskAdjustment',
            'llmDisagreement',
            'confidence'
          ],
          additionalProperties: false
        }
      }
    }
  };

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    return heuristicReasoning(input, deterministicResult);
  }

  const body = await res.json();
  const content = body?.choices?.[0]?.message?.content;
  if (!content) {
    return heuristicReasoning(input, deterministicResult);
  }

  try {
    return JSON.parse(content);
  } catch {
    return heuristicReasoning(input, deterministicResult);
  }
}

export async function runLLMReasoning(input, deterministicResult) {
  return openAIReasoning(input, deterministicResult);
}
