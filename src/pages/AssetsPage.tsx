import { useApp } from '../store/store';
import { useAction } from '../components/useAction';
import { Msg } from '../components/Msg';
import * as A from '../domain/actions';
import { candidates, fulfillment, pathCode } from '../domain/derive';

export function AssetsPage() {
  const data = useApp((s) => s.data);
  const { msg, exec } = useAction();
  return (
    <>
      <h2>설비 연결</h2>
      <p className="lead">설비 유형 템플릿의 슬롯에 승인된 표준 포인트를 한 번만 연결합니다. 이후 어느 뷰에 배치해도 같은 연결을 사용합니다.</p>
      <Msg text={msg} />
      {data.assets.map((a) => {
        const f = fulfillment(data, a);
        const paths = data.placements.filter((p) => p.assetId === a.id && p.status === 'active').map((p) => pathCode(data, p.nodeId));
        return (
          <div className="card" key={a.id}>
            <div className="head">
              <h3>{a.name} <code>{a.code}</code></h3>
              <span className={`pill ${f.ok ? 'ok' : 'err'}`}>필수 {f.requiredMet}/{f.requiredTotal}</span>
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
                          <option value="">{cands.length ? '선택 안 함' : '후보 없음 (포인트 승인 필요)'}</option>
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
