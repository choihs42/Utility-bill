import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../store/store';
import { validate } from '../domain/derive';

export function CheckPage() {
  const data = useApp((s) => s.data);
  const issues = useMemo(() => validate(data), [data]);
  const errs = issues.filter((i) => i.severity === '오류').length;
  return (
    <>
      <h2>점검</h2>
      <p className="lead">빠뜨렸거나 맞지 않는 항목을 한 번에 보여줍니다. 막는 기능은 아니며, 각 항목의 링크로 바로 이동해 고칠 수 있습니다.</p>
      <div className="card">
        <h3>점검 결과 <span className="dim">오류 {errs} · 경고 {issues.length - errs}</span></h3>
        {issues.length === 0 && <p className="okline">모든 점검 항목을 통과했습니다.</p>}
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
        <h3>변경 이력</h3>
        {data.log.length === 0 ? <p className="dim">아직 변경 내용이 없습니다.</p> : (
          <ul className="logs">{data.log.slice(0, 30).map((l) => <li key={l.id}><span className="dim">{l.when}</span> {l.text}</li>)}</ul>
        )}
      </div>
    </>
  );
}
