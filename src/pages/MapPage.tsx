import { useState } from 'react';
import { useApp } from '../store/store';
import { useAction } from '../components/useAction';
import { Msg } from '../components/Msg';
import { ask } from '../components/confirm';
import * as A from '../domain/actions';
import { childrenOf, pathCode, placementsIn } from '../domain/derive';
import type { TreeNode } from '../domain/types';

export function MapPage() {
  const data = useApp((s) => s.data);
  const { msg, note, exec } = useAction();
  const [view, setView] = useState('power');
  const [assetId, setAssetId] = useState(data.assets[0]?.id ?? '');
  const [nodeId, setNodeId] = useState('');
  const nodes = data.nodes.filter((n) => n.view === view);
  const target = nodes.some((n) => n.id === nodeId) ? nodeId : nodes[0]?.id ?? '';
  const placedIds = new Set(placementsIn(data, view).map((p) => p.assetId));
  const unplaced = data.assets.filter((a) => !placedIds.has(a.id));

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
            <div key={p.id} className="asset-row" style={{ marginLeft: depth * 20 + 20 }}>
              <span>{a.name}</span>
              <code>{a.code}</code>
              <label>배분율 <input type="number" min={1} max={100} value={p.share} onChange={(e) => exec((d) => A.setShare(d, p.id, Number(e.target.value)))} />%</label>
              <button className="ghost" onClick={() => ask(`${a.code}의 배치(${pathCode(data, n.id)})를 해제합니다.`) && exec((d) => A.removePlacement(d, p.id))}>해제</button>
            </div>
          );
        })}
        {childrenOf(data, n.id, view).length > 0 && <ul>{childrenOf(data, n.id, view).map((c) => row(c, depth + 1))}</ul>}
      </li>
    );
  };

  return (
    <>
      <header className="ph"><h2>트리 매핑</h2>
      <p>설비를 트리의 알맞은 위치에 놓습니다. 같은 설비를 전력·조직·공간 트리에 모두 놓을 수 있고, 한 트리의 여러 곳에 놓으면 배분율로 나눕니다.</p></header>
      <div className="tabs">
        {data.views.map((v) => (
          <button key={v.key} className={v.key === view ? 'on' : ''} onClick={() => setView(v.key)}>{v.label}</button>
        ))}
      </div>
      <Msg text={msg} note={note} />
      <div className="card">
        {nodes.length === 0 ? <p className="dim">이 뷰에는 노드가 없습니다. 먼저 3단계에서 트리를 만드세요.</p> : <ul className="tree">{childrenOf(data, null, view).map((n) => row(n, 0))}</ul>}
      </div>
      <div className="card form">
        <h3>설비 놓기</h3>
        <select value={assetId} onChange={(e) => setAssetId(e.target.value)}>
          {data.assets.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}{placedIds.has(a.id) ? '' : ' (미배치)'}</option>)}
        </select>
        <span>→</span>
        <select value={target} onChange={(e) => setNodeId(e.target.value)}>
          {nodes.map((n) => <option key={n.id} value={n.id}>{pathCode(data, n.id)}</option>)}
        </select>
        <button disabled={!target} onClick={() => exec((d) => A.placeAsset(d, assetId, target))}>놓기</button>
        {unplaced.length > 0 && <p className="dim full">이 뷰에 아직 없는 설비: {unplaced.map((a) => a.code).join(', ')}</p>}
      </div>
      <div className="card">
        <h3>설비별 경로 (뷰 비교)</h3>
        <table>
          <thead><tr><th>설비</th>{data.views.map((v) => <th key={v.key}>{v.label}</th>)}</tr></thead>
          <tbody>
            {data.assets.map((a) => (
              <tr key={a.id}>
                <td>{a.code}</td>
                {data.views.map((v) => {
                  const ps = placementsIn(data, v.key).filter((p) => p.assetId === a.id);
                  return <td key={v.key}>{ps.length ? ps.map((p) => <div key={p.id}><code>{pathCode(data, p.nodeId)}</code>{ps.length > 1 && ` (${p.share}%)`}</div>) : <span className="dim">미배치</span>}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
