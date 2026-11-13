import { useState } from 'react';
import { PointsSection } from './PointsPage';
import { AssetsSection } from './AssetsPage';

export function ParamsPage() {
  const [tab, setTab] = useState<'points' | 'assets'>('points');
  return (
    <>
      <h2>파라미터 관리</h2>
      <p className="lead">① 수집된 태그를 포인트로 승인하고, ② 설비에 연결합니다. 이 연결은 한 번만 하면 어느 트리에 놓아도 그대로 쓰입니다.</p>
      <div className="tabs">
        <button className={tab === 'points' ? 'on' : ''} onClick={() => setTab('points')}>① 포인트 승인</button>
        <button className={tab === 'assets' ? 'on' : ''} onClick={() => setTab('assets')}>② 설비 연결</button>
      </div>
      {tab === 'points' ? <PointsSection /> : <AssetsSection />}
    </>
  );
}
