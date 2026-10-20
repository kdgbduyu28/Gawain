/**
 * Small in-app events so features can react to each other without the store knowing
 * about them: the meal planner hears when a grocery is bought or a chore is done.
 */
export type AppEvent = { type: 'bought'; name: string; note: string; at: number } | { type: 'done'; choreId: string; at: number };

const listeners = new Set<(e: AppEvent) => void>();

export function emit(e: AppEvent) {
  for (const l of listeners) {
    try {
      l(e);
    } catch {
      // One feature failing shouldn't stop the others hearing about it.
    }
  }
}

export function onAppEvent(l: (e: AppEvent) => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
