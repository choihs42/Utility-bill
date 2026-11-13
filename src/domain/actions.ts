import type { Data, SourceTag } from './types';
import type { TagRow } from './csv';
import { EFFECTIVE_DATE } from './seed';
import { nodeById, pathCode, slotOwner, slotsOfType, subtreeIds, templateSlots } from './derive';

// 상태 변경은 모두 순수 함수: (데이터, 인자) → { data, error, note }. 오류면 데이터는 그대로.
export interface Result {
  data: Data;
  error: string | null;
  /** 성공 시 화면에 보여줄 안내 */
  note?: string;
}

const fail = (data: Data, error: string): Result => ({ data, error });
const stamp = () => new Date().toISOString().slice(0, 16).replace('T', ' ');

/** 성공 결과를 만들면서 변경 이력에 한 줄 남긴다 */
function done(d: Data, text: string, note?: string): Result {
  const entry = { id: `lg-${d.counters.lg}`, when: stamp(), text };
  return {
    data: { ...d, log: [entry, ...d.log].slice(0, 100), counters: { ...d.counters, lg: d.counters.lg + 1 } },
    error: null,
    note,
  };
}

const unitActive = (d: Data, unit: string) => d.codes.some((c) => c.group === 'unit' && c.code === unit && c.active);

/* ---------- 포인트 매핑 ---------- */

export interface TagPatch {
  name?: string;
  assetId?: string | null;
  slot?: string | null;
  unit?: string;
}

type Patched = { tag: SourceTag; reset: boolean } | { error: string };

/** 태그 한 줄 수정(검증 포함). 승인된 태그의 설비/항목이 바뀌면 승인을 되돌린다 */
function patchTag(d: Data, t: SourceTag, patch: TagPatch): Patched {
  const next = { ...t };
  if (patch.name !== undefined) next.name = patch.name.trim();
  if (patch.unit !== undefined) {
    if (patch.unit !== '' && !unitActive(d, patch.unit)) return { error: `사용할 수 없는 단위 코드입니다: ${patch.unit}` };
    next.unit = patch.unit;
  }
  if (patch.assetId !== undefined) {
    if (patch.assetId !== null && !d.assets.some((a) => a.id === patch.assetId)) return { error: '없는 설비입니다.' };
    next.assetId = patch.assetId;
    if (patch.slot === undefined) next.slot = null;
  }
  if (patch.slot !== undefined) {
    const a = d.assets.find((x) => x.id === next.assetId);
    if (patch.slot !== null && !(a && templateSlots(d, a).some((s) => s.item === patch.slot))) {
      return { error: `${t.raw}: 이 설비에 없는 항목입니다.` };
    }
    next.slot = patch.slot;
  }
  if (t.status === '승인' && (!next.name || !next.unit)) return { error: `${t.raw}: 승인된 태그의 포인트명과 단위는 비울 수 없습니다.` };
  const reset = t.status === '승인' && (next.assetId !== t.assetId || next.slot !== t.slot);
  if (reset) next.status = '제안';
  return { tag: next, reset };
}

const RESET_NOTE = '설비/항목이 바뀐 승인 태그는 승인이 해제되었습니다. 다시 승인하세요.';

export function updateTag(d: Data, raw: string, patch: TagPatch): Result {
  const t = d.tags.find((x) => x.raw === raw);
  if (!t) return fail(d, '태그를 찾을 수 없습니다.');
  const r = patchTag(d, t, patch);
  if ('error' in r) return fail(d, r.error);
  return done({ ...d, tags: d.tags.map((x) => (x.raw === raw ? r.tag : x)) }, `태그 수정: ${raw}`, r.reset ? RESET_NOTE : undefined);
}

export function setTagUnit(d: Data, raw: string, unit: string): Result {
  return updateTag(d, raw, { unit });
}

/** 선택한 여러 태그에 같은 설비/항목/단위를 한 번에 지정 (하나라도 오류면 전체 취소) */
export function bulkUpdateTags(d: Data, raws: string[], patch: TagPatch): Result {
  if (raws.length === 0) return fail(d, '선택한 태그가 없습니다.');
  const set = new Set(raws);
  let reset = 0;
  const tags: SourceTag[] = [];
  for (const t of d.tags) {
    if (!set.has(t.raw)) {
      tags.push(t);
      continue;
    }
    const r = patchTag(d, t, patch);
    if ('error' in r) return fail(d, r.error);
    if (r.reset) reset += 1;
    tags.push(r.tag);
  }
  return done({ ...d, tags }, `태그 ${raws.length}개 일괄 수정`, reset ? RESET_NOTE : `${raws.length}개를 수정했습니다.`);
}

