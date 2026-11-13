import { useState } from 'react';
import { useApp } from '../store/store';
import { useAction } from '../components/useAction';
import { Msg } from '../components/Msg';
import { Cell } from '../components/ui';
import * as A from '../domain/actions';
import { codeUsage } from '../domain/derive';

const SETTINGS = '__settings';

function Settings() {
  const data = useApp((s) => s.data);
  const { msg, note, exec } = useAction();
  const { ptPrefix, ptDigits, sumTolerancePct } = data.settings;
  return (
    <>
      <Msg text={msg} note={note} />
      <div className="card flush">
        <table>
          <thead><tr><th>항목</th><th>값</th><th>비고</th></tr></thead>
          <tbody>
            <tr>
              <td>포인트 ID 접두사</td>
              <td><Cell className="cell sm" value={ptPrefix} onCommit={(v) => exec((d) => A.setPtFormat(d, v, d.settings.ptDigits))} /></td>
              <td rowSpan={2} className="dim">미리보기 <code>{ptPrefix}{'1'.padStart(ptDigits, '0')}</code> · 새로 부여하는 ID부터 적용</td>
            </tr>
            <tr>
              <td>포인트 ID 자릿수</td>
              <td>
                <select value={ptDigits} onChange={(e) => exec((d) => A.setPtFormat(d, d.settings.ptPrefix, Number(e.target.value)))}>
                  {[4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </td>
            </tr>
            <tr>
              <td>합산 허용 오차</td>
              <td>
                <select value={sumTolerancePct} onChange={(e) => exec((d) => A.setTolerance(d, Number(e.target.value)))}>
                  {[0.5, 1, 2, 3, 5, 10].map((v) => <option key={v} value={v}>{v}%</option>)}
                </select>
              </td>
              <td className="dim">상위 설비 값과 하위 합의 차이 허용 범위(점검)</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

function CodeTable({ group }: { group: string }) {
  const data = useApp((s) => s.data);
  const { msg, note, exec } = useAction();
  const g = data.codeGroups.find((x) => x.key === group)!;
  const isParam = group === 'param';
  const units = data.codes.filter((c) => c.group === 'unit' && c.active);
  const blank = { code: g.prefix, label: '', abbr: '', desc: '', unit: '', multi: false, sum: false };
  const [f, setF] = useState(blank);
  const set = (p: Partial<typeof f>) => setF({ ...f, ...p });
  const add = () => {
    if (exec((d) => A.addCode(d, group, f.code, f.label, f))) setF(blank);
  };
  return (
    <>
      <div className="bar">
        <span className="dim">테이블명</span>
        <Cell className="cell sm boxed" value={g.label} onCommit={(v) => exec((d) => A.updateCodeGroup(d, group, { label: v }))} />
        <span className="dim">로컬 접두사</span>
        <Cell className="cell xs boxed" value={g.prefix} onCommit={(v) => exec((d) => A.updateCodeGroup(d, group, { prefix: v }))} />
        <span className="dim">코드 형식</span>
        <Cell className="cell boxed mono" value={g.pattern} onCommit={(v) => exec((d) => A.updateCodeGroup(d, group, { pattern: v }))} />
      </div>
      <Msg text={msg} note={note} />
      <div className="card flush">
        <table>
          <thead>
            <tr>
              <th>코드</th><th>코드명</th><th>약자</th><th>설명</th>
              {isParam && <><th>기본 단위</th><th title="같은 설비에 여러 개 연결 허용">복수</th><th title="상위 값과 하위 합 비교(점검)">합산</th></>}
              <th>구분</th><th className="num">사용</th><th>상태</th><th></th>
            </tr>
          </thead>
          <tbody>
            {data.codes.filter((c) => c.group === group).map((c) => (
              <tr key={c.code}>
                <td><code>{c.code}</code></td>
                <td><Cell value={c.label} onCommit={(v) => exec((d) => A.updateCode(d, group, c.code, { label: v }))} /></td>
                <td><Cell className="cell sm" value={c.abbr} onCommit={(v) => exec((d) => A.updateCode(d, group, c.code, { abbr: v }))} /></td>
                <td><Cell className="cell wide" value={c.desc} onCommit={(v) => exec((d) => A.updateCode(d, group, c.code, { desc: v }))} /></td>
                {isParam && (
                  <>
                    <td>
                      <select value={c.unit ?? ''} onChange={(e) => exec((d) => A.updateCode(d, group, c.code, { unit: e.target.value }))}>
                        <option value="">-</option>
                        {units.map((u) => <option key={u.code} value={u.code}>{u.code}</option>)}
                      </select>
                    </td>
                    <td><input type="checkbox" checked={Boolean(c.multi)} onChange={(e) => exec((d) => A.updateCode(d, group, c.code, { multi: e.target.checked }))} /></td>
                    <td><input type="checkbox" checked={Boolean(c.sum)} onChange={(e) => exec((d) => A.updateCode(d, group, c.code, { sum: e.target.checked }))} /></td>
                  </>
                )}
                <td className="dim">{c.scope}</td>
                <td className="num">{codeUsage(data, group, c.code)}</td>
                <td><span className={`pill ${c.active ? 'ok' : 'mute'}`}>{c.active ? '사용' : '중지'}</span></td>
                <td className="act"><button className="ghost" onClick={() => exec((d) => A.toggleCode(d, group, c.code))}>{c.active ? '중지' : '재사용'}</button></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="addrow">
              <td><input className="cell" placeholder="코드" value={f.code} onChange={(e) => set({ code: e.target.value })} title={g.rule} /></td>
              <td><input className="cell" placeholder="코드명" value={f.label} onChange={(e) => set({ label: e.target.value })} /></td>
              <td><input className="cell sm" placeholder="약자" value={f.abbr} onChange={(e) => set({ abbr: e.target.value })} /></td>
              <td><input className="cell wide" placeholder="설명" value={f.desc} onChange={(e) => set({ desc: e.target.value })} /></td>
              {isParam && (
                <>
                  <td>
                    <select value={f.unit} onChange={(e) => set({ unit: e.target.value })}>
                      <option value="">-</option>
                      {units.map((u) => <option key={u.code} value={u.code}>{u.code}</option>)}
                    </select>
                  </td>
                  <td><input type="checkbox" checked={f.multi} onChange={(e) => set({ multi: e.target.checked })} /></td>
                  <td><input type="checkbox" checked={f.sum} onChange={(e) => set({ sum: e.target.checked })} /></td>
                </>
              )}
              <td colSpan={4} className="act"><button onClick={add}>추가</button></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

export function CodesPage() {
  const data = useApp((s) => s.data);
  const [sel, setSel] = useState('param');
  return (
    <div className="split">
      <ul className="list">
        {data.codeGroups.map((g) => (
          <li key={g.key} className={sel === g.key ? 'on' : ''} onClick={() => setSel(g.key)}>
            <span>{g.label}</span><em>{data.codes.filter((c) => c.group === g.key).length}</em>
          </li>
        ))}
        <li className={`sep ${sel === SETTINGS ? 'on' : ''}`} onClick={() => setSel(SETTINGS)}><span>설정</span></li>
      </ul>
      <div className="pane">{sel === SETTINGS ? <Settings /> : <CodeTable key={sel} group={sel} />}</div>
    </div>
  );
}
