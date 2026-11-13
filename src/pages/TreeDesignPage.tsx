import { useState } from 'react';
import { useApp } from '../store/store';
import { useAction } from '../components/useAction';
import { Msg } from '../components/Msg';
import { ask } from '../components/confirm';
import * as A from '../domain/actions';
import { childrenOf, pathCode, subtreeIds } from '../domain/derive';
import type { TreeNode } from '../domain/types';

export function TreeDesignPage() {
  const data = useApp((s) => s.data);
  const { msg, note, exec } = useAction();
  const [view, setView] = useState('power');
  const types = data.codes.filter((c) => c.group === 'node' && c.active);
  const [editId, setEditId] = useState<string | null>(null);
  const [parent, setParent] = useState('');
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [type, setType] = useState(types.find((t) => t.code === 'PANEL')?.code ?? types[0]?.code ?? '');

  const nodes = data.nodes.filter((n) => n.view === view);
  const blocked = editId ? new Set([editId, ...subtreeIds(data, editId)]) : new Set<string>();
  const parentOptions = nodes.filter((n) => !blocked.has(n.id));
  const parentValue = parentOptions.some((n) => n.id === parent) ? parent : '';
  const impact = editId ? data.placements.filter((p) => blocked.has(p.nodeId)).length : 0;

  const reset = () => { setEditId(null); setCode(''); setLabel(''); };
  const startEdit = (n: TreeNode) => { setEditId(n.id); setParent(n.parent ?? ''); setCode(n.code); setLabel(n.label); setType(n.type); };
  const submit = () => {
    const par = parentValue || null;
    const ok = editId ? exec((d) => A.updateNode(d, editId, par, code, label, type)) : exec((d) => A.addNode(d, view, par, code, label, type));
    if (ok) reset();
  };

  const row = (n: TreeNode, depth: number) => (
    <li key={n.id}>
      <div className="node" style={{ paddingLeft: depth * 20 }}>
        <span className="tag">{data.codes.find((c) => c.group === 'node' && c.code === n.type)?.label ?? n.type}</span>
        <b>{n.label}</b>
        <code>{pathCode(data, n.id)}</code>
        <span className="act">
          <button className="ghost" onClick={() => { reset(); setParent(n.id); }}>하위 추가</button>
          <button className="ghost" onClick={() => startEdit(n)}>수정</button>
          <button className="ghost" onClick={() => ask(`노드 ${pathCode(data, n.id)}을(를) 삭제합니다.`) && exec((d) => A.deleteNode(d, n.id))}>삭제</button>
        </span>
      </div>
      {childrenOf(data, n.id, view).length > 0 && <ul>{childrenOf(data, n.id, view).map((c) => row(c, depth + 1))}</ul>}
    </li>
  );

  return (
    <>
      <header className="ph"><h2>계통 트리 설계</h2>
      <p>뷰(전력·조직·공간)별로 트리 구조를 만듭니다. 경로 코드(회색 태그)는 노드 코드를 이어서 자동으로 만들어집니다.</p></header>
      <div className="tabs">
        {data.views.map((v) => (
          <button key={v.key} className={v.key === view ? 'on' : ''} onClick={() => { setView(v.key); reset(); }}>{v.label}</button>
        ))}
      </div>
      <Msg text={msg} note={note} />
      <div className="card">
        {nodes.length === 0 ? <p className="dim">아직 노드가 없습니다. 아래에서 최상위 노드를 추가하세요.</p> : <ul className="tree">{childrenOf(data, null, view).map((n) => row(n, 0))}</ul>}
      </div>
      <div className="card form">
        <h3>{editId ? '노드 수정' : '노드 추가'}</h3>
        <select value={parentValue} onChange={(e) => setParent(e.target.value)}>
          <option value="">(최상위)</option>
          {parentOptions.map((n) => <option key={n.id} value={n.id}>{pathCode(data, n.id)}</option>)}
        </select>
        <input placeholder="코드 (예: MCC3)" value={code} onChange={(e) => setCode(e.target.value)} />
        <input placeholder="이름 (예: MCC-3)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <select value={type} onChange={(e) => setType(e.target.value)}>
          {types.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
        </select>
        <button onClick={submit}>{editId ? '저장' : '추가'}</button>
        {editId && <button className="ghost" onClick={reset}>취소</button>}
        {editId && impact > 0 && <p className="dim full">이 변경으로 경로 코드가 바뀌는 배치가 {impact}건 있습니다.</p>}
      </div>
    </>
  );
}
