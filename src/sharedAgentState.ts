import OpenAI from "openai"; // Import the base OpenAI type
import { Vec3 } from "vec3";
import { LogEntry } from "../types/log.types";
import {
  EquippedItems,
  VisibleBlockTypes,
  VisibleMobs,
} from "../types/sharedAgentState.types";
// Import specific types from the OpenAI library's structure
// Note: Depending on your OpenAI library version, the exact path might slightly differ.
// Check node_modules/openai/resources/chat/completions.mjs or similar for exports.
import type {
  ChatCompletion,
  ChatCompletionMessage,
  ChatCompletionMessageToolCall,
} from "openai/resources/chat/completions";

// Removed the unused OpenAIResponsePayload interface

export class SharedAgentState {
  public readonly botUsername: string;

  private _visibleBlockTypes: VisibleBlockTypes | null = null;
  private _visibleMobs: VisibleMobs | null = null;
  private _playersNearby: string[] = [];
  private _inventory: string[] = [];
  private _botHealth = 20;
  private _botHunger = 20;

  private _shortTermMemoryIndex: Map<string, string>;
  private _longTermMemoryIndex: Map<string, string>;
  private _locationMemoryIndex: Map<string, Vec3>;

  private _longTermGoalQueue: string[] = [];
  private _currentLongTermGoal: string | null = null;
  private _currentShortTermGoal: string | null = null;
  private _pendingActions: string[] = [];

  private _feelingsToOthers: Map<
    string,
    { sentiment: number; reasons: string[] }
  >;
  private _othersFeelingsTowardsSelf: Map<
    string,
    { sentiment: number; reasons: string[] }
  >;

  private _conversationLog: LogEntry[] = [];

  private _lockedInTask = false;
  private _craftingTablePositions: Vec3[] = [];
  private _equippedItems: EquippedItems = {
    head: null,
    chest: null,
    legs: null,
    feet: null,
    offhand: null,
  };

  private _botPosition: { x: number; y: number; z: number } = {
    x: 0,
    y: 0,
    z: 0,
  };

  constructor(username: string) {
    this.botUsername = username;
    this._shortTermMemoryIndex = new Map();
    this._longTermMemoryIndex = new Map();
    this._locationMemoryIndex = new Map();
    this._feelingsToOthers = new Map();
    this._othersFeelingsTowardsSelf = new Map();
  }

  // --- Getters and Setters (Unchanged) ---
  public get visibleBlockTypes() {
    return this._visibleBlockTypes;
  }

  public set visibleBlockTypes(
    data: {
      BlockTypes: Record<string, { x: number; y: number; z: number }>;
    } | null
  ) {
    this._visibleBlockTypes = data;
  }

  public get visibleMobs() {
    return this._visibleMobs;
  }

  public set visibleMobs(
    data: { Mobs: { name: string; distance: number }[] } | null
  ) {
    this._visibleMobs = data;
  }

  public get playersNearby() {
    return this._playersNearby;
  }

  public set playersNearby(playerList: string[]) {
    this._playersNearby = playerList;
  }

  public get inventory(): string[] {
    return this._inventory;
  }

  public set inventory(items: string[]) {
    this._inventory = items;
  }

  public get botHealth(): number {
    return this._botHealth;
  }

  public set botHealth(health: number) {
    this._botHealth = health;
  }

  public get botHunger(): number {
    return this._botHunger;
  }

  public set botHunger(hunger: number) {
    this._botHunger = hunger;
  }

  public get botPosition() {
    return this._botPosition;
  }

  public set botPosition(pos: { x: number; y: number; z: number }) {
    this._botPosition = pos;
  }

  public get shortTermMemoryIndex(): Map<string, string> {
    return this._shortTermMemoryIndex;
  }

  public get longTermMemoryIndex(): Map<string, string> {
    return this._longTermMemoryIndex;
  }

  public get locationMemoryIndex(): Map<string, Vec3> {
    return this._locationMemoryIndex;
  }

  public addShortTermMemory(key: string, value: string): void {
    this._shortTermMemoryIndex.set(key, value);
  }

  public removeShortTermMemory(key: string): void {
    this._shortTermMemoryIndex.delete(key);
  }

