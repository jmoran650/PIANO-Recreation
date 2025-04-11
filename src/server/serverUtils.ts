// File: src/server/serverUtils.ts

import { SharedAgentState } from '../sharedAgentState';
import { getLLMMetrics } from '../../utils/llmWrapper';
import { LogEntry } from '../../types/log.types'; // Import LogEntry
import { EquippedItems, VisibleBlockTypes, VisibleMobs } from '../../types/sharedAgentState.types'; // Import necessary types

// --- NEW INTERFACE DEFINITIONS ---

// Define the structure for serialized Vec3
interface SerializedVec3 {
  x: number;
  y: number;
  z: number;
}

// Define the structure for serialized sentiment
interface SerializedSentiment {
  sentiment: number;
  reasons: string[];
}

// Define the structure for LLM metrics (based on getLLMMetrics return type)
interface LLMMetrics {
  totalRequests: number;
  requestsLast10Min: number;
  totalInputChars: number;
  totalOutputChars: number;
}

// Define the main SerializedState interface
export interface SerializedState {
  visibleBlockTypes: VisibleBlockTypes | null;
  visibleMobs: VisibleMobs | null;
  playersNearby: string[];
  shortTermMemoryIndex: Record<string, string>;
  longTermMemoryIndex: Record<string, string>;
  locationMemoryIndex: Record<string, SerializedVec3>;
  longTermGoalQueue: string[];
  currentLongTermGoal: string | null;
  currentShortTermGoal: string | null;
  pendingActions: string[];
  lockedInTask: boolean;
  feelingsToOthers: Record<string, SerializedSentiment>;
  othersFeelingsTowardsSelf: Record<string, SerializedSentiment>;
  conversationLog: LogEntry[];
  llmMetrics: LLMMetrics;
  inventory: string[];
  botHealth: number;
  botHunger: number;
  botPosition: SerializedVec3;
  craftingTablePositions: SerializedVec3[];
  equippedItems: EquippedItems;
}

// --- END NEW INTERFACE DEFINITIONS ---


// Helper function mapToObj (unchanged)
function mapToObj(map: Map<string, string>): Record<string, string> {
  const obj: Record<string, string> = {};
  for (const [key, value] of map.entries()) {
    obj[key] = value;
  }
  return obj;
}

// Helper function mapToObjVec3 (unchanged, but ensure its return type matches SerializedVec3)
function mapToObjVec3(
  map: Map<string, { x: number; y: number; z: number }>
): Record<string, SerializedVec3> { // Use SerializedVec3 here
  const obj: Record<string, SerializedVec3> = {}; // Use SerializedVec3 here
  for (const [key, value] of map.entries()) {
    if (value) {
      // Ensure the structure matches SerializedVec3
      obj[key] = { x: value.x, y: value.y, z: value.z };
    }
  }
  return obj;
}

// Helper function mapToObjSentiment (unchanged, but ensure its return type matches SerializedSentiment)
function mapToObjSentiment(
  map: Map<string, { sentiment: number; reasons: string[] }>
): Record<string, SerializedSentiment> { // Use SerializedSentiment here
  const obj: Record<string, SerializedSentiment> = {}; // Use SerializedSentiment here
  for (const [key, value] of map.entries()) {
    if (value) {
      // Ensure the structure matches SerializedSentiment
      obj[key] = { sentiment: value.sentiment, reasons: value.reasons };
    }
  }
  return obj;
}


// --- UPDATED serializeSharedState function ---
// Change the return type from 'any' to 'SerializedState'
export function serializeSharedState(sharedState: SharedAgentState): SerializedState {
  return {
    visibleBlockTypes: sharedState.visibleBlockTypes,
    visibleMobs: sharedState.visibleMobs,
    playersNearby: sharedState.playersNearby,
    shortTermMemoryIndex: mapToObj(sharedState.shortTermMemoryIndex),
    longTermMemoryIndex: mapToObj(sharedState.longTermMemoryIndex),
    locationMemoryIndex: mapToObjVec3(sharedState.locationMemoryIndex), // Uses helper that returns Record<string, SerializedVec3>
    longTermGoalQueue: sharedState.longTermGoalQueue,
    currentLongTermGoal: sharedState.currentLongTermGoal,
    currentShortTermGoal: sharedState.currentShortTermGoal,
    pendingActions: sharedState.pendingActions,
    lockedInTask: sharedState.lockedInTask,
    feelingsToOthers: mapToObjSentiment(sharedState.feelingsToOthers), // Uses helper that returns Record<string, SerializedSentiment>
    othersFeelingsTowardsSelf: mapToObjSentiment(
      sharedState.othersFeelingsTowardsSelf
    ), // Uses helper that returns Record<string, SerializedSentiment>
    conversationLog: sharedState.conversationLog, // Assumes LogEntry is serializable
    llmMetrics: getLLMMetrics(), // Assumes getLLMMetrics return type matches LLMMetrics interface
    inventory: sharedState.inventory,
    botHealth: sharedState.botHealth,
    botHunger: sharedState.botHunger,
    botPosition: sharedState.botPosition ?? { x: 0, y: 0, z: 0 }, // Matches SerializedVec3 structure
    // Explicitly map Vec3[] to SerializedVec3[]
    craftingTablePositions: sharedState.craftingTablePositions.map(pos => ({ x: pos.x, y: pos.y, z: pos.z })),
    equippedItems: sharedState.equippedItems, // Assumes EquippedItems is serializable
  };
}