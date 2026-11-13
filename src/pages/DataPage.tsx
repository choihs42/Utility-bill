import { useState } from 'react';
import { Tabs } from '../components/ui';
import { TagsSection } from './TagsSection';
import { CodesSection } from './CodesSection';

export function DataPage() {
  const [tab, setTab] = useState<'tags' | 'codes'>('tags');
  return (
    <>
      <Tabs items={[{ key: 'tags', label: '수집 태그' }, { key: 'codes', label: '코드' }]} value={tab} onChange={setTab} />
      {tab === 'tags' ? <TagsSection /> : <CodesSection />}
    </>
  );
}
