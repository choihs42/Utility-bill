import { useMemo } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { appStore, useApp } from '../store/store';
import { validate } from '../domain/derive';

const NAV = [
  { to: '/', label: '시작하기', end: true },
  { to: '/codes', label: '1  기준 코드' },
  { to: '/params', label: '2  파라미터 관리' },
  { to: '/tree', label: '3  계통 트리 설계' },
  { to: '/map', label: '4  트리 매핑' },
  { to: '/check', label: '5  점검' },
];

export function Layout() {
  const data = useApp((s) => s.data);
  const errors = useMemo(() => validate(data).filter((i) => i.severity === '오류').length, [data]);
  return (
    <div className="shell">
      <aside className="side">
        <h1>기준정보 관리</h1>
        <p className="sub">샘플 데이터 · 프론트 프로토타입</p>
        <nav>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? 'on' : '')}>
              {n.label}
              {n.to === '/check' && errors > 0 && <b className="b err">{errors}</b>}
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
