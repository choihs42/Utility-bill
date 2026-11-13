import type { CodeItem, Data, SourceTag, TreeNode } from './types';
import type { TagRow } from './csv';
import { EFFECTIVE_DATE } from './seed';
import { assetOf, nodeById, nodeCode, paramOf, pathCode, subtreeIds } from './derive';

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
const activeParam = (d: Data, code: string) => {
  const p = paramOf(d, code);
  return p && p.active ? p : undefined;
};

/* ---------- 코드 ---------- */

export interface CodeExtra {
  abbr?: string;
  desc?: string;
  unit?: string;
  multi?: boolean;
  sum?: boolean;
}

export function addCode(d: Data, group: string, code: string, label: string, extra: CodeExtra = {}): Result {
  const g = d.codeGroups.find((x) => x.key === group);
  if (!g) return fail(d, '코드 그룹을 찾을 수 없습니다.');
  if (g.prefix && !code.startsWith(g.prefix)) return fail(d, `사이트 고유 코드는 ${g.prefix} 로 시작해야 합니다 (표준 코드와 구분).`);
  if (!new RegExp(g.pattern).test(code)) return fail(d, `형식 오류 — ${g.rule}`);
  if (d.codes.some((c) => c.group === group && c.code === code)) return fail(d, '이미 있는 코드입니다.');
  if (!label.trim()) return fail(d, '코드명을 입력하세요.');
  const item: CodeItem = { group, code, label: label.trim(), abbr: (extra.abbr ?? '').trim(), desc: (extra.desc ?? '').trim(), scope: '로컬', active: true, from: EFFECTIVE_DATE };
  if (group === 'param') {
    if (extra.unit && !unitActive(d, extra.unit)) return fail(d, '사용할 수 없는 단위입니다.');
    item.unit = extra.unit ?? '';
    item.multi = Boolean(extra.multi);
    item.sum = Boolean(extra.sum);
  }
  return done({ ...d, codes: [...d.codes, item] }, `코드 추가: ${g.label} · ${code}`);
}

export function updateCode(d: Data, group: string, code: string, patch: CodeExtra & { label?: string }): Result {
  const c = d.codes.find((x) => x.group === group && x.code === code);
  if (!c) return fail(d, '코드를 찾을 수 없습니다.');
  if (patch.label !== undefined && !patch.label.trim()) return fail(d, '코드명은 비울 수 없습니다.');
  if (patch.unit && !unitActive(d, patch.unit)) return fail(d, '사용할 수 없는 단위입니다.');
  const next = {
    ...c,
    ...(patch.label !== undefined ? { label: patch.label.trim() } : {}),
    ...(patch.abbr !== undefined ? { abbr: patch.abbr.trim() } : {}),
    ...(patch.desc !== undefined ? { desc: patch.desc.trim() } : {}),
    ...(group === 'param' && patch.unit !== undefined ? { unit: patch.unit } : {}),
    ...(group === 'param' && patch.multi !== undefined ? { multi: patch.multi } : {}),
    ...(group === 'param' && patch.sum !== undefined ? { sum: patch.sum } : {}),
  };
  return done({ ...d, codes: d.codes.map((x) => (x === c ? next : x)) }, `코드 수정: ${code}`);
}

export function toggleCode(d: Data, group: string, code: string): Result {
  const c = d.codes.find((x) => x.group === group && x.code === code);
  if (!c) return fail(d, '코드를 찾을 수 없습니다.');
  return done({ ...d, codes: d.codes.map((x) => (x === c ? { ...x, active: !x.active } : x)) }, `코드 ${c.active ? '사용 중지' : '재사용'}: ${code}`);
}

/* ---------- 수집 태그 ---------- */

export interface TagPatch {
  param?: string | null;
  unit?: string;
}

function dupMessage(d: Data, raw: string, assetId: string, param: string | null): string | null {
  const p = paramOf(d, param);
  if (!p || p.multi) return null;
  const other = d.tags.find((t) => t.raw !== raw && !t.hold && t.assetId === assetId && t.param === param);
  if (!other) return null;
  return `${raw}: ${assetOf(d, assetId)?.code} 설비에는 이미 ${other.raw}가 ${p.label}(으)로 연결되어 있습니다.`;
}

