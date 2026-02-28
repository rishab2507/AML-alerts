import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { computeDeterministicRisk, finalDecision } from '../src/triageEngine.js';
import { runLLMReasoning } from '../src/llmReasoner.js';

const scenarios = [
  {
    name: 'scenario-1-low-risk-routine',
    expected: {
      decision: 'AUTO_CLOSE',
      riskScore: 0,
      llmDisagreement: false
    }
  },
  {
    name: 'scenario-2-structuring-pattern',
    expected: {
      decision: 'ANALYST_REVIEW',
      riskScore: 55,
      llmDisagreement: false
    }
  },
  {
    name: 'scenario-3-high-risk-escalation',
    expected: {
      decision: 'ESCALATE',
      riskScore: 100,
      llmDisagreement: false
    }
  },
  {
    name: 'scenario-4-llm-disagreement-low-score',
    expected: {
      decision: 'ANALYST_REVIEW',
      riskScore: 23,
      llmDisagreement: true
    }
  }
];

async function loadScenario(name) {
  const content = await readFile(`samples/scenarios/${name}.json`, 'utf8');
  return JSON.parse(content);
}

test('AML scenario coverage', async () => {
  for (const scenario of scenarios) {
    const input = await loadScenario(scenario.name);
    const deterministic = computeDeterministicRisk(input);
    const llm = await runLLMReasoning(input, deterministic);

    const combinedRisk = Math.max(
      0,
      Math.min(100, deterministic.riskScore + Number(llm.llmRiskAdjustment || 0))
    );

    const decision = finalDecision({
      riskScore: combinedRisk,
      llmDisagreement: Boolean(llm.llmDisagreement)
    });

    assert.equal(
      decision,
      scenario.expected.decision,
      `${scenario.name} decision mismatch`
    );
    assert.equal(
      combinedRisk,
      scenario.expected.riskScore,
      `${scenario.name} risk score mismatch`
    );
    assert.equal(
      Boolean(llm.llmDisagreement),
      scenario.expected.llmDisagreement,
      `${scenario.name} llm disagreement mismatch`
    );
  }
});
