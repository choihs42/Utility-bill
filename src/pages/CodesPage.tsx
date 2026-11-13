import { useState } from 'react';
import { useApp } from '../store/store';
import { useAction } from '../components/useAction';
import { Msg } from '../components/Msg';
import * as A from '../domain/actions';
import { codeUsage } from '../domain/derive';

export function CodesPage() {
  const data = useApp((s) => s.data);
  const { msg, note, exec } = useAction();
  const [group, setGroup] = useState('unit');
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const g = data.codeGroups.find((x) => x.key === group)!;
  return (
    <>
      <header className="ph"><h2>기준 코드</h2>
      <p>단위·설비 유형 같은 기본 코드입니다. 처음에는 확인만 하고, 현장에만 있는 항목이 있을 때 LOC_ 코드를 추가하세요.</p></header>
      <div className="tabs">
        {data.codeGroups.map((x) => <button key={x.key} className={x.key === group ? 'on' : ''} onClick={() => setGroup(x.key)}>{x.label}</button>)}
      </div>
      <div className="card">
        <p className="dim">규칙: {g.rule}</p>
        <table>
          <thead><tr><th>코드</th><th>이름</th><th>구분</th><th>사용 건수</th><th>상태</th><th></th></tr></thead>
          <tbody>
            {data.codes.filter((c) => c.group === group).map((c) => (
              <tr key={c.code}>
                <td><code>{c.code}</code></td><td>{c.label}</td>
                <td><span className={`pill ${c.scope === '로컬' ? 'warn' : ''}`}>{c.scope}</span></td>
                <td>{codeUsage(data, group, c.code)}</td>
                <td><span className={`pill ${c.active ? 'ok' : 'err'}`}>{c.active ? '사용' : '중지'}</span></td>
                <td className="act"><button className="ghost" onClick={() => exec((d) => A.toggleCode(d, group, c.code))}>{c.active ? '사용 중지' : '재사용'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card form">
        <h3>로컬 코드 추가</h3>
        <input placeholder="LOC_코드" value={code} onChange={(e) => setCode(e.target.value)} disabled={!g.extendable} />
        <input placeholder="이름" value={label} onChange={(e) => setLabel(e.target.value)} disabled={!g.extendable} />
        <button disabled={!g.extendable} onClick={() => { exec((d) => A.addCode(d, group, code, label)); }}>추가</button>
        <Msg text={msg} note={note} />
      </div>
    </>
  );
}