type Patched = { tag: SourceTag } | { error: string };

/** 파라미터를 바꾸면 비어 있거나 이전 기본값이던 단위를 새 기본 단위로 맞춘다 */
function patchTag(d: Data, t: SourceTag, patch: TagPatch): Patched {
  const next = { ...t };
  if (patch.param !== undefined) {
    if (patch.param !== null && !activeParam(d, patch.param)) return { error: `사용할 수 없는 파라미터입니다: ${patch.param}` };
    const oldDefault = paramOf(d, t.param)?.unit ?? '';
    next.param = patch.param;
    if (patch.unit === undefined && (!next.unit || next.unit === oldDefault)) next.unit = paramOf(d, patch.param)?.unit ?? '';
  }
  if (patch.unit !== undefined) {
    if (patch.unit !== '' && !unitActive(d, patch.unit)) return { error: `사용할 수 없는 단위 코드입니다: ${patch.unit}` };
    next.unit = patch.unit;
  }
  if (next.assetId) {
    if (!next.param || !next.unit) return { error: `${t.raw}: 설비에 연결된 태그는 파라미터와 단위를 비울 수 없습니다. 먼저 연결을 해제하세요.` };
    if (next.param !== t.param) {
      const m = dupMessage(d, t.raw, next.assetId, next.param);
      if (m) return { error: m };
    }
  }
  return { tag: next };
}

export function updateTag(d: Data, raw: string, patch: TagPatch): Result {
  const t = d.tags.find((x) => x.raw === raw);
  if (!t) return fail(d, '태그를 찾을 수 없습니다.');
  const r = patchTag(d, t, patch);
  if ('error' in r) return fail(d, r.error);
  return done({ ...d, tags: d.tags.map((x) => (x.raw === raw ? r.tag : x)) }, `태그 수정: ${raw}`);
}

/** 선택한 여러 태그에 같은 파라미터/단위를 한 번에 지정 (하나라도 오류면 전체 취소) */
export function bulkUpdateTags(d: Data, raws: string[], patch: TagPatch): Result {
  if (raws.length === 0) return fail(d, '선택한 태그가 없습니다.');
  const set = new Set(raws);
  const tags: SourceTag[] = [];
  for (const t of d.tags) {
    if (!set.has(t.raw)) {
      tags.push(t);
      continue;
    }
    const r = patchTag(d, t, patch);
    if ('error' in r) return fail(d, r.error);
    tags.push(r.tag);
  }
  return done({ ...d, tags }, `태그 ${raws.length}개 일괄 수정`, `${raws.length}개를 수정했습니다.`);
}

function nextPtId(d: Data): string {
  const max = d.tags.reduce((m, t) => Math.max(m, Number(/(\d+)$/.exec(t.ptId)?.[1]) || 0), 0);
  return `${d.settings.ptPrefix}${String(max + 1).padStart(d.settings.ptDigits, '0')}`;
}

/** 설비 연결(또는 해제) 검증 + 적용(이력 없음) */
function linkInner(d: Data, raw: string, assetId: string | null): { data: Data } | { error: string } {
  const t = d.tags.find((x) => x.raw === raw);
  if (!t) return { error: '태그를 찾을 수 없습니다.' };
  if (assetId === null) return { data: { ...d, tags: d.tags.map((x) => (x.raw === raw ? { ...x, assetId: null } : x)) } };
  if (t.hold) return { error: `${raw}: 보류된 태그는 연결할 수 없습니다. 먼저 보류를 해제하세요.` };
  if (!t.param || !t.unit) return { error: `${raw}: 파라미터와 단위를 먼저 지정하세요.` };
  if (!assetOf(d, assetId)) return { error: '없는 설비입니다.' };
  const m = dupMessage(d, raw, assetId, t.param);
  if (m) return { error: m };
  const ptId = t.ptId || nextPtId(d);
  return { data: { ...d, tags: d.tags.map((x) => (x.raw === raw ? { ...x, assetId, ptId } : x)) } };
}

