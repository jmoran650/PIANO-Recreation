import 'mineflayer';
import { Item } from 'prismarine-item';

declare module 'mineflayer' {

  // We explicitly add the methods we need, including those from the base Window
  interface FurnaceWindow /* removed: extends Window */ { // Removed 'extends Window' for clarity, we'll add needed props manually
    // Methods from the furnace plugin
    fuelSlot(): Item | null;
    putFuel(itemType: number, metadata: number | null, count: number): Promise<void>;
    putInput(itemType: number, metadata: number | null, count: number): Promise<void>;

    // Explicitly add the 'close' method from the base Window type
    close(): void;

    // Add other base Window properties/methods if needed (e.g., slots, id)
    // slots: (Item | null)[];
    // id: number;
  }
}