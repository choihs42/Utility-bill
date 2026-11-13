import { useState } from 'react';
import { useApp } from '../store/store';
import { useAction } from '../components/useAction';
import { Msg } from '../components/Msg';
import * as A from '../domain/actions';

export function AliasSection() {
  const data = useApp((s) => s.data);
  const { msg, note, exec } = useAction();
  const units = data.codes.filter((c) => c.group === 'unit' && c.active);
  const allSlots = [...new Set(data.templates.flatMap((t) => t.slots.map((s) => s.item)))];
  const [aTok, setATok] = useState('');
  const [aAsset, setAAsset] = useState(data.assets[0]?.id ?? '');
  const [sTok, setSTok] = useState('');
  const [sSlot, setSSlot] = useState(allSlots[0] ?? '');
  const [sUnit, setSUnit] = useState('');
  const assets = data.aliases.filter((a) => a.kind === 'asset');
  const slotsA = data.aliases.filter((a) => a.kind === 'slot');
  return (
    <>
      <p className="hint top">원천 태그 이름을 밑줄(_)로 나눈 조각이 아래 약어와 같으면, 포인트 매핑의 빈 칸을 채웁니다. 이미 입력된 값은 바꾸지 않으며, 사전은 [포인트 매핑]의 "약어 사전 적용"과 태그 가져오기에서 사용됩니다.</p>
      <Msg text={msg} note={note} />
      <div className="two">
        <section className="card">
          <h3>설비 약어</h3>
          <table>
            <thead><tr><th>약어</th><th>설비</th><th></th></tr></thead>
            <tbody>
              {assets.map((a) => {
                const as = data.assets.find((x) => x.id === a.assetId);
                return <tr key={a.id}><td><code>{a.token}</code></td><td>{as ? `${as.code} · ${as.name}` : '(삭제된 설비)'}</td><td className="act"><button className="ghost" onClick={() => exec((d) => A.removeAlias(d, a.id))}>삭제</button></td></tr>;
              })}
            </tbody>
          </table>
          <div className="form">
            <input placeholder="약어 (예: CP2)" value={aTok} onChange={(e) => setATok(e.target.value)} />
            <select value={aAsset} onChange={(e) => setAAsset(e.target.value)}>{data.assets.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select>
            <button onClick={() => exec((d) => A.addAlias(d, 'asset', aTok, { assetId: aAsset })) && setATok('')}>추가</button>
          </div>
        </section>
        <section className="card">
          <h3>항목 약어</h3>
          <table>
            <thead><tr><th>약어</th><th>항목</th><th>단위</th><th></th></tr></thead>
            <tbody>
              {slotsA.map((a) => <tr key={a.id}><td><code>{a.token}</code></td><td>{a.slot}</td><td>{a.unit || <span className="dim">-</span>}</td><td className="act"><button className="ghost" onClick={() => exec((d) => A.removeAlias(d, a.id))}>삭제</button></td></tr>)}
            </tbody>
          </table>
          <div className="form">
            <input placeholder="약어 (예: TMP)" value={sTok} onChange={(e) => setSTok(e.target.value)} />
            <select value={sSlot} onChange={(e) => setSSlot(e.target.value)}>{allSlots.map((s) => <option key={s} value={s}>{s}</option>)}</select>
            <select value={sUnit} onChange={(e) => setSUnit(e.target.value)}><option value="">단위 없음</option>{units.map((u) => <option key={u.code} value={u.code}>{u.code}</option>)}</select>
            <button onClick={() => exec((d) => A.addAlias(d, 'slot', sTok, { slot: sSlot, unit: sUnit || undefined })) && setSTok('')}>추가</button>
          </div>
        </section>
      </div>
    </>
  );
}