function nextPtId(d: Data): string {
  const max = d.tags.reduce((m, t) => Math.max(m, Number(t.ptId.replace('PT-', '')) || 0), 0);
  return `PT-${String(max + 1).padStart(6, '0')}`;
}

/** 승인 검증 + 적용(이력 없음). 승인 = 해당 설비 항목에 연결 */
function approveInner(d: Data, raw: string): { data: Data } | { error: string } {
  const t = d.tags.find((x) => x.raw === raw);
  if (!t) return { error: '태그를 찾을 수 없습니다.' };
  if (!t.name) return { error: `${raw}: 포인트명을 입력하세요.` };
  if (!t.assetId || !t.slot) return { error: `${raw}: 설비와 항목을 선택하세요.` };
  if (!t.unit) return { error: `${raw}: 단위를 선택하세요.` };
  const a = d.assets.find((x) => x.id === t.assetId);
  const other = slotOwner(d, t.assetId, t.slot, raw);
  if (other) return { error: `${raw}: ${a?.code} · ${t.slot} 항목에는 이미 ${other.raw}가 연결되어 있습니다. 그 태그를 먼저 보류하세요.` };
  const dup = d.tags.find((x) => x.raw !== raw && x.status === '승인' && x.assetId === t.assetId && x.name === t.name);
  if (dup) return { error: `${raw}: 같은 설비에 같은 포인트명(${t.name})이 있습니다.` };
  const ptId = t.ptId || nextPtId(d);
  return { data: { ...d, tags: d.tags.map((x) => (x.raw === raw ? { ...x, ptId, status: '승인' } : x)) } };
}

export function approveTag(d: Data, raw: string): Result {
  const r = approveInner(d, raw);
  if ('error' in r) return fail(d, r.error);
  const t = d.tags.find((x) => x.raw === raw)!;
  const a = d.assets.find((x) => x.id === t.assetId);
  return done(r.data, `포인트 승인: ${raw} → ${a?.code} · ${t.slot}`, `${a?.code} · ${t.slot} 항목에 연결되었습니다.`);
}

/** 입력이 모두 채워진 제안 태그를 한 번에 승인. 항목이 겹치는 태그는 건너뛴다 */
export function approveAllReady(d: Data): Result {
  let cur = d;
  const ok: string[] = [];
  const skipped: string[] = [];
  for (const t of d.tags.filter((x) => x.status === '제안' && x.name && x.assetId && x.slot && x.unit)) {
    const r = approveInner(cur, t.raw);
    if ('error' in r) skipped.push(t.raw);
    else {
      cur = r.data;
      ok.push(t.raw);
    }
  }
  if (ok.length === 0) return { data: d, error: null, note: '한 번에 승인할 수 있는 태그가 없습니다. (포인트명·설비·항목·단위가 모두 있어야 합니다)' };
  const extra = skipped.length ? ` 항목이 겹쳐 건너뜀: ${skipped.join(', ')}` : '';
  return done(cur, `포인트 ${ok.length}개 일괄 승인`, `${ok.length}개를 승인했습니다.${extra}`);
}

/** 보류: 승인 취소와 같다. 해당 설비 항목의 연결도 풀린다 */
export function holdTag(d: Data, raw: string): Result {
  if (!d.tags.some((t) => t.raw === raw)) return fail(d, '태그를 찾을 수 없습니다.');
  return done({ ...d, tags: d.tags.map((t) => (t.raw === raw ? { ...t, status: '보류' } : t)) }, `포인트 보류: ${raw}`);
}

