import { createStore, type StoreApi } from 'zustand/vanilla';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useStore } from 'zustand';
import { SEED } from '../domain/seed';
import type { Data } from '../domain/types';
import type { Result } from '../domain/actions';

export interface AppState {
  data: Data;
  /** 되돌리기용 이전 상태(메모리에만 보관) */
  past: Data[];
  /** 순수 액션을 적용한다. 오류(없으면 null)와 안내 문구를 돌려준다 */
  run: (fn: (d: Data) => Result) => { error: string | null; note?: string };
  undo: () => void;
  reset: () => void;
}

const fresh = (): Data => JSON.parse(JSON.stringify(SEED)) as Data;

export function makeStore(opts: { persist: boolean }): StoreApi<AppState> {
  const creator = (set: (p: Partial<AppState>) => void, get: () => AppState): AppState => ({
    data: fresh(),
    past: [],
    run: (fn) => {
      const cur = get();
      const r = fn(cur.data);
      if (!r.error) set({ data: r.data, past: [...cur.past.slice(-29), cur.data] });
      return { error: r.error, note: r.note };
    },
    undo: () => {
      const { past } = get();
      if (past.length === 0) return;
      set({ data: past[past.length - 1], past: past.slice(0, -1) });
    },
    reset: () => set({ data: fresh(), past: [] }),
  });

  if (!opts.persist) return createStore<AppState>()(creator as never);
  return createStore<AppState>()(
    persist(creator as never, {
      name: 'hde-cems-master-data-v3',
      version: 3,
      storage: createJSONStorage(() => localStorage),
      partialize: (s: AppState) => ({ data: s.data }),
    }) as never,
  );
}

export const appStore = makeStore({ persist: true });

export function useApp<T>(selector: (s: AppState) => T): T {
  return useStore(appStore, selector);
}
