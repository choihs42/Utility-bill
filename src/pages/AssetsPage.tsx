import { useState } from 'react';
import { useApp } from '../store/store';
import { useAction } from '../components/useAction';
import { Msg } from '../components/Msg';
import { ask } from '../components/confirm';
import * as A from '../domain/actions';
import { fulfillment, placementsIn, slotsOfType } from '../domain/derive';

export function AssetsSection() {
  const data = useApp((s) => s.data);
  const { msg, note, exec } = useAction();
  const types = data.codes.filter((c) => c.group === 'asset' && c.active);
  const energies = data.codes.filter((c) => c.group === 'energy' && c.active);
  const kinds = data.codes.filter((c) => c.group === 'kind' && c.active);

  const [editId, setEditId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState(types[0]?.code ?? '');
  const [energy, setEnergy] = useState(energies[0]?.code ?? '');

  const [tplType, setTplType] = useState(types[0]?.code ?? '');
  const [item, setItem] = useState('');
  const [kind, setKind] = useState(kinds[0]?.code ?? '');
  const [req, setReq] = useState(true);

  const clear = () => { setEditId(null); setCode(''); setName(''); };
  const submit = () => {
    const ok = editId ? exec((d) => A.updateAsset(d, editId, code, name, type, energy)) : exec((d) => A.addAsset(d, code, name, type, energy));
    if (ok) clear();
  };
  const slots = slotsOfType(data, tplType);

  return (
    <>
      <Msg text={msg} note={note} />
      <section className="card">
        <h3>설비</h3>
        <table>
          <thead><tr><th>코드</th><th>이름</th><th>유형</th><th>에너지원</th><th>필수 항목</th><th>항목별 연결 상태</th><th></th></tr></thead>
          <tbody>
            {data.assets.map((a) => {
              const f = fulfillment(data, a);
              const paths = placementsIn(data).filter((p) => p.assetId === a.id).length;
              return (
                <tr key={a.id}>
                  <td><code>{a.code}</code></td>
                  <td>{a.name}</td>
                  <td>{data.codes.find((c) => c.group === 'asset' && c.code === a.type)?.label ?? a.type}</td>
                  <td>{data.codes.find((c) => c.group === 'energy' && c.code === a.energy)?.label ?? a.energy}</td>
                  <td><span className={`pill ${f.ok ? 'ok' : 'err'}`}>{f.requiredMet}/{f.requiredTotal}</span></td>
                  <td>
                    {f.slots.map((s) => (
                      <div key={s.item} className="slotline">
                        <span className={s.tag ? '' : s.req ? 'miss' : 'dim'}>{s.item}{s.req ? ' *' : ''}</span>
                        <span className="dim">{s.tag ? s.tag.raw : '미연결'}</span>
                      </div>
                    ))}
                  </td>
                  <td className="act">
                    <button className="ghost" onClick={() => { setEditId(a.id); setCode(a.code); setName(a.name); setType(a.type); setEnergy(a.energy); }}>수정</button>
                    <button className="ghost" onClick={() => ask(`설비 ${a.code}을(를) 삭제합니다.${paths ? ' 트리 배치가 있으면 삭제되지 않습니다.' : ''}`) && exec((d) => A.deleteAsset(d, a.id))}>삭제</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="form">
          <b className="fl">{editId ? '설비 수정' : '설비 추가'}</b>
          <input placeholder="코드 (예: CP2)" value={code} onChange={(e) => setCode(e.target.value)} />
          <input placeholder="이름 (예: 컴프레서 CP-02)" value={name} onChange={(e) => setName(e.target.value)} />
          <select value={type} onChange={(e) => setType(e.target.value)}>{types.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}</select>
          <select value={energy} onChange={(e) => setEnergy(e.target.value)}>{energies.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}</select>
          <button onClick={submit}>{editId ? '저장' : '추가'}</button>
          {editId && <button className="ghost" onClick={clear}>취소</button>}
        </div>
        <p className="hint">설비 코드는 바꿔도 태그 연결과 트리 배치는 그대로 유지됩니다. 경로 코드는 트리 노드 코드로 만들어지므로 영향이 없습니다.</p>
      </section>

      <section className="card">
        <h3>설비 유형 템플릿</h3>
        <p className="hint">설비 유형마다 갖춰야 할 데이터 항목입니다. 필수 항목이 모두 연결돼야 해당 설비가 점검을 통과합니다.</p>
        <div className="form tight">
          <b className="fl">유형</b>
          <select value={tplType} onChange={(e) => setTplType(e.target.value)}>{types.map((t) => <option key={t.code} value={t.code}>{t.label} ({t.code})</option>)}</select>
        </div>
        <table>
          <thead><tr><th>항목</th><th>계측 성격</th><th>필수</th><th>적용 설비</th><th></th></tr></thead>
          <tbody>
            {slots.length === 0 && <tr><td colSpan={5} className="dim">이 유형에는 아직 항목이 없습니다.</td></tr>}
            {slots.map((s) => (
              <tr key={s.item}>
                <td>{s.item}</td>
                <td>{kinds.find((k) => k.code === s.kind)?.label ?? s.kind}</td>
                <td><label className="chk"><input type="checkbox" checked={s.req} onChange={() => exec((d) => A.toggleSlotReq(d, tplType, s.item))} /> 필수</label></td>
                <td className="dim">{data.assets.filter((a) => a.type === tplType).map((a) => a.code).join(', ') || '-'}</td>
                <td className="act"><button className="ghost" onClick={() => ask(`템플릿 항목 '${s.item}'을(를) 삭제합니다.`) && exec((d) => A.removeSlot(d, tplType, s.item))}>삭제</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="form">
          <b className="fl">항목 추가</b>
          <input placeholder="항목 이름 (예: 토출 온도)" value={item} onChange={(e) => setItem(e.target.value)} />
          <select value={kind} onChange={(e) => setKind(e.target.value)}>{kinds.map((k) => <option key={k.code} value={k.code}>{k.label}</option>)}</select>
          <label className="chk"><input type="checkbox" checked={req} onChange={(e) => setReq(e.target.checked)} /> 필수</label>
          <button onClick={() => exec((d) => A.addSlot(d, tplType, item, req, kind)) && setItem('')}>추가</button>
        </div>
      </section>
    </>
  );
}