export function linkTag(d: Data, raw: string, assetId: string | null): Result {
  const r = linkInner(d, raw, assetId);
  if ('error' in r) return fail(d, r.error);
  const a = assetOf(d, assetId);
  return done(r.data, a ? `포인트 연결: ${raw} → ${a.code}` : `포인트 연결 해제: ${raw}`);
}

/** 선택한 태그를 한 설비에 연결(null이면 해제). 하나라도 오류면 전체 취소 */
export function bulkLinkTags(d: Data, raws: string[], assetId: string | null): Result {
  if (raws.length === 0) return fail(d, '선택한 태그가 없습니다.');
  let cur = d;
  for (const raw of raws) {
    const r = linkInner(cur, raw, assetId);
    if ('error' in r) return fail(d, r.error);
    cur = r.data;
  }
  return done(cur, `포인트 ${raws.length}개 ${assetId ? `연결 → ${assetOf(d, assetId)?.code}` : '연결 해제'}`);
}

/** 보류: 사용하지 않는 태그. 설비 연결도 함께 풀린다 */
export function setHold(d: Data, raws: string[], hold: boolean): Result {
  if (raws.length === 0) return fail(d, '선택한 태그가 없습니다.');
  const set = new Set(raws);
  const tags = d.tags.map((t) => (set.has(t.raw) ? { ...t, hold, assetId: hold ? null : t.assetId } : t));
  return done({ ...d, tags }, `태그 ${raws.length}개 ${hold ? '보류' : '보류 해제'}`);
}

/** 태그 가져오기: 중복 태그는 건너뛴다. 파라미터는 코드·코드명·약자 중 하나로 적을 수 있다 */
export function importTags(d: Data, rows: TagRow[]): Result {
  const known = new Set(d.tags.map((t) => t.raw));
  const added: SourceTag[] = [];
  const skipped: string[] = [];
  const unknownParam: string[] = [];
  for (const r of rows) {
    if (!r.raw || known.has(r.raw)) {
      skipped.push(r.raw || '(빈 태그)');
      continue;
    }
    known.add(r.raw);
    const key = r.param.toLowerCase();
    const p = key ? d.codes.find((c) => c.group === 'param' && c.active && [c.code, c.label, c.abbr].some((v) => v && v.toLowerCase() === key)) : undefined;
    if (r.param && !p) unknownParam.push(r.param);
    const unit = r.unit && unitActive(d, r.unit) ? r.unit : p?.unit ?? '';
    added.push({ raw: r.raw, device: r.device || '-', ptId: '', param: p ? p.code : null, unit, assetId: null, hold: false, value: null });
  }
  if (added.length === 0) return fail(d, rows.length === 0 ? '가져올 행이 없습니다.' : `새로 추가할 태그가 없습니다. (중복 또는 빈 값: ${skipped.join(', ')})`);
  const extra = [
    skipped.length ? `건너뜀 ${skipped.length}개(중복/빈 값)` : '',
    unknownParam.length ? `알 수 없는 파라미터 ${[...new Set(unknownParam)].join(', ')}` : '',
  ].filter(Boolean).join(' · ');
  return done({ ...d, tags: [...d.tags, ...added] }, `태그 ${added.length}개 가져오기`, `${added.length}개를 추가했습니다.${extra ? ` ${extra}` : ''}`);
}

/* ---------- 설비 ---------- */

const ASSET_CODE = /^[A-Za-z0-9가-힣_-]{1,20}$/;

export interface AssetFields {
  code: string;
  name: string;
  type: string;
  energy: string;
}

function checkAsset(d: Data, f: AssetFields, selfId?: string): string | null {
  if (!ASSET_CODE.test(f.code)) return '설비 코드는 한글·영문·숫자·밑줄·하이픈 1~20자로 입력하세요.';
  if (d.assets.some((a) => a.id !== selfId && a.code === f.code)) return '이미 있는 설비 코드입니다.';
  if (!f.name.trim()) return '설비 이름을 입력하세요.';
  if (!d.codes.some((c) => c.group === 'asset' && c.code === f.type && c.active)) return '사용할 수 있는 설비 유형이 아닙니다.';
  if (!d.codes.some((c) => c.group === 'energy' && c.code === f.energy && c.active)) return '사용할 수 있는 에너지원이 아닙니다.';
  return null;
}

