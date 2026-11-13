import { useState } from 'react';
import type { Data } from '../domain/types';
import type { Result } from '../domain/actions';
import { useApp } from '../store/store';

/** 액션을 실행하고, 실패 시 사유를 화면에 보여주기 위한 훅 */
export function useAction() {
  const run = useApp((s) => s.run);
  const [msg, setMsg] = useState<string | null>(null);
  const exec = (fn: (d: Data) => Result) => setMsg(run(fn));
  return { msg, exec, clear: () => setMsg(null) };
}
