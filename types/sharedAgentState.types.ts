interface VisibleBlockInfo { x: number; y: number; z: number; }

export interface VisibleBlockTypes { BlockTypes: Record<string, VisibleBlockInfo>; }

interface VisibleMobInfo { name: string; distance: number; }

export interface VisibleMobs { Mobs: VisibleMobInfo[]; }

export interface EquippedItems {
    head: string | null;
    chest: string | null;
    legs: string | null;
    feet: string | null;
    offhand: string | null;
}

