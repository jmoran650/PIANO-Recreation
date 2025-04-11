
/**
 * Helper function to convert an inventory object into a comma-separated string.
 */
export function formatInventory(inventory: Record<string, number>): string {
    return Object.entries(inventory)
      .map(([item, qty]) => `${item}(${qty})`)
      .join(', ');
  }
  