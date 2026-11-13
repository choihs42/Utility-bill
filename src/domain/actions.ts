import type { Data } from './types';
import { EFFECTIVE_DATE } from './seed';
import { candidates, nodeById, pathCode, validate } from './derive';

// 상태 변경은 모두 순수 함수: (데이터, 인자) → { data, error }. 오류면 데이터는 그대로.
export interface Result {
  data: Data;
  error: string | null;
}

const fail = (data: Data, error: string): Result => ({ data, error });
const ok = (data: Data): Result => ({ data, error: null });

export function setTagUnit(d: Data, raw: string, unit: string): Result {
  const code = d.codes.find((c) => c.group === 'unit' && c.code === unit);
  if (!code || !code.active) return fail(d, `사용할 수 없는 단위 코드입니다: ${unit}`);
  return ok({ ...d, tags: d.tags.map((t) => (t.raw === raw ? { ...t, unit } : t)) });
}

export function approveTag(d: Data, raw: string): Result {
  const t = d.tags.find((x) => x.raw === raw);
  if (!t) return fail(d, '태그를 찾을 수 없습니다.');
  if (!t.ptId || !t.assetCode) return fail(d, '표준 포인트를 제안할 수 없는 태그입니다. 현장 확인 후 매핑하세요.');
  if (!t.unit) return fail(d, '단위가 없는 태그는 승인할 수 없습니다. 단위를 먼저 지정하세요.');
  return ok({ ...d, tags: d.tags.map((x) => (x.raw === raw ? { ...x, status: '승인' } : x)) });
}

/** 보류: 승인 취소와 같다. 이 태그를 쓰던 설비 슬롯 연결도 함께 해제 */
export function holdTag(d: Data, raw: string): Result {
  if (!d.tags.some((t) => t.raw === raw)) return fail(d, '태그를 찾을 수 없습니다.');
  return ok({
    ...d,
    tags: d.tags.map((t) => (t.raw === raw ? { ...t, status: '보류' } : t)),
    links: d.links.filter((l) => l.raw !== raw),
  });
}

export function linkSlot(d: Data, assetId: string, slot: string, raw: string): Result {
  const a = d.assets.find((x) => x.id === assetId);
  if (!a) return fail(d, '설비를 찾을 수 없습니다.');
  if (!candidates(d, a, slot).some((t) => t.raw === raw)) return fail(d, '이 슬롯에 연결할 수 없는 포인트입니다.');
  const links = d.links.filter((l) => !(l.assetId === assetId && l.slot === slot));
  links.push({ assetId, slot, raw });
  return ok({ ...d, links });
}

export function unlinkSlot(d: Data, assetId: string, slot: string): Result {
  return ok({ ...d, links: d.links.filter((l) => !(l.assetId === assetId && l.slot === slot)) });
}

/** 설비 배치: 바로 반영하지 않고 '대기' 배치 + 변경 요청을 만든다 */
export function placeAsset(d: Data, assetId: string, nodeId: string): Result {
  const a = d.assets.find((x) => x.id === assetId);
  const n = nodeById(d, nodeId);
  if (!a || !n) return fail(d, '설비 또는 노드를 찾을 수 없습니다.');
  if (d.placements.some((p) => p.assetId === assetId && p.nodeId === nodeId)) {
    return fail(d, '이미 이 노드에 배치되었거나 승인 대기 중입니다.');
  }
  const view = d.views.find((v) => v.key === n.view);
  const existing = d.placements.filter((p) => p.assetId === assetId && nodeById(d, p.nodeId)?.view === n.view && p.status === 'active');
  const plId = `pl-${d.counters.pl}`;
  const rqId = `rq-${d.counters.rq}`;
  return ok({
    ...d,
    placements: [...d.placements, { id: plId, assetId, nodeId, share: 100, from: EFFECTIVE_DATE, status: 'pending' }],
    requests: [
      ...d.requests,
      {
        id: rqId,
        title: `설비 배치: ${a.name}`,
        before: existing.length ? `${view?.label} ${existing.length}곳에 배치` : `${view?.label}에 미배치`,
        after: `${view?.label} · ${pathCode(d, nodeId)}`,
        by: '담당자 A',
        when: EFFECTIVE_DATE,
        status: '승인 대기',
        placementId: plId,
      },
    ],
    counters: { pl: d.counters.pl + 1, rq: d.counters.rq + 1 },
  });
}

export function setShare(d: Data, placementId: string, share: number): Result {
  if (!Number.isInteger(share) || share < 1 || share > 100) return fail(d, '배분율은 1~100 사이의 정수여야 합니다.');
  return ok({ ...d, placements: d.placements.map((p) => (p.id === placementId ? { ...p, share } : p)) });
}

/** 승인: 배치를 활성화한 상태로 검증해서, 해당 설비에 오류가 남으면 막는다 */
export function approveRequest(d: Data, requestId: string): Result {
  const rq = d.requests.find((r) => r.id === requestId);
  if (!rq || rq.status !== '승인 대기' || !rq.placementId) return fail(d, '승인할 수 있는 요청이 아닙니다.');
  const pl = d.placements.find((p) => p.id === rq.placementId);
  if (!pl) return fail(d, '요청에 연결된 배치를 찾을 수 없습니다.');
  const next: Data = {
    ...d,
    placements: d.placements.map((p) => (p.id === pl.id ? { ...p, status: 'active' } : p)),
    requests: d.requests.map((r) => (r.id === rq.id ? { ...r, status: '승인됨' } : r)),
  };
  const blocking = validate(next).filter((i) => i.severity === '오류' && i.assetId === pl.assetId);
  if (blocking.length > 0) {
    return fail(d, `승인할 수 없습니다 — 오류 ${blocking.length}건: ${blocking[0].title}${blocking.length > 1 ? ' 외' : ''}`);
  }
  return ok(next);
}

export function rejectRequest(d: Data, requestId: string): Result {
  const rq = d.requests.find((r) => r.id === requestId);
  if (!rq || rq.status !== '승인 대기') return fail(d, '반려할 수 있는 요청이 아닙니다.');
  return ok({
    ...d,
    placements: d.placements.filter((p) => p.id !== rq.placementId),
    requests: d.requests.map((r) => (r.id === rq.id ? { ...r, status: '반려됨' } : r)),
  });
}

export function addCode(d: Data, group: string, code: string, label: string): Result {
  const g = d.codeGroups.find((x) => x.key === group);
  if (!g) return fail(d, '코드 그룹을 찾을 수 없습니다.');
  if (!g.extendable) return fail(d, `${g.label}은(는) 고정 그룹이라 코드를 추가할 수 없습니다.`);
  if (!code.startsWith('LOC_')) return fail(d, '사이트 고유 코드는 LOC_ 로 시작해야 합니다 (표준 코드와 구분).');
  if (!new RegExp(g.pattern).test(code)) return fail(d, `형식 오류 — ${g.rule}`);
  if (d.codes.some((c) => c.group === group && c.code === code)) return fail(d, '이미 있는 코드입니다.');
  if (!label.trim()) return fail(d, '코드 이름을 입력하세요.');
  return ok({
    ...d,
    codes: [...d.codes, { group, code, label: label.trim(), scope: '로컬', active: true, from: EFFECTIVE_DATE }],
  });
}

export function toggleCode(d: Data, group: string, code: string): Result {
  if (!d.codes.some((c) => c.group === group && c.code === code)) return fail(d, '코드를 찾을 수 없습니다.');
  return ok({ ...d, codes: d.codes.map((c) => (c.group === group && c.code === code ? { ...c, active: !c.active } : c)) });
}
