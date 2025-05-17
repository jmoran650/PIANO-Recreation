import test from 'node:test';
import assert from 'node:assert/strict';
import { Memory } from '../../src/functions/memory/memory';
import { SharedAgentState } from '../../src/sharedAgentState';

test('short-term memory promotion and access', () => {
  const shared = new SharedAgentState('bot');
  const memory = new Memory(shared);

  for (let i = 1; i <= 11; i++) {
    memory.addShortTermMemory(`mem${i}`, `info${i}`);
  }

  assert.equal(shared.shortTermMemoryIndex.size, 10);
  assert.ok(!shared.shortTermMemoryIndex.has('mem1'));
  assert.equal(shared.longTermMemoryIndex.get('mem1'), 'info1');

  memory.removeShortTermMemory('mem2');
  assert.equal(shared.longTermMemoryIndex.get('mem2'), 'info2');
  assert.ok(!shared.shortTermMemoryIndex.has('mem2'));
  assert.equal(shared.shortTermMemoryIndex.size, 9);
  assert.equal(shared.longTermMemoryIndex.size, 2);

  const res = memory.getShortTermMemory('mem3');
  assert.equal(res, 'info3');
  assert.ok(shared.shortTermMemoryIndex.has('mem3'));

  memory.addShortTermMemory('mem12', 'info12');
  assert.equal(shared.shortTermMemoryIndex.size, 10);
  assert.equal(shared.longTermMemoryIndex.size, 3);
  assert.ok(!shared.shortTermMemoryIndex.has('mem4'));
  assert.equal(shared.longTermMemoryIndex.get('mem4'), 'info4');
});
