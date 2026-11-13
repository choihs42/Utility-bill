import { useState } from 'react';
import { useApp } from '../store/store';
import { useAction } from '../components/useAction';
import { Msg } from '../components/Msg';
import { StatusPill, Tabs } from '../components/ui';
import * as A from '../domain/actions';
import { codeLabel, linkedTags, pointName, tagStatus } from '../domain/derive';

function ByTag() {
  const data = useApp((s) => s.data);
  const { msg, note, exec } = useAction();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | '정리됨' | '연결됨'>('all');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bAsset, setBAsset] = useState('');
  const ready = data.tags.filter((t) => ['정리됨', '연결됨'].includes(tagStatus(t)));
  const excluded = data.tags.length - ready.length;
  const rows = ready.filter((t) => (filter === 'all' || tagStatus(t) === filter) && (!q.trim() || t.raw.toLowerCase().includes(q.trim().toLowerCase())));
  const allSel = rows.length > 0 && rows.every((t) => sel.has(t.raw));
  const toggle = (raw: string) => setSel((p) => { const n = new Set(p); if (n.has(raw)) n.delete(raw); else n.add(raw); return n; });
  return (
    <>
      <div className="bar">
        <input className="search" placeholder="태그 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
          <option value="all">전체 {ready.length}</option>
          <option value="정리됨">연결 대기 {ready.filter((t) => tagStatus(t) === '정리됨').length}</option>
          <option value="연결됨">연결됨 {ready.filter((t) => tagStatus(t) === '연결됨').length}</option>
        </select>
        <span className="grow" />
        <span className="dim">미정리·보류 {excluded}개는 제외 (코드·태그에서 정리)</span>
      </div>
      <Msg text={msg} note={note} />
      {sel.size > 0 && (
        <div className="bar bulk">
          <b>{sel.size}개 선택</b>
          <select value={bAsset} onChange={(e) => setBAsset(e.target.value)}>
            <option value="">설비 선택</option>
            {data.assets.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
          </select>
          <button disabled={!bAsset} onClick={() => exec((d) => A.bulkLinkTags(d, [...sel], bAsset)) && setBAsset('')}>연결</button>
          <button className="ghost" onClick={() => exec((d) => A.bulkLinkTags(d, [...sel], null))}>연결 해제</button>
          <button className="ghost" onClick={() => setSel(new Set())}>선택 해제</button>
        </div>
      )}
      <div className="card flush">
        <table>
          <thead>
            <tr>
              <th className="cb"><input type="checkbox" checked={allSel} onChange={() => setSel(allSel ? new Set() : new Set(rows.map((t) => t.raw)))} /></th>
              <th>원천 태그</th><th>파라미터</th><th>단위</th><th>설비</th><th>포인트명</th><th>포인트 ID</th><th>상태</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={8} className="empty">연결할 태그가 없습니다.</td></tr>}
            {rows.map((t) => (
              <tr key={t.raw} className={sel.has(t.raw) ? 'sel' : ''}>
                <td className="cb"><input type="checkbox" checked={sel.has(t.raw)} onChange={() => toggle(t.raw)} /></td>
                <td><code>{t.raw}</code></td>
                <td>{codeLabel(data, 'param', t.param ?? '')}</td>
                <td className="dim">{t.unit}</td>
                <td>
                  <select value={t.assetId ?? ''} onChange={(e) => exec((d) => A.linkTag(d, t.raw, e.target.value || null))}>
                    <option value="">(미연결)</option>
                    {data.assets.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                  </select>
                </td>
                <td>{pointName(data, t)}</td>
                <td className="dim">{t.ptId || '-'}</td>
                <td><StatusPill status={tagStatus(t)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ByAsset() {
  const data = useApp((s) => s.data);
  return (
    <div className="card flush">
      <table>
        <thead><tr><th>설비</th><th>유형</th><th className="num">포인트</th><th>연결된 포인트</th></tr></thead>
        <tbody>
          {data.assets.map((a) => {
            const ts = linkedTags(data, a.id);
            return (
              <tr key={a.id}>
                <td><code>{a.code}</code> {a.name}</td>
                <td className="dim">{codeLabel(data, 'asset', a.type)}</td>
                <td className="num">{ts.length}</td>
                <td>{ts.length ? ts.map((t) => <span key={t.raw} className="chip">{codeLabel(data, 'param', t.param ?? '')} <code>{t.raw}</code></span>) : <span className="dim">없음</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function MapPage() {
  const [tab, setTab] = useState<'tag' | 'asset'>('tag');
  return (
    <>
      <Tabs items={[{ key: 'tag', label: '태그별' }, { key: 'asset', label: '설비별' }]} value={tab} onChange={setTab} />
      {tab === 'tag' ? <ByTag /> : <ByAsset />}
    </>
  );
}