export function addAsset(d: Data, f: AssetFields): Result {
  const err = checkAsset(d, f);
  if (err) return fail(d, err);
  const id = `a${d.counters.as}`;
  return done({ ...d, assets: [...d.assets, { id, ...f, name: f.name.trim() }], counters: { ...d.counters, as: d.counters.as + 1 } }, `설비 추가: ${f.code}`);
}

/** 코드·이름·유형·에너지원 수정. 태그와 트리는 내부 ID로 연결되어 있어 그대로 유지된다 */
export function updateAsset(d: Data, id: string, patch: Partial<AssetFields>): Result {
  const a = assetOf(d, id);
  if (!a) return fail(d, '설비를 찾을 수 없습니다.');
  const f = { ...a, ...patch };
  const err = checkAsset(d, f, id);
  if (err) return fail(d, err);
  return done({ ...d, assets: d.assets.map((x) => (x.id === id ? { ...x, ...patch, name: f.name.trim() } : x)) }, `설비 수정: ${a.code}${a.code !== f.code ? ` → ${f.code}` : ''}`);
}

export function deleteAsset(d: Data, id: string): Result {
  const a = assetOf(d, id);
  if (!a) return fail(d, '설비를 찾을 수 없습니다.');
  const nt = d.tags.filter((t) => t.assetId === id).length;
  if (nt > 0) return fail(d, `포인트 ${nt}개가 연결되어 있어 삭제할 수 없습니다. 먼저 연결을 해제하세요.`);
  const np = d.nodes.filter((n) => n.assetId === id).length;
  if (np > 0) return fail(d, `트리에 ${np}곳 놓여 있어 삭제할 수 없습니다. 먼저 트리에서 빼세요.`);
  return done({ ...d, assets: d.assets.filter((x) => x.id !== id) }, `설비 삭제: ${a.code}`);
}

/* ---------- 트리 ---------- */

const GROUP_CODE = /^[A-Za-z0-9가-힣_]{1,20}$/;

/** 이 부모(포함) 위쪽에 같은 설비 노드가 있는지: 설비가 자기 하위에 놓이는 것을 막는다 */
function hasAssetAbove(d: Data, parent: string | null, assetId: string): boolean {
  const seen = new Set<string>();
  let cur = parent ? nodeById(d, parent) : undefined;
  while (cur && !seen.has(cur.id)) {
    if (cur.assetId === assetId) return true;
    seen.add(cur.id);
    cur = cur.parent ? nodeById(d, cur.parent) : undefined;
  }
  return false;
}

function checkParent(d: Data, view: string, parent: string | null): string | null {
  if (parent && nodeById(d, parent)?.view !== view) return '상위 노드는 같은 트리에 있어야 합니다.';
  return null;
}

function siblingClash(d: Data, view: string, parent: string | null, code: string, selfId?: string): boolean {
  return d.nodes.some((n) => n.id !== selfId && n.view === view && n.parent === parent && nodeCode(d, n) === code);
}

/** 설비를 트리에 놓는다. 같은 트리에 여러 곳이 되면 배분율을 균등하게 나눈다 */
export function placeAsset(d: Data, view: string, assetId: string, parent: string | null): Result {
  const a = assetOf(d, assetId);
  if (!a) return fail(d, '설비를 선택하세요.');
  const e = checkParent(d, view, parent);
  if (e) return fail(d, e);
  if (hasAssetAbove(d, parent, assetId)) return fail(d, '설비를 자기 자신의 하위에 놓을 수 없습니다.');
  if (siblingClash(d, view, parent, a.code)) return fail(d, '같은 상위 아래에 같은 설비가 이미 있습니다.');
  const id = `nd-${d.counters.nd}`;
  let nodes: TreeNode[] = [...d.nodes, { id, view, parent, assetId, share: 100 }];
  const same = nodes.filter((n) => n.view === view && n.assetId === assetId);
  let note: string | undefined;
  if (same.length > 1) {
    const base = Math.floor(100 / same.length);
    const rest = 100 - base * same.length;
    const shares = new Map(same.map((n, i) => [n.id, base + (i === 0 ? rest : 0)]));
    nodes = nodes.map((n) => (shares.has(n.id) ? { ...n, share: shares.get(n.id)! } : n));
    note = `같은 트리에 ${same.length}곳이 되어 배분율을 균등하게 나눴습니다.`;
  }
  const next = { ...d, nodes, counters: { ...d.counters, nd: d.counters.nd + 1 } };
  return done(next, `트리 배치: ${pathCode(next, id)}`, note);
}