  public addLongTermMemory(key: string, value: string): void {
    this._longTermMemoryIndex.set(key, value);
  }

  public addLocationMemory(key: string, coords: Vec3): void {
    this._locationMemoryIndex.set(key, coords);
  }

  public get longTermGoalQueue(): string[] {
    return this._longTermGoalQueue;
  }

  public set longTermGoalQueue(newQueue: string[]) {
    this._longTermGoalQueue = newQueue;
  }

  public get currentLongTermGoal(): string | null {
    return this._currentLongTermGoal;
  }

  public set currentLongTermGoal(goal: string | null) {
    this._currentLongTermGoal = goal;
  }

  public get currentShortTermGoal(): string | null {
    return this._currentShortTermGoal;
  }

  public set currentShortTermGoal(goal: string | null) {
    this._currentShortTermGoal = goal;
  }

  public get pendingActions(): string[] {
    return this._pendingActions;
  }

  public set pendingActions(actions: string[]) {
    this._pendingActions = actions;
  }

  public addPendingAction(action: string) {
    this._pendingActions.push(action);
  }

  public get feelingsToOthers() {
    return this._feelingsToOthers;
  }

  public get othersFeelingsTowardsSelf() {
    return this._othersFeelingsTowardsSelf;
  }

  public get conversationLog(): LogEntry[] {
    return this._conversationLog;
  }

  public logMessage(
    role: LogEntry["role"],
    content: string,
    metadata?: Record<string, unknown>,
    functionName?: string,
    functionArgs?: unknown,
    functionResult?: string
  ): void {
    // Create the base entry object
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      role,
      content,
      metadata: metadata || {},
    };

    // Conditionally add optional properties
    if (functionName !== undefined) {
      entry.functionName = functionName;
    }
    if (functionArgs !== undefined) {
      entry.arguments = functionArgs;
    }
    if (functionResult !== undefined) {
      entry.result = functionResult;
    }

