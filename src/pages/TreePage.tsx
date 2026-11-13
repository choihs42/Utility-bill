import { useMemo, useState } from 'react';
import { useApp } from '../store/store';
import { useAction } from '../components/useAction';
import { Msg } from '../components/Msg';
import * as A from '../domain/actions';
import { childrenOf, pathCode } from '../domain/derive';
import type { Data, TreeNode } from '../domain/types';

export function TreePage() {
  const data = useApp((s) => s.data);
  const { msg, exec } = useAction();
  const [view, setView] = useState('power');
  const [assetId, setAssetId] = useState(data.assets[0]?.id ?? '');
  const [nodeId, setNodeId] = useState('');
  const nodes = useMemo(() => data.nodes.filter((n) => n.view === view), [data, view]);
  const target = nodes.some((n) => n.id === nodeId) ? nodeId : nodes[0]?.id ?? '';

  const row = (n: TreeNode, depth: number) => {
    const placed = data.placements.filter((p) => p.nodeId === n.id);
    return (
      <li key={n.id}>
        <div className="node" style={{ paddingLeft: depth * 20 }}>
          <span className="tag">{data.codes.find((c) => c.group === 'node' && c.code === n.type)?.label ?? n.type}</span>
          <b>{n.label}</b>
          <code>{pathCode(data, n.id)}</code>
        </div>
        {placed.map((p) => {
          const a = data.assets.find((x) => x.id === p.assetId)!;
          return (
            <div key={p.id} className={`asset-row ${p.status}`} style={{ marginLeft: depth * 20 + 20 }}>
              <span>{a.name}</span>
              <code>{a.code}</code>
              <label>배분율 <input type="number" min={1} max={100} value={p.share} onChange={(e) => exec((d) => A.setShare(d, p.id, Number(e.target.value)))} />%</label>
              {p.status === 'pending' && <span className="pill warn">승인 대기</span>}
            </div>
          );
        })}
        {childrenOf(data, n.id, view).length > 0 && <ul>{childrenOf(data, n.id, view).map((c) => row(c, depth + 1))}</ul>}
      </li>
    );
  };

  return (
    <>
      <h2>설비 배치</h2>
      <p className="lead">설비를 뷰(전력·조직·공간)별 트리에 배치합니다. 경로 코드는 노드 코드로 자동 생성되고, 배치는 승인 후 반영됩니다.</p>
      <div className="tabs">
        {data.views.map((v) => (
          <button key={v.key} className={v.key === view ? 'on' : ''} onClick={() => setView(v.key)}>{v.label}</button>
        ))}
      </div>
      <div className="card">
        <ul className="tree">{childrenOf(data, null, view).map((n) => row(n, 0))}</ul>
      </div>
      <div className="card form">
        <h3>설비 배치 요청</h3>
        <select value={assetId} onChange={(e) => setAssetId(e.target.value)}>
          {data.assets.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
        </select>
        <span>→</span>
        <select value={target} onChange={(e) => setNodeId(e.target.value)}>
          {nodes.map((n) => <option key={n.id} value={n.id}>{pathCode(data, n.id)}</option>)}
        </select>
        <button onClick={() => exec((d) => A.placeAsset(d, assetId, target))}>배치 요청</button>
        <Msg text={msg} />
      </div>
      <PathTable data={data} />
    </>
  );
}

function PathTable({ data }: { data: Data }) {
  return (
    <div className="card">
      <h3>설비별 경로 (뷰 비교)</h3>
      <table>
        <thead><tr><th>설비</th>{data.views.map((v) => <th key={v.key}>{v.label}</th>)}</tr></thead>
        <tbody>
          {data.assets.map((a) => (
            <tr key={a.id}>
              <td>{a.code}</td>
              {data.views.map((v) => {
                const ps = data.placements.filter((p) => p.assetId === a.id && p.status === 'active' && data.nodes.find((n) => n.id === p.nodeId)?.view === v.key);
                return <td key={v.key}>{ps.length ? ps.map((p) => <div key={p.id}><code>{pathCode(data, p.nodeId)}</code>{ps.length > 1 && ` (${p.share}%)`}</div>) : <span className="dim">미배치</span>}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
