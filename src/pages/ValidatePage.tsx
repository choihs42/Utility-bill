import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../store/store';
import { useAction } from '../components/useAction';
import { Msg } from '../components/Msg';
import * as A from '../domain/actions';
import { validate } from '../domain/derive';

export function ValidatePage() {
  const data = useApp((s) => s.data);
  const { msg, exec } = useAction();
  const issues = useMemo(() => validate(data), [data]);
  return (
    <>
      <h2>검증·승인</h2>
      <p className="lead">데이터에서 계산한 검증 결과입니다. 오류가 남은 설비의 배치 요청은 승인할 수 없습니다.</p>
      <div className="card">
        <h3>검증 결과 <span className="dim">오류 {issues.filter((i) => i.severity === '오류').length} · 경고 {issues.filter((i) => i.severity === '경고').length}</span></h3>
        {issues.length === 0 && <p className="dim">검증 항목에 문제가 없습니다.</p>}
        <ul className="issues">
          {issues.map((i) => (
            <li key={i.id}>
              <span className={`pill ${i.severity === '오류' ? 'err' : 'warn'}`}>{i.severity}</span>
              <div><b>{i.title}</b><div className="dim">{i.detail}</div></div>
              <Link to={i.href}>{i.linkText}</Link>
            </li>
          ))}
        </ul>
      </div>
      <div className="card">
        <h3>변경 요청</h3>
        <Msg text={msg} />
        <table>
          <thead><tr><th>요청</th><th>변경 전</th><th>변경 후</th><th>요청자</th><th>상태</th><th></th></tr></thead>
          <tbody>
            {data.requests.map((r) => (
              <tr key={r.id}>
                <td>{r.title}</td><td>{r.before}</td><td>{r.after}</td><td>{r.by}<div className="dim">{r.when}</div></td>
                <td><span className={`pill ${r.status === '승인됨' ? 'ok' : r.status === '반려됨' ? 'err' : 'warn'}`}>{r.status}</span></td>
                <td className="act">
                  {r.status === '승인 대기' && <>
                    <button onClick={() => exec((d) => A.approveRequest(d, r.id))}>승인</button>
                    <button className="ghost" onClick={() => exec((d) => A.rejectRequest(d, r.id))}>반려</button>
                  </>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
