import 'dotenv/config';
import express from 'express';
import { computeDeterministicRisk, finalDecision } from './triageEngine.js';
import { runLLMReasoning } from './llmReasoner.js';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));
app.use(express.static('public'));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/triage', async (req, res) => {
  try {
    const input = req.body;

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

    res.json({
      decision,
      risk_score: combinedRisk,
      reason_codes: deterministic.reasonCodes,
      llm_disagreement: Boolean(llm.llmDisagreement),
      explanation: llm.summary,
      confidence: llm.confidence,
      trace: deterministic.trace,
      llm_patterns: llm.patterns,
      missing_signals: llm.missingSignals
    });
  } catch (error) {
    res.status(400).json({
      error: 'Unable to triage alert',
      details: error.message
    });
  }
});

app.listen(port, () => {
  console.log(`AML triage server listening on http://localhost:${port}`);
});
