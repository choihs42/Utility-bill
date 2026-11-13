import { useMemo, useState } from 'react';
import { useApp } from '../store/store';
import { useAction } from '../components/useAction';
import { Msg } from '../components/Msg';
import { ask } from '../components/confirm';
import * as A from '../domain/actions';
import { parseTagCsv } from '../domain/csv';
import { isComplete, templateSlots } from '../domain/derive';
import type { TagStatus } from '../domain/types';

/** 입력 후 포커스를 벗어나거나 Enter를 누르면 저장 */
function NameInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value);
  return (
    <input
      className="wide"
      value={v}
      placeholder="포인트명 입력"
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v.trim() !== value && onCommit(v)}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

export function PointsSection() {
  const data = useApp((s) => s.data);
  const { msg, note, exec } = useAction();
  const units = data.codes.filter((c) => c.group === 'unit' && c.active);
  const allSlots = useMemo(() => [...new Set(data.templates.flatMap((t) => t.slots.map((s) => s.item)))], [data.templates]);

  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | TagStatus>('all');
  const [onlyTodo, setOnlyTodo] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bAsset, setBAsset] = useState('');
  const [bSlot, setBSlot] = useState('');
  const [bUnit, setBUnit] = useState('');
  const [csv, setCsv] = useState('');

  const rows = data.tags.filter((t) => {
    if (status !== 'all' && t.status !== status) return false;
    if (onlyTodo && (t.status === '보류' || isComplete(t) && t.status === '승인')) return false;
    const k = q.trim().toLowerCase();
    return !k || t.raw.toLowerCase().includes(k) || t.name.toLowerCase().includes(k);
  });
  const allSel = rows.length > 0 && rows.every((t) => sel.has(t.raw));
  const bulkAsset = data.assets.find((a) => a.id === bAsset);
  const bulkSlots = bulkAsset ? templateSlots(data, bulkAsset).map((s) => s.item) : allSlots;
  const toggle = (raw: string) => setSel((p) => { const n = new Set(p); if (n.has(raw)) n.delete(raw); else n.add(raw); return n; });
  const counts = { 제안: 0, 승인: 0, 보류: 0 } as Record<TagStatus, number>;
  data.tags.forEach((t) => { counts[t.status] += 1; });

  const applyBulk = () => {
    const patch = { ...(bAsset ? { assetId: bAsset } : {}), ...(bSlot ? { slot: bSlot } : {}), ...(bUnit ? { unit: bUnit } : {}) };
    if (Object.keys(patch).length === 0) return;
    if (exec((d) => A.bulkUpdateTags(d, [...sel], patch))) { setBAsset(''); setBSlot(''); setBUnit(''); }
  };
  const readFile = (f: File | undefined) => { if (f) f.text().then(setCsv); };

  return (
    <>
      <div className="toolbar">
        <button onClick={() => exec((d) => A.applyAliases(d))}>약어 사전 적용</button>
        <button onClick={() => exec((d) => A.approveAllReady(d))}>입력 완료 항목 일괄 승인</button>
        <span className="dim">전체 {data.tags.length} · 제안 {counts.제안} · 승인 {counts.승인} · 보류 {counts.보류}</span>
      </div>
      <details className="card imp">
        <summary>태그 가져오기 (CSV)</summary>
        <p className="hint">열 순서: 원천 태그, 장치, 설비 코드, 항목, 단위, 포인트명 (뒤쪽 열은 비워도 됩니다). 쉼표 또는 탭으로 구분하고, 같은 원천 태그는 건너뜁니다.</p>
        <textarea rows={5} placeholder={'CP2_KW,GW1\nCP2_PRS,GW1,CP2,토출 압력,bar'} value={csv} onChange={(e) => setCsv(e.target.value)} />
        <div className="form tight">
          <input type="file" accept=".csv,.txt,.tsv" onChange={(e) => readFile(e.target.files?.[0])} />
          <button onClick={() => exec((d) => A.importTags(d, parseTagCsv(csv))) && setCsv('')}>가져오기</button>
        </div>
      </details>
      <Msg text={msg} note={note} />
      <div className="filters">
        <input placeholder="태그·포인트명 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value as 'all' | TagStatus)}>
          <option value="all">상태: 전체</option><option value="제안">제안</option><option value="승인">승인</option><option value="보류">보류</option>
        </select>
        <label className="chk"><input type="checkbox" checked={onlyTodo} onChange={(e) => setOnlyTodo(e.target.checked)} /> 처리할 항목만</label>
        <span className="dim">{rows.length}개 표시</span>
      </div>
      {sel.size > 0 && (
        <div className="bulk">
          <b>{sel.size}개 선택</b>
          <select value={bAsset} onChange={(e) => { setBAsset(e.target.value); setBSlot(''); }}>
            <option value="">설비 (변경 안 함)</option>
            {data.assets.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
          </select>
          <select value={bSlot} onChange={(e) => setBSlot(e.target.value)}>
            <option value="">항목 (변경 안 함)</option>
            {bulkSlots.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={bUnit} onChange={(e) => setBUnit(e.target.value)}>
            <option value="">단위 (변경 안 함)</option>
            {units.map((u) => <option key={u.code} value={u.code}>{u.code}</option>)}
          </select>
          <button onClick={applyBulk}>적용</button>
          <button className="ghost" onClick={() => ask(`선택한 ${sel.size}개를 보류합니다.`) && [...sel].forEach((r) => exec((d) => A.holdTag(d, r)))}>선택 보류</button>
          <button className="ghost" onClick={() => setSel(new Set())}>선택 해제</button>
        </div>
      )}
      <div className="card flush">
        <table>
          <thead>
            <tr>
              <th className="cb"><input type="checkbox" checked={allSel} onChange={() => setSel(allSel ? new Set() : new Set(rows.map((t) => t.raw)))} /></th>
              <th>원천 태그</th><th>포인트명</th><th>설비</th><th>항목</th><th>단위</th><th>포인트 ID</th><th>상태</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={9} className="dim">조건에 맞는 태그가 없습니다.</td></tr>}
            {rows.map((t) => {
              const asset = data.assets.find((a) => a.id === t.assetId);
              const slots = asset ? templateSlots(data, asset) : [];
              return (
                <tr key={t.raw} className={sel.has(t.raw) ? 'sel' : ''}>
                  <td className="cb"><input type="checkbox" checked={sel.has(t.raw)} onChange={() => toggle(t.raw)} /></td>
                  <td><code>{t.raw}</code><div className="dim">{t.device}</div></td>
                  <td><NameInput key={`${t.raw}:${t.name}`} value={t.name} onCommit={(v) => exec((d) => A.updateTag(d, t.raw, { name: v }))} /></td>
                  <td>
                    <select value={t.assetId ?? ''} onChange={(e) => exec((d) => A.updateTag(d, t.raw, { assetId: e.target.value || null }))}>
                      <option value="">(미지정)</option>
                      {data.assets.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                    </select>
                  </td>
                  <td>
                    <select value={t.slot ?? ''} disabled={!asset} onChange={(e) => exec((d) => A.updateTag(d, t.raw, { slot: e.target.value || null }))}>
                      <option value="">{asset ? '(선택)' : '설비 먼저'}</option>
                      {slots.map((s) => <option key={s.item} value={s.item}>{s.item}</option>)}
                    </select>
                  </td>
                  <td>
                    <select value={t.unit} onChange={(e) => exec((d) => A.updateTag(d, t.raw, { unit: e.target.value }))}>
                      <option value="">(선택)</option>
                      {units.map((u) => <option key={u.code} value={u.code}>{u.code}</option>)}
                    </select>
                  </td>
                  <td className="dim">{t.ptId || '-'}</td>
                  <td><span className={`pill ${t.status === '승인' ? 'ok' : t.status === '보류' ? 'err' : 'warn'}`} title="제안: 승인 전 / 승인: 설비 항목에 연결됨 / 보류: 사용하지 않음">{t.status}</span></td>
                  <td className="act">
                    {t.status !== '승인' && <button onClick={() => exec((d) => A.approveTag(d, t.raw))}>승인</button>}
                    {t.status !== '보류' && <button className="ghost" onClick={() => (t.status !== '승인' || ask(`${t.raw}의 승인을 취소하고 보류합니다. 설비 항목 연결이 풀립니다.`)) && exec((d) => A.holdTag(d, t.raw))}>보류</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
