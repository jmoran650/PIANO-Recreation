import { Vec3 } from "vec3";

export class Memory {
  // Short term memory: a Map with a maximum of 10 entries.
  private shortTermMemory: Map<string, string>;
  // Long term memory: a Map with no size limit.
  private longTermMemory: Map<string, string>;
  // Location memory: a Map of name -> Vec3 coordinates.
  private locationMemory: Map<string, Vec3>;

  constructor() {
    this.shortTermMemory = new Map();
    this.longTermMemory = new Map();
    this.locationMemory = new Map();
  }

  /**
   * Adds a memory to short term memory. If the memory already exists,
   * it updates its recency. If the Map exceeds 10 entries, the least recently
   * used memory is removed and processed via stmToLtm.
   *
   * @param name - The name (key) for the memory.
   * @param info - The memory content as a string.
   */
  public async addShortTermMemory(name: string, info: string): Promise<void> {
    // If the memory already exists, remove it to update its order.
    if (this.shortTermMemory.has(name)) {
      this.shortTermMemory.delete(name);
    }
    this.shortTermMemory.set(name, info);
    // Enforce the maximum of 10 entries.
    if (this.shortTermMemory.size > 10) {
      const keyIter = this.shortTermMemory.keys().next();
      if (!keyIter.done) {
        const lruKey: string = keyIter.value;
        const lruInfo = this.shortTermMemory.get(lruKey);
        this.shortTermMemory.delete(lruKey);
        if (lruInfo !== undefined) {
          await this.stmToLtm(lruKey, lruInfo);
        }
      }
    }
  }

  /**
   * Retrieves a memory from short term memory and updates its recency.
   *
   * @param name - The key of the memory.
   * @returns The memory information or undefined if not found.
   */
  public getShortTermMemory(name: string): string | undefined {
    if (!this.shortTermMemory.has(name)) {
      return undefined;
    }
    const info = this.shortTermMemory.get(name)!;
    // Update recency: remove and re-add the memory.
    this.shortTermMemory.delete(name);
    this.shortTermMemory.set(name, info);
    return info;
  }

  /**
   * Removes a memory from short term memory and processes it via stmToLtm.
   *
   * @param name - The key of the memory to remove.
   */
  public async removeShortTermMemory(name: string): Promise<void> {
    if (this.shortTermMemory.has(name)) {
      const info = this.shortTermMemory.get(name);
      this.shortTermMemory.delete(name);
      if (info !== undefined) {
        await this.stmToLtm(name, info);
      }
    }
  }

  /**
   * Private method that simulates an LLM call to decide whether a memory
   * from short term memory should be moved to long term memory.
   *
   * @param name - The key of the memory.
   * @param info - The memory information.
   */
  private async stmToLtm(name: string, info: string): Promise<void> {
    // Simulate LLM decision-making (here, we simply decide to always store it).
    const shouldStoreInLongTerm = true; // Replace with an actual LLM call as needed.
    if (shouldStoreInLongTerm) {
      this.longTermMemory.set(name, info);
    }
  }

  /**
   * Retrieves a memory from long term memory.
   *
   * @param name - The key of the memory.
   * @returns The memory information or undefined if not found.
   */
  public getLongTermMemory(name: string): string | undefined {
    return this.longTermMemory.get(name);
  }

  /**
   * Adds a location to location memory.
   *
   * @param name - The name identifier for the location.
   * @param coords - The Vec3 coordinates of the location.
   */
  public addLocationMemory(name: string, coords: Vec3): void {
    this.locationMemory.set(name, coords);
  }

  /**
   * Retrieves a location from location memory.
   *
   * @param name - The name identifier of the location.
   * @returns The Vec3 coordinates or undefined if not found.
   */
  public getLocationMemory(name: string): Vec3 | undefined {
    return this.locationMemory.get(name);
  }

  /**
   * (Optional) Lists all short term memories.
   *
   * @returns An array of objects with memory names and info.
   */
  public listShortTermMemories(): Array<{ name: string; info: string }> {
    const memories: Array<{ name: string; info: string }> = [];
    for (const [name, info] of this.shortTermMemory.entries()) {
      memories.push({ name, info });
    }
    return memories;
  }

  /**
   * (Optional) Lists all long term memories.
   *
   * @returns An array of objects with memory names and info.
   */
  public listLongTermMemories(): Array<{ name: string; info: string }> {
    const memories: Array<{ name: string; info: string }> = [];
    for (const [name, info] of this.longTermMemory.entries()) {
      memories.push({ name, info });
    }
    return memories;
  }
}