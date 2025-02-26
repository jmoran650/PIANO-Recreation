// src/sharedAgentState.ts
import { Vec3 } from "vec3";

/**
 * SharedAgentState
 *
 * A centralized data store that each module can read from and write to.
 * This allows concurrency, coherence, and an explicit "bottleneck" for data flow.
 */
export class SharedAgentState {
  /**
   * -----------------------------
   * 1) Environment Snapshot Data
   * -----------------------------
   * This is where environment-related information that the Observer collects can be stored:
   *   - Visible block types
   *   - Visible mobs
   *   - Player presence, etc.
   */
  private _visibleBlockTypes: {
    BlockTypes: {
      [blockName: string]: { x: number; y: number; z: number };
    };
  } | null = null;

  private _visibleMobs: {
    Mobs: { name: string; distance: number }[];
  } | null = null;

  // Example for storing info about which players are nearby or in the environment
  private _playersNearby: string[] = [];

  // New properties for inventory, health, and hunger
  private _inventory: string[] = [];
  private _botHealth: number = 20;
  private _botHunger: number = 20;

  /**
   * -----------------------------
   * 2) Memory Indices
   * -----------------------------
   * Optionally store references to short-term or long-term memory keys
   * or replicate the entire Memory class's data here if you prefer fully centralized storing.
   */
  private _shortTermMemoryIndex: Map<string, string>; // e.g. name => info
  private _longTermMemoryIndex: Map<string, string>; // e.g. name => info
  private _locationMemoryIndex: Map<string, Vec3>; // e.g. name => coords

  /**
   * -----------------------------
   * 3) Goals & Actions
   * -----------------------------
   * Data for the Goals module and potential subtask breakdowns.
   */
  private _longTermGoalQueue: string[] = [];
  private _currentLongTermGoal: string | null = null;
  private _currentShortTermGoal: string | null = null;

  // If your agent wants to store planned or pending actions in the shared state:
  private _pendingActions: string[] = [];

  /**
   * -----------------------------
   * 4) Social Context
   * -----------------------------
   * Data for the Social module: feelings towards others, how others feel about us, conversation logs, etc.
   */
  private _feelingsToOthers: Map<
    string,
    { sentiment: number; reasons: string[] }
  >;
  private _othersFeelingsTowardsSelf: Map<
    string,
    { sentiment: number; reasons: string[] }
  >;

  // Optionally store conversation logs or chat messages for higher-level processing
  private _conversationLog: string[] = [];

  /**
   * -----------------------------
   * 5) Status Flags / Lock-Ins
   * -----------------------------
   * The CognitiveController has a notion of “lockedInTask.” That can live here too.
   */
  private _lockedInTask: boolean = false;

  /**
   * -----------------------------
   * 6) Initialization
   * -----------------------------
   */
  constructor() {
    // Initialize memory data
    this._shortTermMemoryIndex = new Map();
    this._longTermMemoryIndex = new Map();
    this._locationMemoryIndex = new Map();

    this._feelingsToOthers = new Map();
    this._othersFeelingsTowardsSelf = new Map();
  }

  /**
   * -----------------------------
   * 7) Environment Snapshot Methods
   * -----------------------------
   */
  public get visibleBlockTypes() {
    return this._visibleBlockTypes;
  }
  public set visibleBlockTypes(
    data: {
      BlockTypes: { [blockName: string]: { x: number; y: number; z: number } };
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

  // New getters and setters for inventory, health, and hunger
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

  /**
   * -----------------------------
   * 8) Memory Index Methods
   * -----------------------------
   */
  public get shortTermMemoryIndex(): Map<string, string> {
    return this._shortTermMemoryIndex;
  }

  public get longTermMemoryIndex(): Map<string, string> {
    return this._longTermMemoryIndex;
  }

  public get locationMemoryIndex(): Map<string, Vec3> {
    return this._locationMemoryIndex;
  }

  // Example methods to add or remove memory items:
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

  /**
   * -----------------------------
   * 9) Goals & Actions
   * -----------------------------
   */
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

  /**
   * -----------------------------
   * 10) Social Context
   * -----------------------------
   */
  public get feelingsToOthers() {
    return this._feelingsToOthers;
  }

  public get othersFeelingsTowardsSelf() {
    return this._othersFeelingsTowardsSelf;
  }

  public get conversationLog(): string[] {
    return this._conversationLog;
  }

  public addToConversationLog(line: string): void {
    this._conversationLog.push(line);
  }

  /**
   * Helper to update feelings towards a person.
   */
  public updateFeelingsTowards(
    person: string,
    sentiment: number,
    reasons: string[]
  ): void {
    this._feelingsToOthers.set(person, { sentiment, reasons });
  }

  /**
   * Helper to update how a person feels about the agent.
   */
  public updateOthersFeelingsTowardsSelf(
    person: string,
    sentiment: number,
    reasons: string[]
  ): void {
    this._othersFeelingsTowardsSelf.set(person, { sentiment, reasons });
  }

  /**
   * -----------------------------
   * 11) Lock Status
   * -----------------------------
   */
  public get lockedInTask(): boolean {
    return this._lockedInTask;
  }
  public set lockedInTask(value: boolean) {
    this._lockedInTask = value;
  }
}