export function addGroup(d: Data, view: string, parent: string | null, code: string, label: string, type: string): Result {
  if (!d.views.find((v) => v.key === view)?.groups) return fail(d, '이 트리에는 그룹을 만들 수 없습니다. 설비만 놓을 수 있습니다.');
  const e = checkParent(d, view, parent);
  if (e) return fail(d, e);
  if (!GROUP_CODE.test(code)) return fail(d, '그룹 코드는 한글·영문·숫자·밑줄 1~20자로 입력하세요.');
  if (!label.trim()) return fail(d, '그룹 이름을 입력하세요.');
  if (!d.codes.some((c) => c.group === 'group' && c.code === type && c.active)) return fail(d, '사용할 수 있는 그룹 유형이 아닙니다.');
  if (siblingClash(d, view, parent, code)) return fail(d, '같은 상위 아래에 같은 코드가 이미 있습니다.');
  const id = `nd-${d.counters.nd}`;
  const next = { ...d, nodes: [...d.nodes, { id, view, parent, code, label: label.trim(), type, share: 100 }], counters: { ...d.counters, nd: d.counters.nd + 1 } };
  return done(next, `그룹 추가: ${pathCode(next, id)}`);
}

export interface NodePatch {
  parent?: string | null;
  code?: string;
  label?: string;
  type?: string;
}

/** 노드 이동(상위 변경)과 그룹 정보 수정. 경로 코드는 자동으로 다시 만들어진다 */
export function updateNode(d: Data, id: string, patch: NodePatch): Result {
  const n = nodeById(d, id);
  if (!n) return fail(d, '노드를 찾을 수 없습니다.');
  const parent = patch.parent !== undefined ? patch.parent : n.parent;
  if (parent === id || (parent && subtreeIds(d, id).includes(parent))) return fail(d, '자기 자신이나 하위 노드 아래로는 옮길 수 없습니다.');
  const e = checkParent(d, n.view, parent);
  if (e) return fail(d, e);
  const upd: TreeNode = { ...n, parent };
  if (n.assetId) {
    if (hasAssetAbove(d, parent, n.assetId)) return fail(d, '설비를 자기 자신의 하위에 놓을 수 없습니다.');
  } else {
    if (patch.code !== undefined) {
      if (!GROUP_CODE.test(patch.code)) return fail(d, '그룹 코드는 한글·영문·숫자·밑줄 1~20자로 입력하세요.');
      upd.code = patch.code;
    }
    if (patch.label !== undefined) {
      if (!patch.label.trim()) return fail(d, '그룹 이름은 비울 수 없습니다.');
      upd.label = patch.label.trim();
    }
    if (patch.type !== undefined) {
      if (!d.codes.some((c) => c.group === 'group' && c.code === patch.type && c.active)) return fail(d, '사용할 수 없는 그룹 유형입니다.');
      upd.type = patch.type;
    }
  }
  if (siblingClash(d, n.view, parent, nodeCode(d, upd), id)) return fail(d, '같은 상위 아래에 같은 코드가 이미 있습니다.');
  const before = pathCode(d, id);
  const next = { ...d, nodes: d.nodes.map((x) => (x.id === id ? upd : x)) };
  const after = pathCode(next, id);
  return done(next, before === after ? `노드 수정: ${after}` : `노드 변경: ${before} → ${after}`);
}

