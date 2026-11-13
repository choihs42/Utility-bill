import { useApp } from '../store/store';
import { useAction } from '../components/useAction';
import { Msg } from '../components/Msg';
import * as A from '../domain/actions';

export function PointsSection() {
  const data = useApp((s) => s.data);
  const { msg, note, exec } = useAction();
  const units = data.codes.filter((c) => c.group === 'unit' && c.active);
  return (
    <>
      <div className="toolbar">
        <button onClick={() => exec((d) => A.approveAllReady(d))}>추천 포인트 한 번에 승인</button>
        <span className="dim">신뢰도 80% 이상이고 단위가 있는 태그만 승인합니다.</span>
      </div>
      <Msg text={msg} note={note} />
      <div className="card">
        <table>
          <thead><tr><th>원천 태그</th><th>표준 포인트</th><th>설비 · 슬롯</th><th>단위</th><th>신뢰도</th><th>상태</th><th></th></tr></thead>
          <tbody>
            {data.tags.map((t) => (
              <tr key={t.raw}>
                <td><code>{t.raw}</code><div className="dim">{t.device}</div></td>
                <td>{t.name ? <>{t.name}<div className="dim">{t.ptId}</div></> : <span className="dim">제안 불가</span>}</td>
                <td>{t.assetCode ? `${t.assetCode} · ${t.slot}` : '-'}</td>
                <td>
                  {t.unit ? t.unit : t.assetCode ? (
                    <select value="" onChange={(e) => e.target.value && exec((d) => A.setTagUnit(d, t.raw, e.target.value))}>
                      <option value="">단위 선택</option>
                      {units.map((u) => <option key={u.code} value={u.code}>{u.code}</option>)}
                    </select>
                  ) : '-'}
                </td>
                <td>{t.conf}%</td>
                <td><span className={`pill ${t.status === '승인' ? 'ok' : t.status === '보류' ? 'err' : 'warn'}`}>{t.status}</span></td>
                <td className="act">
                  {t.status !== '승인' && <button onClick={() => exec((d) => A.approveTag(d, t.raw))}>승인</button>}
                  {t.status !== '보류' && <button className="ghost" onClick={() => exec((d) => A.holdTag(d, t.raw))}>보류</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <details>
          <summary>제안 근거 보기</summary>
          <ul>{data.tags.map((t) => <li key={t.raw}><code>{t.raw}</code> — {t.reasons.join(' / ')}</li>)}</ul>
        </details>
      </div>
    </>
  );
}