/** 약어 사전으로 빈 칸만 채운다. 이미 입력된 값은 바꾸지 않는다 */
function fillOne(d: Data, t: SourceTag): SourceTag {
  if (t.status !== '제안') return t;
  const tokens = t.raw.split(/[_\-\s]+/).filter(Boolean).map((x) => x.toLowerCase());
  const has = (token: string) => tokens.includes(token.toLowerCase());
  const next = { ...t };
  if (!next.assetId) {
    const al = d.aliases.find((a) => a.kind === 'asset' && has(a.token) && d.assets.some((x) => x.id === a.assetId));
    if (al) next.assetId = al.assetId ?? null;
  }
  const asset = d.assets.find((x) => x.id === next.assetId);
  if (asset && !next.slot) {
    const slots = templateSlots(d, asset);
    const al = d.aliases.find((a) => a.kind === 'slot' && has(a.token) && slots.some((s) => s.item === a.slot));
    if (al) next.slot = al.slot ?? null;
  }
  if (next.slot && !next.unit) {
    const al = d.aliases.find((a) => a.kind === 'slot' && has(a.token) && a.slot === next.slot && a.unit && unitActive(d, a.unit));
    if (al) next.unit = al.unit ?? '';
  }
  if (asset && next.slot && !next.name) next.name = `${asset.name} ${next.slot}`;
  return next;
}

function fillAliases(d: Data, only?: Set<string>): { data: Data; changed: number } {
  let changed = 0;
  const tags = d.tags.map((t) => {
    if (only && !only.has(t.raw)) return t;
    const n = fillOne(d, t);
    if (n.assetId !== t.assetId || n.slot !== t.slot || n.unit !== t.unit || n.name !== t.name) changed += 1;
    return n;
  });
  return { data: { ...d, tags }, changed };
}

export function applyAliases(d: Data): Result {
  const r = fillAliases(d);
  if (r.changed === 0) return { data: d, error: null, note: '사전으로 채울 빈 칸이 없습니다.' };
  return done(r.data, `약어 사전 적용: ${r.changed}개 태그`, `${r.changed}개 태그의 빈 칸을 채웠습니다. 입력된 값은 그대로 두었습니다.`);
}

/** 태그 가져오기: 중복 태그는 건너뛰고, 새 태그는 약어 사전으로 빈 칸을 채운다 */
export function importTags(d: Data, rows: TagRow[]): Result {
  const known = new Set(d.tags.map((t) => t.raw));
  const added: SourceTag[] = [];
  const skipped: string[] = [];
  for (const r of rows) {
    if (!r.raw || known.has(r.raw)) {
      skipped.push(r.raw || '(빈 태그)');
      continue;
    }
    known.add(r.raw);
    const asset = r.assetCode ? d.assets.find((a) => a.code === r.assetCode) : undefined;
    const slotOk = asset && r.slot && templateSlots(d, asset).some((s) => s.item === r.slot);
    added.push({
      raw: r.raw,
      device: r.device || '-',
      ptId: '',
      name: r.name,
      unit: r.unit && unitActive(d, r.unit) ? r.unit : '',
      status: '제안',
      assetId: asset ? asset.id : null,
      slot: slotOk ? r.slot : null,
      value: null,
    });
  }
  if (added.length === 0) return fail(d, rows.length === 0 ? '가져올 행이 없습니다.' : `새로 추가할 태그가 없습니다. (중복 또는 빈 값: ${skipped.join(', ')})`);
  const merged = fillAliases({ ...d, tags: [...d.tags, ...added] }, new Set(added.map((t) => t.raw)));
  const extra = skipped.length ? ` 건너뜀 ${skipped.length}개(중복/빈 값): ${skipped.slice(0, 5).join(', ')}${skipped.length > 5 ? ' …' : ''}` : '';
  return done(merged.data, `태그 ${added.length}개 가져오기`, `${added.length}개를 추가했습니다. 약어 사전으로 ${merged.changed}개의 빈 칸을 채웠습니다.${extra}`);
}

/* ---------- 설비 ---------- */

const ASSET_CODE = /^[A-Za-z0-9가-힣_-]{1,20}$/;

function checkAsset(d: Data, code: string, name: string, type: string, energy: string, selfId?: string): string | null {
  if (!ASSET_CODE.test(code)) return '설비 코드는 한글·영문·숫자·밑줄·하이픈 1~20자로 입력하세요.';
  if (d.assets.some((a) => a.id !== selfId && a.code === code)) return '이미 있는 설비 코드입니다.';
  if (!name.trim()) return '설비 이름을 입력하세요.';
  if (!d.codes.some((c) => c.group === 'asset' && c.code === type && c.active)) return '사용할 수 있는 설비 유형이 아닙니다.';
  if (!d.codes.some((c) => c.group === 'energy' && c.code === energy && c.active)) return '사용할 수 있는 에너지원이 아닙니다.';
  return null;
}

