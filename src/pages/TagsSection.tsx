import { useState } from 'react';
import { useApp } from '../store/store';
import { useAction } from '../components/useAction';
import { Msg } from '../components/Msg';
import { StatusPill } from '../components/ui';
import { ask } from '../components/confirm';
import * as A from '../domain/actions';
import { parseTagCsv } from '../domain/csv';
import { tagStatus } from '../domain/derive';
import type { TagStatus } from '../domain/types';

export function TagsSection() {
  const data = useApp((s) => s.data);
  const { msg, note, exec } = useAction();
  const params = data.codes.filter((c) => c.group === 'param' && c.active);
  const units = data.codes.filter((c) => c.group === 'unit' && c.active);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | TagStatus>('all');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bParam, setBParam] = useState('');
  const [bUnit, setBUnit] = useState('');
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState('');

  const rows = data.tags.filter((t) => {
    if (status !== 'all' && tagStatus(t) !== status) return false;
    const k = q.trim().toLowerCase();
    return !k || t.raw.toLowerCase().includes(k);
  });
  const allSel = rows.length > 0 && rows.every((t) => sel.has(t.raw));
  const cnt: Record<TagStatus, number> = { 미정리: 0, 정리됨: 0, 연결됨: 0, 보류: 0 };
  data.tags.forEach((t) => { cnt[tagStatus(t)] += 1; });
  const toggle = (raw: string) => setSel((p) => { const n = new Set(p); if (n.has(raw)) n.delete(raw); else n.add(raw); return n; });
  const applyBulk = () => {
    const patch = { ...(bParam ? { param: bParam } : {}), ...(bUnit ? { unit: bUnit } : {}) };
    if (Object.keys(patch).length && exec((d) => A.bulkUpdateTags(d, [...sel], patch))) { setBParam(''); setBUnit(''); }
  };

  return (
    <>
      <div className="bar">
        <input className="search" placeholder="태그 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value as 'all' | TagStatus)}>
          <option value="all">전체 {data.tags.length}</option>
          {(['미정리', '정리됨', '연결됨', '보류'] as TagStatus[]).map((s) => <option key={s} value={s}>{s} {cnt[s]}</option>)}
        </select>
        <span className="grow" />
        <button className="ghost" onClick={() => setOpen(!open)}>{open ? '가져오기 닫기' : '태그 가져오기'}</button>
      </div>
      {open && (
        <div className="card pad">
          <textarea rows={4} placeholder={'원천 태그, 장치, 파라미터(코드·코드명·약자), 단위\nCP2_KW,GW1,순시 전력\nCP2_PRS,GW1,PRS,bar'} value={csv} onChange={(e) => setCsv(e.target.value)} />
          <div className="bar tight">
            <input type="file" accept=".csv,.txt,.tsv" onChange={(e) => e.target.files?.[0]?.text().then(setCsv)} />
            <button onClick={() => exec((d) => A.importTags(d, parseTagCsv(csv))) && setCsv('')}>가져오기</button>
          </div>
        </div>
      )}
      <Msg text={msg} note={note} />
      {sel.size > 0 && (
        <div className="bar bulk">
          <b>{sel.size}개 선택</b>
          <select value={bParam} onChange={(e) => setBParam(e.target.value)}>
            <option value="">파라미터</option>
            {params.map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}
          </select>
          <select value={bUnit} onChange={(e) => setBUnit(e.target.value)}>
            <option value="">단위</option>
            {units.map((u) => <option key={u.code} value={u.code}>{u.code}</option>)}
          </select>
          <button onClick={applyBulk}>적용</button>
          <button className="ghost" onClick={() => ask(`선택한 ${sel.size}개를 보류합니다.`) && exec((d) => A.setHold(d, [...sel], true))}>보류</button>
          <button className="ghost" onClick={() => setSel(new Set())}>해제</button>
        </div>
      )}
      <div className="card flush">
        <table>
          <thead>
            <tr>
              <th className="cb"><input type="checkbox" checked={allSel} onChange={() => setSel(allSel ? new Set() : new Set(rows.map((t) => t.raw)))} /></th>
              <th>원천 태그</th><th>장치</th><th>파라미터</th><th>단위</th><th>상태</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="empty">표시할 태그가 없습니다.</td></tr>}
            {rows.map((t) => (
              <tr key={t.raw} className={sel.has(t.raw) ? 'sel' : ''}>
                <td className="cb"><input type="checkbox" checked={sel.has(t.raw)} onChange={() => toggle(t.raw)} /></td>
                <td><code>{t.raw}</code></td>
                <td className="dim">{t.device}</td>
                <td>
                  <select value={t.param ?? ''} onChange={(e) => exec((d) => A.updateTag(d, t.raw, { param: e.target.value || null }))}>
                    <option value="">(미지정)</option>
                    {params.map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}
                    {t.param && !params.some((p) => p.code === t.param) && <option value={t.param}>{t.param} (중지)</option>}
                  </select>
                </td>
                <td>
                  <select value={t.unit} onChange={(e) => exec((d) => A.updateTag(d, t.raw, { unit: e.target.value }))}>
                    <option value="">(미지정)</option>
                    {units.map((u) => <option key={u.code} value={u.code}>{u.code}</option>)}
                    {t.unit && !units.some((u) => u.code === t.unit) && <option value={t.unit}>{t.unit} (중지)</option>}
                  </select>
                </td>
                <td><StatusPill status={tagStatus(t)} /></td>
                <td className="act">
                  {t.hold
                    ? <button className="ghost" onClick={() => exec((d) => A.setHold(d, [t.raw], false))}>보류 해제</button>
                    : <button className="ghost" onClick={() => (!t.assetId || ask(`${t.raw}의 설비 연결이 풀리고 보류됩니다.`)) && exec((d) => A.setHold(d, [t.raw], true))}>보류</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
