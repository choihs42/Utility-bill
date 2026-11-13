import { useMemo } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { appStore, useApp } from '../store/store';
import { validate } from '../domain/derive';
import { ask } from './confirm';

const NAV = [
  { to: '/codes', no: '1', label: '기준 코드' },
  { to: '/params', no: '2', label: '파라미터 관리' },
  { to: '/tree', no: '3', label: '계통 트리 설계' },
  { to: '/map', no: '4', label: '트리 매핑' },
  { to: '/check', no: '5', label: '점검' },
];

export function Layout() {
  const data = useApp((s) => s.data);
  const canUndo = useApp((s) => s.past.length > 0);
  const errors = useMemo(() => validate(data).filter((i) => i.severity === '오류').length, [data]);
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <b>기준정보 관리</b>
          <span>샘플 데이터 · 프로토타입</span>
        </div>
        <nav>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => (isActive ? 'on' : '')}>
              <i>{n.no}</i>
              <span>{n.label}</span>
              {n.to === '/check' && errors > 0 && <b className="b">{errors}</b>}
            </NavLink>
          ))}
        </nav>
        <div className="side-foot">
          <button className="ghost" disabled={!canUndo} onClick={() => appStore.getState().undo()}>되돌리기</button>
          <button className="ghost" onClick={() => ask('샘플 데이터로 초기화합니다. 지금까지의 변경이 모두 사라집니다.') && appStore.getState().reset()}>초기화</button>
          <p>변경 내용은 이 브라우저에만 저장됩니다.</p>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
