import { useApp } from '../store/store';
import { useAction } from '../components/useAction';
import { Msg } from '../components/Msg';
import * as A from '../domain/actions';
import { candidates, fulfillment, pathCode } from '../domain/derive';

export function AssetsSection() {
  const data = useApp((s) => s.data);
  const { msg, note, exec } = useAction();
  return (
    <>
      <div className="toolbar">
        <button onClick={() => exec((d) => A.autoLinkAll(d))}>빈 항목 자동 연결</button>
        <span className="dim">승인된 후보가 하나뿐인 항목을 연결합니다.</span>
      </div>
      <Msg text={msg} note={note} />
      {data.assets.map((a) => {
        const f = fulfillment(data, a);
        const paths = data.placements.filter((p) => p.assetId === a.id).map((p) => pathCode(data, p.nodeId));
        return (
          <div className="card" key={a.id}>
            <div className="head">
              <h3>{a.name} <code>{a.code}</code></h3>
              <span className={`pill ${f.ok ? 'ok' : 'err'}`}>필수 항목 {f.requiredMet}/{f.requiredTotal}</span>
            </div>
            <div className="dim">유형 {a.type} · 배치 {paths.length ? paths.join(', ') : '없음'}</div>
            <table>
              <tbody>
                {f.slots.map((s) => {
                  const cands = candidates(data, a, s.item);
                  return (
                    <tr key={s.item}>
                      <td>{s.item} {s.req && <span className="pill">필수</span>}</td>
                      <td>
                        <select value={s.raw ?? ''} onChange={(e) => (e.target.value ? exec((d) => A.linkSlot(d, a.id, s.item, e.target.value)) : exec((d) => A.unlinkSlot(d, a.id, s.item)))}>
                          <option value="">{cands.length ? '선택 안 함' : '후보 없음 (① 포인트 승인 필요)'}</option>
                          {cands.map((t) => <option key={t.raw} value={t.raw}>{t.raw} · {t.name}</option>)}
                        </select>
                      </td>
                      <td>{s.tag ? <span className="pill ok">연결됨 {s.tag.unit}</span> : <span className="pill err">미연결</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </>
  );
}
