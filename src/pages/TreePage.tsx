import { useState } from 'react';
import { useApp } from '../store/store';
import { useAction } from '../components/useAction';
import { Msg } from '../components/Msg';
import { Cell, Tabs } from '../components/ui';
import { ask } from '../components/confirm';
import * as A from '../domain/actions';
import { assetOf, codeLabel, flatTree, nodeCode, pathCode, subtreeIds } from '../domain/derive';

function AssetsTab() {
  const data = useApp((s) => s.data);
  const { msg, note, exec } = useAction();
  const types = data.codes.filter((c) => c.group === 'asset' && c.active);
  const energies = data.codes.filter((c) => c.group === 'energy' && c.active);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState(types[0]?.code ?? '');
  const [energy, setEnergy] = useState(energies[0]?.code ?? '');
  return (
    <>
      <Msg text={msg} note={note} />
      <div className="card flush">
        <table>
          <thead><tr><th>코드</th><th>이름</th><th>유형</th><th>에너지원</th><th className="num">트리 배치</th><th className="num">연결 포인트</th><th></th></tr></thead>
          <tbody>
            {data.assets.map((a) => (
              <tr key={a.id}>
                <td><Cell className="cell sm" value={a.code} onCommit={(v) => exec((d) => A.updateAsset(d, a.id, { code: v }))} /></td>
                <td><Cell value={a.name} onCommit={(v) => exec((d) => A.updateAsset(d, a.id, { name: v }))} /></td>
                <td>
                  <select value={a.type} onChange={(e) => exec((d) => A.updateAsset(d, a.id, { type: e.target.value }))}>
                    {types.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
                    {!types.some((t) => t.code === a.type) && <option value={a.type}>{a.type} (중지)</option>}
                  </select>
                </td>
                <td>
                  <select value={a.energy} onChange={(e) => exec((d) => A.updateAsset(d, a.id, { energy: e.target.value }))}>
                    {energies.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
                    {!energies.some((t) => t.code === a.energy) && <option value={a.energy}>{a.energy} (중지)</option>}
                  </select>
                </td>
                <td className="num">{data.nodes.filter((n) => n.assetId === a.id).length}</td>
                <td className="num">{data.tags.filter((t) => t.assetId === a.id).length}</td>
                <td className="act"><button className="ghost" onClick={() => ask(`설비 ${a.code}을(를) 삭제합니다.`) && exec((d) => A.deleteAsset(d, a.id))}>삭제</button></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="addrow">
              <td><input className="cell sm" placeholder="코드" value={code} onChange={(e) => setCode(e.target.value)} /></td>
              <td><input className="cell" placeholder="이름" value={name} onChange={(e) => setName(e.target.value)} /></td>
              <td><select value={type} onChange={(e) => setType(e.target.value)}>{types.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}</select></td>
              <td><select value={energy} onChange={(e) => setEnergy(e.target.value)}>{energies.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}</select></td>
              <td colSpan={3} className="act"><button onClick={() => exec((d) => A.addAsset(d, { code, name, type, energy })) && (setCode(''), setName(''))}>추가</button></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

function ViewTab({ viewKey }: { viewKey: string }) {
  const data = useApp((s) => s.data);
  const { msg, note, exec } = useAction();
  const view = data.views.find((v) => v.key === viewKey)!;
  const rows = flatTree(data, viewKey);
  const groupTypes = data.codes.filter((c) => c.group === 'group' && c.active);
  const [pAsset, setPAsset] = useState(data.assets[0]?.id ?? '');
  const [pParent, setPParent] = useState('');
  const [gCode, setGCode] = useState('');
  const [gName, setGName] = useState('');
  const [gType, setGType] = useState(groupTypes[0]?.code ?? '');
  const [gParent, setGParent] = useState('');
  const parentOptions = rows.map((r) => ({ id: r.node.id, label: pathCode(data, r.node.id) }));
  const validParent = (v: string) => (parentOptions.some((o) => o.id === v) ? v : '');
  const placed = new Set(data.nodes.filter((n) => n.view === viewKey && n.assetId).map((n) => n.assetId));

  return (
    <>
      <div className="bar">
        <label className="chk"><input type="checkbox" checked={view.requireCoverage} onChange={(e) => exec((d) => A.setViewOption(d, viewKey, { requireCoverage: e.target.checked }))} /> 모든 설비 배치 필수</label>
        <label className="chk"><input type="checkbox" checked={view.sumCheck} onChange={(e) => exec((d) => A.setViewOption(d, viewKey, { sumCheck: e.target.checked }))} /> 합산 점검</label>
      </div>
      <Msg text={msg} note={note} />
      <div className="card flush">
        <table>
          <thead><tr><th>이름</th><th>코드</th><th>유형</th><th>상위</th><th>경로 코드</th><th className="num">배분율</th><th></th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="empty">노드가 없습니다. 아래에서 추가하세요.</td></tr>}
            {rows.map(({ node: n, depth }) => {
              const blocked = new Set([n.id, ...subtreeIds(data, n.id)]);
              const a = assetOf(data, n.assetId);
              return (
                <tr key={n.id}>
                  <td style={{ paddingLeft: 10 + depth * 18 }}>
                    {a ? <span>{a.name}</span> : <Cell value={n.label ?? ''} onCommit={(v) => exec((d) => A.updateNode(d, n.id, { label: v }))} />}
                  </td>
                  <td>{a ? <code>{nodeCode(data, n)}</code> : <Cell className="cell sm" value={n.code ?? ''} onCommit={(v) => exec((d) => A.updateNode(d, n.id, { code: v }))} />}</td>
                  <td>
                    {a ? <span className="dim">{codeLabel(data, 'asset', a.type)}</span> : (
                      <select value={n.type ?? ''} onChange={(e) => exec((d) => A.updateNode(d, n.id, { type: e.target.value }))}>
                        {groupTypes.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
                        {n.type && !groupTypes.some((t) => t.code === n.type) && <option value={n.type}>{n.type} (중지)</option>}
                      </select>
                    )}
                  </td>
                  <td>
                    <select value={n.parent ?? ''} onChange={(e) => exec((d) => A.updateNode(d, n.id, { parent: e.target.value || null }))}>
                      <option value="">(최상위)</option>
                      {parentOptions.filter((o) => !blocked.has(o.id)).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                  </td>
                  <td className="dim path">{pathCode(data, n.id)}</td>
                  <td className="num">
                    {a ? <input type="number" className="share" min={1} max={100} value={n.share} onChange={(e) => exec((d) => A.setShare(d, n.id, Number(e.target.value)))} /> : <span className="dim">-</span>}
                  </td>
                  <td className="act"><button className="ghost" onClick={() => ask(`${pathCode(data, n.id)}을(를) 트리에서 삭제합니다.`) && exec((d) => A.deleteNode(d, n.id))}>삭제</button></td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="addrow">
              <td colSpan={7}>
                <div className="addline">
                  <b>설비 놓기</b>
                  <select value={pAsset} onChange={(e) => setPAsset(e.target.value)}>
                    {data.assets.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}{placed.has(a.id) ? '' : ' *'}</option>)}
                  </select>
                  <span className="dim">상위</span>
                  <select value={validParent(pParent)} onChange={(e) => setPParent(e.target.value)}>
                    <option value="">(최상위)</option>
                    {parentOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                  <button onClick={() => exec((d) => A.placeAsset(d, viewKey, pAsset, validParent(pParent) || null))}>놓기</button>
                  <span className="dim">* 이 트리에 아직 없는 설비</span>
                </div>
                {view.groups && (
                  <div className="addline">
                    <b>그룹 추가</b>
                    <input className="cell sm" placeholder="코드" value={gCode} onChange={(e) => setGCode(e.target.value)} />
                    <input className="cell" placeholder="이름" value={gName} onChange={(e) => setGName(e.target.value)} />
                    <select value={gType} onChange={(e) => setGType(e.target.value)}>{groupTypes.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}</select>
                    <span className="dim">상위</span>
                    <select value={validParent(gParent)} onChange={(e) => setGParent(e.target.value)}>
                      <option value="">(최상위)</option>
                      {parentOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                    <button onClick={() => exec((d) => A.addGroup(d, viewKey, validParent(gParent) || null, gCode, gName, gType)) && (setGCode(''), setGName(''))}>추가</button>
                  </div>
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

export function TreePage() {
  const data = useApp((s) => s.data);
  const [tab, setTab] = useState('assets');
  const items = [{ key: 'assets', label: '설비' }, ...data.views.map((v) => ({ key: v.key, label: v.label }))];
  return (
    <>
      <Tabs items={items} value={tab} onChange={setTab} />
      {tab === 'assets' ? <AssetsTab /> : <ViewTab key={tab} viewKey={tab} />}
    </>
  );
}