export function addAsset(d: Data, code: string, name: string, type: string, energy: string): Result {
  const err = checkAsset(d, code, name, type, energy);
  if (err) return fail(d, err);
  const id = `a${d.counters.as}`;
  return done(
    { ...d, assets: [...d.assets, { id, code, name: name.trim(), type, energy }], counters: { ...d.counters, as: d.counters.as + 1 } },
    `설비 추가: ${code}`,
  );
}

/** 코드·이름은 언제든 바꿀 수 있다(태그와 배치는 내부 ID로 연결). 매핑된 태그가 있으면 유형은 바꿀 수 없다 */
export function updateAsset(d: Data, id: string, code: string, name: string, type: string, energy: string): Result {
  const a = d.assets.find((x) => x.id === id);
  if (!a) return fail(d, '설비를 찾을 수 없습니다.');
  const err = checkAsset(d, code, name, type, energy, id);
  if (err) return fail(d, err);
  if (type !== a.type && d.tags.some((t) => t.assetId === id && t.slot)) {
    return fail(d, '항목에 매핑된 태그가 있어 설비 유형을 바꿀 수 없습니다. 태그의 항목 지정을 먼저 해제하세요.');
  }
  return done({ ...d, assets: d.assets.map((x) => (x.id === id ? { ...x, code, name: name.trim(), type, energy } : x)) }, `설비 수정: ${a.code}${a.code !== code ? ` → ${code}` : ''}`);
}

export function deleteAsset(d: Data, id: string): Result {
  const a = d.assets.find((x) => x.id === id);
  if (!a) return fail(d, '설비를 찾을 수 없습니다.');
  const nt = d.tags.filter((t) => t.assetId === id).length;
  if (nt > 0) return fail(d, `태그 ${nt}개가 이 설비로 지정되어 있어 삭제할 수 없습니다. 태그의 설비 지정을 먼저 바꾸세요.`);
  const np = d.placements.filter((p) => p.assetId === id).length;
  if (np > 0) return fail(d, `트리에 ${np}곳 배치되어 있어 삭제할 수 없습니다. 먼저 배치를 해제하세요.`);
  return done({ ...d, assets: d.assets.filter((x) => x.id !== id), aliases: d.aliases.filter((x) => x.assetId !== id) }, `설비 삭제: ${a.code}`);
}

/* ---------- 설비 유형 템플릿 ---------- */

export function addSlot(d: Data, type: string, item: string, req: boolean, kind: string): Result {
  if (!d.codes.some((c) => c.group === 'asset' && c.code === type)) return fail(d, '설비 유형을 찾을 수 없습니다.');
  if (!item.trim()) return fail(d, '항목 이름을 입력하세요.');
  if (!d.codes.some((c) => c.group === 'kind' && c.code === kind)) return fail(d, '계측 성격을 선택하세요.');
  if (slotsOfType(d, type).some((s) => s.item === item.trim())) return fail(d, '이미 있는 항목입니다.');
  const slot = { item: item.trim(), req, kind };
  const has = d.templates.some((t) => t.type === type);
  const templates = has ? d.templates.map((t) => (t.type === type ? { ...t, slots: [...t.slots, slot] } : t)) : [...d.templates, { type, slots: [slot] }];
  return done({ ...d, templates }, `템플릿 항목 추가: ${type} · ${slot.item}`);
}

export function removeSlot(d: Data, type: string, item: string): Result {
  const codes = new Set(d.assets.filter((a) => a.type === type).map((a) => a.id));
  const n = d.tags.filter((t) => t.assetId && codes.has(t.assetId) && t.slot === item).length;
  if (n > 0) return fail(d, `이 항목에 지정된 태그가 ${n}개 있어 삭제할 수 없습니다. 태그의 항목 지정을 먼저 바꾸세요.`);
  return done({ ...d, templates: d.templates.map((t) => (t.type === type ? { ...t, slots: t.slots.filter((s) => s.item !== item) } : t)) }, `템플릿 항목 삭제: ${type} · ${item}`);
}

export function toggleSlotReq(d: Data, type: string, item: string): Result {
  return done(
    { ...d, templates: d.templates.map((t) => (t.type === type ? { ...t, slots: t.slots.map((s) => (s.item === item ? { ...s, req: !s.req } : s)) } : t)) },
    `필수 여부 변경: ${type} · ${item}`,
  );
}

/* ---------- 약어 사전 ---------- */

const TOKEN = /^[A-Za-z0-9가-힣]{1,20}$/;

