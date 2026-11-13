import { createStore, type StoreApi } from 'zustand/vanilla';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useStore } from 'zustand';
import { SEED } from '../domain/seed';
import type { Data } from '../domain/types';
import type { Result } from '../domain/actions';

export interface AppState {
  data: Data;
  /** 순수 액션을 적용한다. 오류(없으면 null)와 안내 문구를 돌려준다 */
  run: (fn: (d: Data) => Result) => { error: string | null; note?: string };
  reset: () => void;
}

const fresh = (): Data => JSON.parse(JSON.stringify(SEED)) as Data;

export function makeStore(opts: { persist: boolean }): StoreApi<AppState> {
  const creator = (set: (p: Partial<AppState>) => void, get: () => AppState): AppState => ({
    data: fresh(),
    run: (fn) => {
      const r = fn(get().data);
      if (!r.error) set({ data: r.data });
      return { error: r.error, note: r.note };
    },
    reset: () => set({ data: fresh() }),
  });

  if (!opts.persist) return createStore<AppState>()(creator as never);
  return createStore<AppState>()(
    persist(creator as never, {
      name: 'hde-cems-master-data-v2',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      partialize: (s: AppState) => ({ data: s.data }),
    }) as never,
  );
}

export const appStore = makeStore({ persist: true });

export function useApp<T>(selector: (s: AppState) => T): T {
  return useStore(appStore, selector);
}
