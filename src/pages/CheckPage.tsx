import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../store/store';
import { useAction } from '../components/useAction';
import { Msg } from '../components/Msg';
import * as A from '../domain/actions';
import { validate } from '../domain/derive';

export function CheckPage() {
  const data = useApp((s) => s.data);
  const { msg, exec } = useAction();
  const issues = useMemo(() => validate(data), [data]);
  const errs = issues.filter((i) => i.severity === '오류').length;
  return (
    <>
      <header className="ph"><h2>점검</h2>
      <p>빠뜨렸거나 맞지 않는 항목을 한 번에 보여줍니다. 막는 기능은 아니며, 각 항목의 링크로 바로 이동해 고칠 수 있습니다.</p></header>
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
        <h3>점검 기준</h3>
        <div className="form tight">
          <span>전력계통 합산 허용 오차</span>
          <select value={data.settings.sumTolerancePct} onChange={(e) => exec((d) => A.setTolerance(d, Number(e.target.value)))}>
            {[0.5, 1, 2, 3, 5, 10].map((v) => <option key={v} value={v}>{v}%</option>)}
          </select>
          <span className="dim">상위 설비 값과 하위 설비 합의 차이가 이 값을 넘으면 경고합니다.</span>
        </div>
        <Msg text={msg} />
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
