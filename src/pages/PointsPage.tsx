import { useState } from 'react';
import { useApp } from '../store/store';
import { useAction } from '../components/useAction';
import { Msg } from '../components/Msg';
import * as A from '../domain/actions';
import { templateSlots } from '../domain/derive';

/** 입력 후 포커스를 벗어나거나 Enter를 누르면 저장 */
function NameInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value);
  const commit = () => v.trim() !== value && onCommit(v);
  return (
    <input
      className="wide"
      value={v}
      placeholder="포인트명 입력"
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

export function PointsSection() {
  const data = useApp((s) => s.data);
  const { msg, note, exec } = useAction();
  const units = data.codes.filter((c) => c.group === 'unit' && c.active);
  return (
    <>
      <div className="toolbar">
        <button onClick={() => exec((d) => A.approveAllReady(d))}>추천 포인트 한 번에 승인</button>
        <span className="dim">포인트명·설비·항목·단위가 모두 있고 추천 일치도 80% 이상인 태그만 승인합니다.</span>
      </div>
      <Msg text={msg} note={note} />
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>원천 태그</th><th>포인트명 (입력)</th><th>설비</th><th>항목</th><th>단위</th>
              <th title="약어 사전으로 자동 추천한 매핑이 맞을 가능성(%). 직접 수정하면 참고용입니다.">추천 일치도</th>
              <th title="제안: 승인 전 / 승인: 설비에 연결 가능 / 보류: 사용하지 않음">상태</th><th></th>
            </tr>
          </thead>
          <tbody>
            {data.tags.map((t) => {
              const asset = data.assets.find((a) => a.code === t.assetCode);
              const slots = asset ? templateSlots(data, asset) : [];
              return (
                <tr key={t.raw}>
                  <td><code>{t.raw}</code><div className="dim">{t.device}{t.ptId && ` · ${t.ptId}`}</div></td>
                  <td><NameInput key={`${t.raw}:${t.name}`} value={t.name} onCommit={(v) => exec((d) => A.updateTag(d, t.raw, { name: v }))} /></td>
                  <td>
                    <select value={t.assetCode ?? ''} onChange={(e) => exec((d) => A.updateTag(d, t.raw, { assetCode: e.target.value || null }))}>
                      <option value="">(미지정)</option>
                      {data.assets.map((a) => <option key={a.id} value={a.code}>{a.code} · {a.name}</option>)}
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
                  <td>{t.conf}%</td>
                  <td><span className={`pill ${t.status === '승인' ? 'ok' : t.status === '보류' ? 'err' : 'warn'}`}>{t.status}</span></td>
                  <td className="act">
                    {t.status !== '승인' && <button onClick={() => exec((d) => A.approveTag(d, t.raw))}>승인</button>}
                    {t.status !== '보류' && <button className="ghost" onClick={() => exec((d) => A.holdTag(d, t.raw))}>보류</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <details>
          <summary>추천 근거 보기</summary>
          <ul>{data.tags.map((t) => <li key={t.raw}><code>{t.raw}</code> — {t.reasons.join(' / ')}</li>)}</ul>
        </details>
      </div>
    </>
  );
}