export function addAlias(d: Data, kind: 'asset' | 'slot', token: string, target: { assetId?: string; slot?: string; unit?: string }): Result {
  if (!TOKEN.test(token)) return fail(d, '약어는 한글·영문·숫자 1~20자로 입력하세요. (밑줄은 태그 이름을 나누는 구분자라 쓸 수 없습니다)');
  if (d.aliases.some((a) => a.kind === kind && a.token.toLowerCase() === token.toLowerCase())) return fail(d, '이미 등록된 약어입니다.');
  if (kind === 'asset' && !d.assets.some((a) => a.id === target.assetId)) return fail(d, '설비를 선택하세요.');
  if (kind === 'slot') {
    if (!target.slot || !d.templates.some((t) => t.slots.some((s) => s.item === target.slot))) return fail(d, '항목을 선택하세요.');
    if (target.unit && !unitActive(d, target.unit)) return fail(d, '사용할 수 없는 단위입니다.');
  }
  const alias = { id: `al-${d.counters.al}`, token, kind, ...target };
  return done({ ...d, aliases: [...d.aliases, alias], counters: { ...d.counters, al: d.counters.al + 1 } }, `약어 추가: ${token}`);
}

export function removeAlias(d: Data, id: string): Result {
  const a = d.aliases.find((x) => x.id === id);
  if (!a) return fail(d, '약어를 찾을 수 없습니다.');
  return done({ ...d, aliases: d.aliases.filter((x) => x.id !== id) }, `약어 삭제: ${a.token}`);
}

/* ---------- 계통 트리 설계 ---------- */

const NODE_PATTERN = /^[A-Za-z0-9가-힣_]{1,20}$/;

function checkNode(d: Data, view: string, parent: string | null, code: string, label: string, type: string, selfId?: string): string | null {
  if (!label.trim()) return '노드 이름을 입력하세요.';
  if (!NODE_PATTERN.test(code)) return '노드 코드는 한글·영문·숫자·밑줄 1~20자로 입력하세요.';
  if (!d.codes.some((c) => c.group === 'node' && c.code === type && c.active)) return '사용할 수 있는 노드 유형이 아닙니다.';
  if (parent && nodeById(d, parent)?.view !== view) return '상위 노드는 같은 뷰에 있어야 합니다.';
  if (d.nodes.some((n) => n.id !== selfId && n.view === view && n.parent === parent && n.code === code)) {
    return '같은 상위 노드 아래에 같은 코드가 이미 있습니다.';
  }
  return null;
}

export function addNode(d: Data, view: string, parent: string | null, code: string, label: string, type: string): Result {
  const err = checkNode(d, view, parent, code, label, type);
  if (err) return fail(d, err);
  const id = `nd-${d.counters.nd}`;
  const next: Data = {
    ...d,
    nodes: [...d.nodes, { id, view, code, label: label.trim(), parent, type }],
    counters: { ...d.counters, nd: d.counters.nd + 1 },
  };
  return done(next, `노드 추가: ${pathCode(next, id)}`);
}

export function updateNode(d: Data, id: string, parent: string | null, code: string, label: string, type: string): Result {
  const n = nodeById(d, id);
  if (!n) return fail(d, '노드를 찾을 수 없습니다.');
  if (parent === id || (parent && subtreeIds(d, id).includes(parent))) return fail(d, '자기 자신이나 하위 노드 아래로는 옮길 수 없습니다.');
  const err = checkNode(d, n.view, parent, code, label, type, id);
  if (err) return fail(d, err);
  const before = pathCode(d, id);
  const next: Data = { ...d, nodes: d.nodes.map((x) => (x.id === id ? { ...x, parent, code, label: label.trim(), type } : x)) };
  const after = pathCode(next, id);
  return done(next, before === after ? `노드 수정: ${after}` : `노드 변경: ${before} → ${after}`);
}

export function deleteNode(d: Data, id: string): Result {
  const n = nodeById(d, id);
  if (!n) return fail(d, '노드를 찾을 수 없습니다.');
  if (d.nodes.some((x) => x.parent === id)) return fail(d, '하위 노드가 있어 삭제할 수 없습니다. 하위 노드를 먼저 정리하세요.');
  const cnt = d.placements.filter((p) => p.nodeId === id).length;
  if (cnt > 0) return fail(d, `설비 ${cnt}개가 배치된 노드는 삭제할 수 없습니다. 먼저 트리 매핑에서 배치를 해제하세요.`);
  return done({ ...d, nodes: d.nodes.filter((x) => x.id !== id) }, `노드 삭제: ${pathCode(d, id)}`);
}