export function setShare(d: Data, id: string, share: number): Result {
  if (!Number.isInteger(share) || share < 1 || share > 100) return fail(d, '배분율은 1~100 사이의 정수여야 합니다.');
  const n = nodeById(d, id);
  if (!n?.assetId) return fail(d, '설비 노드에만 배분율을 지정할 수 있습니다.');
  return done({ ...d, nodes: d.nodes.map((x) => (x.id === id ? { ...x, share } : x)) }, `배분율 변경: ${pathCode(d, id)} → ${share}%`);
}

export function deleteNode(d: Data, id: string): Result {
  const n = nodeById(d, id);
  if (!n) return fail(d, '노드를 찾을 수 없습니다.');
  if (d.nodes.some((x) => x.parent === id)) return fail(d, '하위 노드가 있어 삭제할 수 없습니다. 하위 노드를 먼저 정리하세요.');
  return done({ ...d, nodes: d.nodes.filter((x) => x.id !== id) }, `노드 삭제: ${pathCode(d, id)}`);
}

/* ---------- 설정 ---------- */

export function setTolerance(d: Data, pct: number): Result {
  if (!(pct >= 0 && pct <= 50)) return fail(d, '허용 오차는 0~50% 사이로 지정하세요.');
  return done({ ...d, settings: { ...d.settings, sumTolerancePct: pct } }, `합산 허용 오차 변경: ${pct}%`);
}

export function setPtFormat(d: Data, prefix: string, digits: number): Result {
  const p = prefix.trim();
  if (!/^[A-Za-z0-9_-]{0,8}$/.test(p)) return fail(d, '포인트 ID 접두사는 영문·숫자·-·_ 8자 이하로 입력하세요.');
  if (!Number.isInteger(digits) || digits < 3 || digits > 10) return fail(d, '자릿수는 3~10 사이로 지정하세요.');
  return done({ ...d, settings: { ...d.settings, ptPrefix: p, ptDigits: digits } }, `포인트 ID 형식 변경: ${p}${'0'.repeat(digits)}`, '이미 부여된 포인트 ID는 바뀌지 않고, 새로 부여하는 ID부터 적용됩니다.');
}

/* ---------- 코드 테이블 / 트리 옵션 ---------- */

export function updateCodeGroup(d: Data, key: string, patch: { label?: string; prefix?: string; pattern?: string; rule?: string }): Result {
  const g = d.codeGroups.find((x) => x.key === key);
  if (!g) return fail(d, '코드 테이블을 찾을 수 없습니다.');
  if (patch.label !== undefined && !patch.label.trim()) return fail(d, '테이블명은 비울 수 없습니다.');
  if (patch.prefix !== undefined && !/^[A-Z0-9_]{0,8}$/.test(patch.prefix.trim())) return fail(d, '접두사는 영문 대문자·숫자·밑줄 8자 이하로 입력하세요.');
  if (patch.pattern !== undefined) {
    try { new RegExp(patch.pattern); } catch { return fail(d, '형식(정규식)이 올바르지 않습니다.'); }
  }
  const next = {
    ...g,
    ...(patch.label !== undefined ? { label: patch.label.trim() } : {}),
    ...(patch.prefix !== undefined ? { prefix: patch.prefix.trim() } : {}),
    ...(patch.pattern !== undefined ? { pattern: patch.pattern } : {}),
    ...(patch.rule !== undefined ? { rule: patch.rule } : {}),
  };
  return done({ ...d, codeGroups: d.codeGroups.map((x) => (x === g ? next : x)) }, `코드 테이블 수정: ${next.label}`, '이미 등록된 코드는 바뀌지 않고, 새로 추가하는 코드부터 적용됩니다.');
}

export function setViewOption(d: Data, view: string, patch: { requireCoverage?: boolean; sumCheck?: boolean }): Result {
  const v = d.views.find((x) => x.key === view);
  if (!v) return fail(d, '트리를 찾을 수 없습니다.');
  return done({ ...d, views: d.views.map((x) => (x === v ? { ...x, ...patch } : x)) }, `트리 옵션 변경: ${v.label}`);
}
