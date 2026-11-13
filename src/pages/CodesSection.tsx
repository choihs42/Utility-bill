import { useState } from 'react';
import { useApp } from '../store/store';
import { useAction } from '../components/useAction';
import { Msg } from '../components/Msg';
import { Cell, Tabs } from '../components/ui';
import * as A from '../domain/actions';
import { codeUsage } from '../domain/derive';

export function CodesSection() {
  const data = useApp((s) => s.data);
  const { msg, note, exec } = useAction();
  const [group, setGroup] = useState('param');
  const g = data.codeGroups.find((x) => x.key === group)!;
  const isParam = group === 'param';
  const units = data.codes.filter((c) => c.group === 'unit' && c.active);
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [abbr, setAbbr] = useState('');
  const [desc, setDesc] = useState('');
  const [unit, setUnit] = useState('');
  const [multi, setMulti] = useState(false);
  const add = () => {
    if (exec((d) => A.addCode(d, group, code, label, { abbr, desc, unit, multi }))) { setCode(''); setLabel(''); setAbbr(''); setDesc(''); setUnit(''); setMulti(false); }
  };
  return (
    <>
      <Tabs items={data.codeGroups.map((x) => ({ key: x.key, label: x.label }))} value={group} onChange={setGroup} />
      <Msg text={msg} note={note} />
      <div className="card flush">
        <table>
          <thead>
            <tr>
              <th>코드</th><th>코드명</th><th>약자</th><th>설명</th>
              {isParam && <><th>기본 단위</th><th title="같은 설비에 여러 개 연결 허용">복수</th></>}
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
              <td><input className="cell" placeholder="LOC_코드" value={code} onChange={(e) => setCode(e.target.value)} title={g.rule} /></td>
              <td><input className="cell" placeholder="코드명" value={label} onChange={(e) => setLabel(e.target.value)} /></td>
              <td><input className="cell sm" placeholder="약자" value={abbr} onChange={(e) => setAbbr(e.target.value)} /></td>
              <td><input className="cell wide" placeholder="설명" value={desc} onChange={(e) => setDesc(e.target.value)} /></td>
              {isParam && (
                <>
                  <td>
                    <select value={unit} onChange={(e) => setUnit(e.target.value)}>
                      <option value="">-</option>
                      {units.map((u) => <option key={u.code} value={u.code}>{u.code}</option>)}
                    </select>
                  </td>
                  <td><input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} /></td>
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
