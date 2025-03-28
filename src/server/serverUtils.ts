// New file: src/serverUtils.ts
import { Vec3 } from "vec3";
import { SharedAgentState } from "../sharedAgentState"; // Adjust import path if needed
import { getLLMMetrics } from "../../utils/llmWrapper"; // Adjust import path if needed

// --- Helper Functions for Map Serialization ---

function mapToObj(map: Map<string, string>): Record<string, string> {
  const obj: Record<string, string> = {};
  for (const [key, value] of map.entries()) {
    obj[key] = value;
  }
  return obj;
}

function mapToObjVec3(
  map: Map<string, { x: number; y: number; z: number }>
): Record<string, { x: number; y: number; z: number }> {
  const obj: Record<string, { x: number; y: number; z: number }> = {};
  for (const [key, value] of map.entries()) {
    if (value) {
        obj[key] = { x: value.x, y: value.y, z: value.z };
    }
  }
  return obj;
}

function mapToObjSentiment(
  map: Map<string, { sentiment: number; reasons: string[] }>
): Record<string, { sentiment: number; reasons: string[] }> {
  const obj: Record<string, { sentiment: number; reasons: string[] }> = {};
  for (const [key, value] of map.entries()) {
    if (value) {
        obj[key] = { sentiment: value.sentiment, reasons: value.reasons };
    }
  }
  return obj;
}

// --- Main Serialization Function ---

export function serializeSharedState(sharedState: SharedAgentState): any { // Consider defining a specific return type
  return {
    visibleBlockTypes: sharedState.visibleBlockTypes,
    visibleMobs: sharedState.visibleMobs,
    playersNearby: sharedState.playersNearby,
    shortTermMemoryIndex: mapToObj(sharedState.shortTermMemoryIndex),
    longTermMemoryIndex: mapToObj(sharedState.longTermMemoryIndex),
    locationMemoryIndex: mapToObjVec3(sharedState.locationMemoryIndex),
    longTermGoalQueue: sharedState.longTermGoalQueue,
    currentLongTermGoal: sharedState.currentLongTermGoal,
    currentShortTermGoal: sharedState.currentShortTermGoal,
    pendingActions: sharedState.pendingActions,
    lockedInTask: sharedState.lockedInTask,
    feelingsToOthers: mapToObjSentiment(sharedState.feelingsToOthers),
    othersFeelingsTowardsSelf: mapToObjSentiment(
      sharedState.othersFeelingsTowardsSelf
    ),
    conversationLog: sharedState.conversationLog,
    llmMetrics: getLLMMetrics(),
    inventory: sharedState.inventory, // Assuming inventory is already serializable (e.g., string[])
    botHealth: sharedState.botHealth,
    botHunger: sharedState.botHunger,
    botPosition: sharedState.botPosition ?? { x:0, y:0, z:0 },
    craftingTablePositions: sharedState.craftingTablePositions, // Assuming Vec3[] is serializable or handled
    equippedItems: sharedState.equippedItems, // Assuming EquippedItems is serializable
  };
}