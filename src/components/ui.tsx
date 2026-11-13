import { useEffect, useState } from 'react';
import type { TagStatus } from '../domain/types';

/** 입력 후 포커스를 벗어나거나 Enter를 누르면 저장. 저장이 거부되면 원래 값으로 되돌린다 */
export function Cell({ value, onCommit, placeholder, className }: { value: string; onCommit: (v: string) => boolean | void; placeholder?: string; className?: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input
      className={className ?? 'cell'}
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        if (v.trim() === value) return;
        if (onCommit(v) === false) setV(value);
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

const STATUS_CLASS: Record<TagStatus, string> = { 연결됨: 'ok', 정리됨: 'info', 미정리: 'warn', 보류: 'mute' };
export function StatusPill({ status }: { status: TagStatus }) {
  return <span className={`pill ${STATUS_CLASS[status]}`}>{status}</span>;
}

export function Tabs<T extends string>({ items, value, onChange }: { items: { key: T; label: string }[]; value: T; onChange: (k: T) => void }) {
  return (
    <div className="tabs">
      {items.map((t) => (
        <button key={t.key} className={t.key === value ? 'on' : ''} onClick={() => onChange(t.key)}>{t.label}</button>
      ))}
    </div>
  );
}
