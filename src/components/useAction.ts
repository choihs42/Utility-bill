import { useState } from 'react';
import type { Data } from '../domain/types';
import type { Result } from '../domain/actions';
import { useApp } from '../store/store';

/** 액션을 실행하고, 결과(오류/안내)를 화면에 보여주기 위한 훅. 성공하면 true */
export function useAction() {
  const run = useApp((s) => s.run);
  const [msg, setMsg] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const exec = (fn: (d: Data) => Result): boolean => {
    const r = run(fn);
    setMsg(r.error);
    setNote(r.note ?? null);
    return !r.error;
  };
  return { msg, note, exec };
}
