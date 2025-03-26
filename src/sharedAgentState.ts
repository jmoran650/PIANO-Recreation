import { Vec3 } from "vec3";

export class SharedAgentState {
  private _visibleBlockTypes: {
    BlockTypes: {
      [blockName: string]: { x: number; y: number; z: number };
    };
  } | null = null;

  private _visibleMobs: {
    Mobs: { name: string; distance: number }[];
  } | null = null;

  private _playersNearby: string[] = [];
  private _inventory: string[] = [];
  private _botHealth: number = 20;
  private _botHunger: number = 20;

  private _shortTermMemoryIndex: Map<string, string>;
  private _longTermMemoryIndex: Map<string, string>;
  private _locationMemoryIndex: Map<string, Vec3>;

  private _longTermGoalQueue: string[] = [];
  private _currentLongTermGoal: string | null = null;
  private _currentShortTermGoal: string | null = null;
  private _pendingActions: string[] = [];

  private _feelingsToOthers: Map<string, { sentiment: number; reasons: string[] }>;
  private _othersFeelingsTowardsSelf: Map<string, { sentiment: number; reasons: string[] }>;

  private _conversationLog: string[] = [];

  private _lockedInTask: boolean = false;
  private _craftingTablePositions: Vec3[] = [];
  private _equippedItems: {
    head: string | null;
    chest: string | null;
    legs: string | null;
    feet: string | null;
    offhand: string | null;
  } = { head: null, chest: null, legs: null, feet: null, offhand: null };

  private _botPosition: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };

  constructor() {
    this._shortTermMemoryIndex = new Map();
    this._longTermMemoryIndex = new Map();
    this._locationMemoryIndex = new Map();
    this._feelingsToOthers = new Map();
    this._othersFeelingsTowardsSelf = new Map();
  }

  public get visibleBlockTypes() {
    return this._visibleBlockTypes;
  }

  public set visibleBlockTypes(
    data: { BlockTypes: { [blockName: string]: { x: number; y: number; z: number } } } | null
  ) {
    this._visibleBlockTypes = data;
  }

  public get visibleMobs() {
    return this._visibleMobs;
  }

  public set visibleMobs(data: { Mobs: { name: string; distance: number }[] } | null) {
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

  public get conversationLog(): string[] {
    return this._conversationLog;
  }

  public logMessage(
    role: "user" | "assistant" | "function" | "system" | "memory",
    content: string,
    metadata?: any
  ): void {
    const entry = {
      timestamp: new Date().toISOString(),
      role,
      content,
      metadata: metadata || {}
    };
    const jsonStr = JSON.stringify(entry);
    this._conversationLog.push(jsonStr);
  }

  public updateFeelingsTowards(person: string, sentiment: number, reasons: string[]): void {
    this._feelingsToOthers.set(person, { sentiment, reasons });
  }

  public updateOthersFeelingsTowardsSelf(person: string, sentiment: number, reasons: string[]): void {
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

  public set equippedItems(
    value: {
      head: string | null;
      chest: string | null;
      legs: string | null;
      feet: string | null;
      offhand: string | null;
    }
  ) {
    this._equippedItems = value;
  }

  public getSharedStateAsText(): string {
    const st = this;
    let text = "";
    text += `Bot Status: < Health: ${st.botHealth}, Hunger: ${st.botHunger} >`;

    const invSummary =
      st.inventory && st.inventory.length > 0
        ? st.inventory.join(", ")
        : "(nothing)";
    text += `Inventory: < ${invSummary} >`;

    text += `Position: < x=${st.botPosition.x.toFixed(1)}, y=${st.botPosition.y.toFixed(
      1
    )}, z=${st.botPosition.z.toFixed(1)} >`;

    if (st.visibleMobs && st.visibleMobs.Mobs.length > 0) {
      const sortedMobs = st.visibleMobs.Mobs.slice().sort((a, b) => a.distance - b.distance);
      const topTenClosestMobs = sortedMobs.slice(0, 10);
      const mobSummary = topTenClosestMobs
        .map((m) => `${m.name} (~${m.distance.toFixed(1)}m away)`)
        .join(", ");
      text += `Mobs: < ${mobSummary} >`;
    } else {
      text += "Mobs: < none >";
    }

    if (st.visibleBlockTypes && st.visibleBlockTypes.BlockTypes) {
      const blocks = st.visibleBlockTypes.BlockTypes;
      const blockSummary = Object.entries(blocks)
        .map(([name, pos]) => `${name} (x=${pos.x}, y=${pos.y}, z=${pos.z})`)
        .join(", ");
      text += `Nearby Block Types: < ${blockSummary} >`;
    }

    const playersNearby = st.playersNearby && st.playersNearby.length > 0
      ? st.playersNearby.join(", ")
      : "none";
    text += `Nearby Players: < ${playersNearby} >`;

    return text;
  }

  // Convenience to log an outgoing OpenAI request
  public logOpenAIRequest(endpoint: string, payload: any): void {
    this.logMessage("system", `OpenAI Request to ${endpoint}`, {
      payload,
      timestamp: new Date().toISOString()
    });
  }

  // Convenience to log an OpenAI response
  public logOpenAIResponse(endpoint: string, response: any): void {
    this.logMessage("system", `OpenAI Response from ${endpoint}`, {
      response,
      timestamp: new Date().toISOString()
    });
  }

  // Convenience to log an OpenAI error
  public logOpenAIError(endpoint: string, error: any): void {
    this.logMessage("system", `OpenAI Error from ${endpoint}`, {
      error,
      timestamp: new Date().toISOString()
    });
  }
}