/* ---------- 트리 매핑 ---------- */

/** 설비 배치는 바로 반영. 같은 뷰에 여러 곳이면 배분율을 균등하게 나눈다 */
export function placeAsset(d: Data, assetId: string, nodeId: string): Result {
  const a = d.assets.find((x) => x.id === assetId);
  const n = nodeById(d, nodeId);
  if (!a || !n) return fail(d, '설비 또는 노드를 찾을 수 없습니다.');
  if (d.placements.some((p) => p.assetId === assetId && p.nodeId === nodeId)) return fail(d, '이미 이 노드에 배치되어 있습니다.');
  const plId = `pl-${d.counters.pl}`;
  const added = { id: plId, assetId, nodeId, share: 100, from: EFFECTIVE_DATE };
  let placements = [...d.placements, added];
  const same = placements.filter((p) => p.assetId === assetId && nodeById(d, p.nodeId)?.view === n.view);
  let note: string | undefined;
  if (same.length > 1) {
    const base = Math.floor(100 / same.length);
    const rest = 100 - base * same.length;
    const shares = new Map(same.map((p, i) => [p.id, base + (i === 0 ? rest : 0)]));
    placements = placements.map((p) => (shares.has(p.id) ? { ...p, share: shares.get(p.id)! } : p));
    note = `같은 뷰에 ${same.length}곳이 되어 배분율을 균등하게 나눴습니다. 필요하면 조정하세요.`;
  }
  return done({ ...d, placements, counters: { ...d.counters, pl: d.counters.pl + 1 } }, `설비 배치: ${a.code} → ${pathCode(d, nodeId)}`, note);
}

export function removePlacement(d: Data, placementId: string): Result {
  const p = d.placements.find((x) => x.id === placementId);
  if (!p) return fail(d, '배치를 찾을 수 없습니다.');
  const a = d.assets.find((x) => x.id === p.assetId);
  return done({ ...d, placements: d.placements.filter((x) => x.id !== placementId) }, `배치 해제: ${a?.code ?? p.assetId} ✕ ${pathCode(d, p.nodeId)}`);
}

export function setShare(d: Data, placementId: string, share: number): Result {
  if (!Number.isInteger(share) || share < 1 || share > 100) return fail(d, '배분율은 1~100 사이의 정수여야 합니다.');
  return done({ ...d, placements: d.placements.map((p) => (p.id === placementId ? { ...p, share } : p)) }, `배분율 변경: ${placementId} → ${share}%`);
}

/* ---------- 코드·설정 ---------- */

export function addCode(d: Data, group: string, code: string, label: string): Result {
  const g = d.codeGroups.find((x) => x.key === group);
  if (!g) return fail(d, '코드 그룹을 찾을 수 없습니다.');
  if (!g.extendable) return fail(d, `${g.label}은(는) 고정 그룹이라 코드를 추가할 수 없습니다.`);
  if (!code.startsWith('LOC_')) return fail(d, '사이트 고유 코드는 LOC_ 로 시작해야 합니다 (표준 코드와 구분).');
  if (!new RegExp(g.pattern).test(code)) return fail(d, `형식 오류 — ${g.rule}`);
  if (d.codes.some((c) => c.group === group && c.code === code)) return fail(d, '이미 있는 코드입니다.');
  if (!label.trim()) return fail(d, '코드 이름을 입력하세요.');
  return done({ ...d, codes: [...d.codes, { group, code, label: label.trim(), scope: '로컬', active: true, from: EFFECTIVE_DATE }] }, `코드 추가: ${g.label} · ${code}`);
}

export function toggleCode(d: Data, group: string, code: string): Result {
  const c = d.codes.find((x) => x.group === group && x.code === code);
  if (!c) return fail(d, '코드를 찾을 수 없습니다.');
  return done({ ...d, codes: d.codes.map((x) => (x === c ? { ...x, active: !x.active } : x)) }, `코드 ${c.active ? '사용 중지' : '재사용'}: ${code}`);
}

export function setTolerance(d: Data, pct: number): Result {
  if (!(pct >= 0 && pct <= 50)) return fail(d, '허용 오차는 0~50% 사이로 지정하세요.');
  return done({ ...d, settings: { ...d.settings, sumTolerancePct: pct } }, `합산 허용 오차 변경: ${pct}%`);
}
