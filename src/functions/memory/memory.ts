// src/memory.ts
import { Vec3 } from 'vec3';
import { SharedAgentState } from '../../sharedAgentState';

export class Memory {
  private sharedState: SharedAgentState;

  constructor(sharedState: SharedAgentState) {
    this.sharedState = sharedState;
  }

  public addShortTermMemory(name: string, info: string) {
    const stm = this.sharedState.shortTermMemoryIndex;

    if (stm.has(name)) {
      stm.delete(name);
    }
    stm.set(name, info);

    if (stm.size > 10) {
      const oldestKey = stm.keys().next().value as string; // We assert it's a string
      if (oldestKey) {
        const oldestInfo = stm.get(oldestKey);
        if (oldestInfo) {
          stm.delete(oldestKey);
          this.stmToLtm(oldestKey, oldestInfo);
        }
      }
    }
  }

  public getShortTermMemory(name: string): string | undefined {
    const stm = this.sharedState.shortTermMemoryIndex;
    const info = stm.get(name);
    if (info === undefined) throw new Error('Error in getShortTermMemory: info is undefined');
    stm.delete(name);
    stm.set(name, info);
    return info;
  }

  public removeShortTermMemory(name: string){
    const stm = this.sharedState.shortTermMemoryIndex;
    if (stm.has(name)) {
      const info = stm.get(name);
      stm.delete(name);
      if (info) {
        this.stmToLtm(name, info);
      }
    }
  }

  private stmToLtm(name: string, info: string) {
    //rewrite this function so that memories can be moved by ID into long term memory
    this.sharedState.longTermMemoryIndex.set(name, info);
  }

  public getLongTermMemory(name: string): string | undefined {
    return this.sharedState.longTermMemoryIndex.get(name);
  }

  public addLocationMemory(name: string, coords: Vec3): void {
    this.sharedState.locationMemoryIndex.set(name, coords);
  }

  public getLocationMemory(name: string): Vec3 | undefined {
    return this.sharedState.locationMemoryIndex.get(name);
  }
}
