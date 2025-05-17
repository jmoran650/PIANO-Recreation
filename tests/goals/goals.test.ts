import { Goals } from '../../src/goals';
import { SharedAgentState } from '../../src/sharedAgentState';

function createMockSharedState(): SharedAgentState {
  const state = new SharedAgentState('TestBot');
  state.longTermGoalQueue = [];
  state.currentLongTermGoal = null;
  state.currentShortTermGoal = null;
  return state;
}

describe('Goals long-term queue management', () => {
  test('addLongTermGoal sets current when none active', () => {
    const shared = createMockSharedState();
    const goals = new Goals(shared);
    goals.addLongTermGoal('goal1');
    expect(goals.getCurrentLongTermGoal()).toBe('goal1');
    expect(shared.longTermGoalQueue).toHaveLength(0);
  });

  test('addLongTermGoal queues subsequent goals', () => {
    const shared = createMockSharedState();
    const goals = new Goals(shared);
    goals.addLongTermGoal('goal1');
    goals.addLongTermGoal('goal2');
    goals.addLongTermGoal('goal3');
    expect(goals.getCurrentLongTermGoal()).toBe('goal1');
    expect(shared.longTermGoalQueue).toEqual(['goal2', 'goal3']);
  });

  test('advanceLongTermGoal shifts queue correctly', () => {
    const shared = createMockSharedState();
    const goals = new Goals(shared);
    goals.addLongTermGoal('goal1');
    goals.addLongTermGoal('goal2');
    goals.addLongTermGoal('goal3');
    goals.advanceLongTermGoal();
    expect(goals.getCurrentLongTermGoal()).toBe('goal2');
    expect(shared.longTermGoalQueue).toEqual(['goal3']);
    goals.advanceLongTermGoal();
    expect(goals.getCurrentLongTermGoal()).toBe('goal3');
    expect(shared.longTermGoalQueue).toEqual([]);
    goals.advanceLongTermGoal();
    expect(goals.getCurrentLongTermGoal()).toBeNull();
    expect(shared.currentShortTermGoal).toBeNull();
  });

  test('getCurrentLongTermGoal returns current goal', () => {
    const shared = createMockSharedState();
    const goals = new Goals(shared);
    expect(goals.getCurrentLongTermGoal()).toBeNull();
    goals.addLongTermGoal('goal1');
    expect(goals.getCurrentLongTermGoal()).toBe('goal1');
  });
});
