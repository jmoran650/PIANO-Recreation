import test from 'node:test';
import assert from 'node:assert/strict';

import { getLLMMetrics, setLLMEnabled, toggleLLMEnabled } from '../../utils/llmWrapper';
import * as llmWrapper from '../../utils/llmWrapper';

// Ensure a clean environment before each test
const timestamps = (llmWrapper as any).llmRequestTimestamps as number[] | undefined;

test('toggleLLMEnabled reflects setLLMEnabled changes', () => {
  // Start from a known state
  setLLMEnabled(false);
  let result = toggleLLMEnabled();
  assert.strictEqual(result, true, 'toggle should enable when previously disabled');
  result = toggleLLMEnabled();
  assert.strictEqual(result, false, 'toggle should disable when previously enabled');
});

test('getLLMMetrics counts simulated requests', () => {
  if (!timestamps) throw new Error('llmRequestTimestamps not accessible');
  const before = getLLMMetrics();
  // Simulate two requests within the last 10 minutes
  timestamps.push(Date.now(), Date.now());
  const after = getLLMMetrics();
  assert.strictEqual(
    after.requestsLast10Min,
    before.requestsLast10Min + 2,
    'requestsLast10Min should increase by number of new timestamps'
  );
});
