import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vec3 } from 'vec3';
import { SharedAgentState } from '../../src/sharedAgentState';
import { serializeSharedState } from '../../src/server/serverUtils';
import { getLLMMetrics } from '../../utils/llmWrapper';

test('serializeSharedState converts internal structures', () => {
  const state = new SharedAgentState('tester');

  state.visibleBlockTypes = { BlockTypes: { dirt: { x: 1, y: 2, z: 3 } } };
  state.visibleMobs = { Mobs: [{ name: 'zombie', distance: 5 }] };
  state.playersNearby = ['Alice', 'Bob'];
  state.inventory = ['stone'];
  state.botHealth = 15;
  state.botHunger = 10;
  state.botPosition = { x: 2, y: 3, z: 4 };
  state.lockedInTask = true;
  state.longTermGoalQueue = ['goal1'];
  state.currentLongTermGoal = 'goal1';
  state.currentShortTermGoal = 'subgoal';
  state.pendingActions = ['mine'];

  state.addShortTermMemory('skey', 'sval');
  state.addLongTermMemory('lkey', 'lval');
  state.addLocationMemory('home', new Vec3(7, 8, 9));

  state.updateFeelingsTowards('Alice', 1, ['helpful']);
  state.updateOthersFeelingsTowardsSelf('Bob', -1, ['rude']);
  state.logMessage('user', 'hello');

  state.addCraftingTablePosition(new Vec3(4, 5, 6));
  state.equippedItems = { head: 'helmet', chest: null, legs: null, feet: null, offhand: 'shield' };

  const serialized = serializeSharedState(state);

  assert.deepEqual(serialized.shortTermMemoryIndex, { skey: 'sval' });
  assert.deepEqual(serialized.longTermMemoryIndex, { lkey: 'lval' });
  assert.deepEqual(serialized.locationMemoryIndex, { home: { x: 7, y: 8, z: 9 } });
  assert.deepEqual(serialized.feelingsToOthers, { Alice: { sentiment: 1, reasons: ['helpful'] } });
  assert.deepEqual(serialized.othersFeelingsTowardsSelf, { Bob: { sentiment: -1, reasons: ['rude'] } });

  assert.deepEqual(serialized.craftingTablePositions, [{ x: 4, y: 5, z: 6 }]);
  assert.deepEqual(serialized.llmMetrics, getLLMMetrics());
});
