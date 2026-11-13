import { useState } from 'react';
import { AssetsSection } from './AssetsPage';
import { PointsSection } from './PointsPage';
import { AliasSection } from './AliasPage';

const TABS = [
  { key: 'assets', label: '설비·템플릿' },
  { key: 'points', label: '포인트 매핑' },
  { key: 'alias', label: '약어 사전' },
] as const;

export function ParamsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('assets');
  return (
    <>
      <header className="ph">
        <h2>파라미터 관리</h2>
        <p>설비와 템플릿을 정하고, 수집 태그를 설비 항목에 매핑합니다. 승인한 태그는 해당 설비 항목에 바로 연결됩니다.</p>
      </header>
      <div className="tabs">
        {TABS.map((t) => <button key={t.key} className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>{t.label}</button>)}
      </div>
      {tab === 'assets' && <AssetsSection />}
      {tab === 'points' && <PointsSection />}
      {tab === 'alias' && <AliasSection />}
    </>
  );
}
