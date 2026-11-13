import type { Data } from './types';
import { EFFECTIVE_DATE } from './seed';
import { candidates, nodeById, pathCode, placementsIn, subtreeIds, templateSlots } from './derive';

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

/* ---------- 파라미터 ---------- */

export function setTagUnit(d: Data, raw: string, unit: string): Result {
  const code = d.codes.find((c) => c.group === 'unit' && c.code === unit);
  if (!code || !code.active) return fail(d, `사용할 수 없는 단위 코드입니다: ${unit}`);
  return done({ ...d, tags: d.tags.map((t) => (t.raw === raw ? { ...t, unit } : t)) }, `단위 지정: ${raw} → ${unit}`);
}

export function approveTag(d: Data, raw: string): Result {
  const t = d.tags.find((x) => x.raw === raw);
  if (!t) return fail(d, '태그를 찾을 수 없습니다.');
  if (!t.ptId || !t.assetCode) return fail(d, '자동으로 설비를 찾지 못한 태그입니다. 현장 확인 후 매핑하세요.');
  if (!t.unit) return fail(d, '단위가 없는 태그는 승인할 수 없습니다. 단위를 먼저 지정하세요.');
  return done({ ...d, tags: d.tags.map((x) => (x.raw === raw ? { ...x, status: '승인' } : x)) }, `포인트 승인: ${raw}`);
}

/** 신뢰도 80% 이상이고 단위가 있는 제안 태그를 한 번에 승인 */
export function approveAllReady(d: Data): Result {
  const ready = d.tags.filter((t) => t.status === '제안' && t.ptId && t.assetCode && t.unit && t.conf >= 80);
  if (ready.length === 0) return { data: d, error: null, note: '한 번에 승인할 수 있는 포인트가 없습니다.' };
  const set = new Set(ready.map((t) => t.raw));
  return done({ ...d, tags: d.tags.map((t) => (set.has(t.raw) ? { ...t, status: '승인' } : t)) }, `포인트 ${ready.length}개 일괄 승인`, `${ready.length}개를 승인했습니다. 단위가 없거나 신뢰도가 낮은 태그는 남겨두었습니다.`);
}

/** 보류: 승인 취소와 같다. 이 태그를 쓰던 연결도 함께 해제 */
export function holdTag(d: Data, raw: string): Result {
  if (!d.tags.some((t) => t.raw === raw)) return fail(d, '태그를 찾을 수 없습니다.');
  return done({ ...d, tags: d.tags.map((t) => (t.raw === raw ? { ...t, status: '보류' } : t)), links: d.links.filter((l) => l.raw !== raw) }, `포인트 보류: ${raw}`);
}

export function linkSlot(d: Data, assetId: string, slot: string, raw: string): Result {
  const a = d.assets.find((x) => x.id === assetId);
  if (!a) return fail(d, '설비를 찾을 수 없습니다.');
  if (!candidates(d, a, slot).some((t) => t.raw === raw)) return fail(d, '이 항목에 연결할 수 없는 포인트입니다.');
  const links = d.links.filter((l) => !(l.assetId === assetId && l.slot === slot));
  links.push({ assetId, slot, raw });
  return done({ ...d, links }, `연결: ${a.code} · ${slot} ← ${raw}`);
}

export function unlinkSlot(d: Data, assetId: string, slot: string): Result {
  const a = d.assets.find((x) => x.id === assetId);
  return done({ ...d, links: d.links.filter((l) => !(l.assetId === assetId && l.slot === slot)) }, `연결 해제: ${a?.code ?? assetId} · ${slot}`);
}

/** 후보가 하나뿐인 빈 항목을 모두 자동 연결 */
export function autoLinkAll(d: Data): Result {
  const links = [...d.links];
  let n = 0;
  for (const a of d.assets) {
    for (const s of templateSlots(d, a)) {
      const cur = links.find((l) => l.assetId === a.id && l.slot === s.item);
      const valid = cur && d.tags.some((t) => t.raw === cur.raw && t.status === '승인');
      if (valid) continue;
      const c = candidates(d, a, s.item);
      if (c.length === 1) {
        links.push({ assetId: a.id, slot: s.item, raw: c[0].raw });
        n += 1;
      }
    }
  }
  if (n === 0) return { data: d, error: null, note: '자동으로 연결할 항목이 없습니다. (후보가 하나뿐인 빈 항목만 연결합니다)' };
  return done({ ...d, links }, `설비 항목 ${n}개 자동 연결`, `${n}개 항목을 자동으로 연결했습니다.`);
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

/* ---------- 코드 ---------- */

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

export { placementsIn };