    this._conversationLog.push(entry);
  }

  public updateFeelingsTowards(
    person: string,
    sentiment: number,
    reasons: string[]
  ): void {
    this._feelingsToOthers.set(person, { sentiment, reasons });
  }

  public updateOthersFeelingsTowardsSelf(
    person: string,
    sentiment: number,
    reasons: string[]
  ): void {
    this._othersFeelingsTowardsSelf.set(person, { sentiment, reasons });
  }

  public get lockedInTask(): boolean {
    return this._lockedInTask;
  }

  public set lockedInTask(value: boolean) {
    this._lockedInTask = value;
  }

  public get craftingTablePositions(): Vec3[] {
    return this._craftingTablePositions;
  }

  public addCraftingTablePosition(pos: Vec3): void {
    this._craftingTablePositions.push(pos);
  }

  public get equippedItems() {
    return this._equippedItems;
  }

  public set equippedItems(value: {
    head: string | null;
    chest: string | null;
    legs: string | null;
    feet: string | null;
    offhand: string | null;
  }) {
    this._equippedItems = value;
  }

  public getSharedStateAsText(): string {
    // --- (Unchanged) ---
    let text = "";
    text += `Bot Status: < Health: ${this.botHealth}, Hunger: ${this.botHunger} >`;

    const invSummary =
      this.inventory && this.inventory.length > 0
        ? this.inventory.join(", ")
        : "(nothing)";
    text += `Inventory: < ${invSummary} >`;

    text += `Position: < x=${this.botPosition.x.toFixed(
      1
    )}, y=${this.botPosition.y.toFixed(1)}, z=${this.botPosition.z.toFixed(
      1
    )} >`;

    if (this.visibleMobs && this.visibleMobs.Mobs.length > 0) {
      const sortedMobs = this.visibleMobs.Mobs.slice().sort(
        (a, b) => a.distance - b.distance
      );
      const topTenClosestMobs = sortedMobs.slice(0, 10);
      const mobSummary = topTenClosestMobs
        .map((m) => `${m.name} (~${m.distance.toFixed(1)}m away)`)
        .join(", ");
      text += `Mobs: < ${mobSummary} >`;
    } else {
      text += "Mobs: < none >";
    }

    if (this.visibleBlockTypes && this.visibleBlockTypes.BlockTypes) {
      const blocks = this.visibleBlockTypes.BlockTypes;
      const blockSummary = Object.entries(blocks)
        .map(([name, pos]) => `${name} (x=${pos.x}, y=${pos.y}, z=${pos.z})`)
        .join(", ");
      text += `Nearby Block Types: < ${blockSummary} >`;
    }

    const playersNearby =
      this.playersNearby && this.playersNearby.length > 0
        ? this.playersNearby.join(", ")
        : "none";
    text += `Nearby Players: < ${playersNearby} >`;

    return text;
  }

  public logOpenAIRequest(endpoint: string, payload: unknown): void {
    // --- (Unchanged - Assuming payload structure check is sufficient here) ---
    let storeValue: unknown = undefined;
    if (typeof payload === "object" && payload !== null && "store" in payload) {
      storeValue = (payload as { store?: unknown }).store;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      role: "api_request",
      content: `Request to ${endpoint}`,
      endpoint,
      payload,
      metadata: storeValue !== undefined ? { store: storeValue } : {},
    };
    this._conversationLog.push(entry);
  }

  /**
   * Logs a successful response from the OpenAI API.
   * Assumes the response is a valid ChatCompletion object.
   * @param endpoint The API endpoint that was called.
   * @param response The ChatCompletion response object from the OpenAI API.
   */
  public logOpenAIResponse(
    endpoint: string,
    // Use the specific type from the OpenAI library
    response: ChatCompletion
  ): void {
    let contentSummary = `Response from ${endpoint}`;
    let firstChoiceMessage: ChatCompletionMessage | null = null;

    // Safely access choices and the message from the first choice
    if (response.choices && response.choices.length > 0) {
      firstChoiceMessage = response.choices[0].message;
    }

    if (firstChoiceMessage) {
      // Check for text content
      if (typeof firstChoiceMessage.content === "string") {
        contentSummary += `: "${firstChoiceMessage.content.substring(
          0,
          50
        )}..."`;
      }
      // Check for tool calls
      else if (
        firstChoiceMessage.tool_calls &&
        Array.isArray(firstChoiceMessage.tool_calls) &&
        firstChoiceMessage.tool_calls.length > 0
      ) {
        // Use the specific type for tool calls in the response
        const firstToolCall: ChatCompletionMessageToolCall =
          firstChoiceMessage.tool_calls[0];
        // Safely access function name
        if (firstToolCall.function && firstToolCall.function.name) {
          contentSummary += ` (Tool Call: ${firstToolCall.function.name})`;
        } else {
          contentSummary += ` (Tool Call: unknown function)`; // Or log type if not function
        }
      }
    } else {
      contentSummary += ` (No message content or tool calls found in first choice)`;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      role: "api_response",
      content: contentSummary, // Use the generated summary
      endpoint,
      response: response, // Log the full response object
    };
    this._conversationLog.push(entry);
  }

  /**
   * Logs an error received from the OpenAI API or during the request.
   * @param endpoint The API endpoint that was called.
   * @param error The error object.
   */
  public logOpenAIError(endpoint: string, error: unknown): void {
    let errorMessage = "Unknown error";
    let errorDetails: Record<string, unknown> = {};

    // Check if it's an OpenAI APIError for structured details
    if (error instanceof OpenAI.APIError) {
      errorMessage = error.message || "OpenAI API Error";
      errorDetails = {
        status: error.status,
        type: error.type,
        code: error.code,
        param: error.param,
        // You might want to log error.headers if needed
      };
    } else if (error instanceof Error) {
      // Handle standard JavaScript errors
      errorMessage = error.message;
      errorDetails = {
        name: error.name,
        stack: error.stack, // Optional: log stack trace
      };
    } else {
      // Fallback for non-Error types
      errorMessage = String(error);
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      role: "api_error",
      content: `Error from ${endpoint}: ${errorMessage}`,
      endpoint,
      // Log structured details if available, otherwise the string representation
      error:
        errorDetails.status || errorDetails.name ? errorDetails : String(error),
    };
    this._conversationLog.push(entry);
  }
}
