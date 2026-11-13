import { useMemo } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { appStore, useApp } from '../store/store';
import { validate } from '../domain/derive';

const NAV = [
  { to: '/', label: '설비 배치', end: true },
  { to: '/points', label: '포인트 승인' },
  { to: '/assets', label: '설비 연결' },
  { to: '/codes', label: '코드 관리' },
  { to: '/validate', label: '검증·승인' },
];

export function Layout() {
  const data = useApp((s) => s.data);
  const issues = useMemo(() => validate(data), [data]);
  const errors = issues.filter((i) => i.severity === '오류').length;
  const pending = data.requests.filter((r) => r.status === '승인 대기').length;
  return (
    <div className="shell">
      <aside className="side">
        <h1>기준정보 관리</h1>
        <p className="sub">샘플 데이터 · 프론트 프로토타입</p>
        <nav>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? 'on' : '')}>
              {n.label}
              {n.to === '/validate' && (
                <span className="badges">
                  {errors > 0 && <b className="b err">{errors}</b>}
                  {pending > 0 && <b className="b pend">{pending}</b>}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <button className="ghost" onClick={() => appStore.getState().reset()}>샘플 데이터 초기화</button>
        <p className="note">변경 내용은 이 브라우저에만 저장됩니다.</p>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
