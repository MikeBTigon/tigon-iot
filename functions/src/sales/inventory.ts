// Track 4 — Inventory (ideas 11, 12, 13, 14, 15): price-drop alerts, aged inventory, sold-cart cleanup + similar carts,
// repost queue, walk-around videos. DMS sync hooks live in ../mpAssistant.ts (this track edits it).
import type {SalesSettings} from './settings';

/** Once a day (New York morning): aged-inventory flags; Mondays the manager list. */
export async function inventoryDaily(_now: number, _s: SalesSettings): Promise<void> {
  return;
}
