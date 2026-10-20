import { useHome } from '../../store/useHome';
import { GroceryLine } from './planner';

/** Put the plan's shopping into Gawain's own list (Groceries tab), merging with items already there. */
export function addToGroceries(lines: GroceryLine[]): number {
  const { items, saveItem } = useHome.getState();
  let added = 0;
  for (const l of lines) {
    const existing = items.find((i) => i.name.toLowerCase() === l.name.toLowerCase());
    if (existing) saveItem({ ...existing, onList: true, note: l.buy });
    else saveItem({ name: l.name, aisle: l.aisle, store: null, note: l.buy, tracked: false, lastsDays: null, onList: true });
    added++;
  }
  return added;
}
