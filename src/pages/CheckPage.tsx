import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../store/store';
import { Tabs } from '../components/ui';
import { validate } from '../domain/derive';

export function CheckPage() {
  const data = useApp((s) => s.data);
  const [tab, setTab] = useState<'result' | 'log'>('result');
  const issues = useMemo(() => validate(data), [data]);
  const errs = issues.filter((i) => i.severity === '오류').length;
  return (
    <>
      <Tabs items={[{ key: 'result', label: `점검 결과 ${issues.length}` }, { key: 'log', label: '변경 이력' }]} value={tab} onChange={setTab} />
      {tab === 'result' ? (
        <>
          <div className="bar">
            <span className="dim">오류 {errs} · 경고 {issues.length - errs}</span>
            <span className="grow" />
            <span className="dim">합산 허용 오차 {data.settings.sumTolerancePct}% (코드 관리 › 설정)</span>
          </div>
          <div className="card flush">
            <table>
              <thead><tr><th>구분</th><th>항목</th><th>내용</th><th></th></tr></thead>
              <tbody>
                {issues.length === 0 && <tr><td colSpan={4} className="empty ok-text">이상 없음</td></tr>}
                {issues.map((i) => (
                  <tr key={i.id}>
                    <td><span className={`pill ${i.severity === '오류' ? 'err' : 'warn'}`}>{i.severity}</span></td>
                    <td className="strong">{i.title}</td>
                    <td className="dim">{i.detail}</td>
                    <td className="act"><Link to={i.href}>{i.linkText}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="card flush">
          <table>
            <thead><tr><th>시각</th><th>내용</th></tr></thead>
            <tbody>
              {data.log.length === 0 && <tr><td colSpan={2} className="empty">변경 내용이 없습니다.</td></tr>}
              {data.log.slice(0, 50).map((l) => <tr key={l.id}><td className="dim nowrap">{l.when}</td><td>{l.text}</td></tr>)}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
