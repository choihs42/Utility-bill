import type { Asset, Data, Issue, Placement, SourceTag, TreeNode } from './types';

// 저장하지 않고 항상 데이터에서 계산하는 값들(경로 코드, 충족도, 점검 결과).

export const SLOT_POWER = '순시 전력';

export function nodeById(d: Data, id: string): TreeNode | undefined {
  return d.nodes.find((n) => n.id === id);
}

/** 경로 코드: 루트부터 노드 코드를 '_'로 이어서 자동 생성 (TR1_LV1_MCC1, 압연공장_압연공정_압연기1) */
export function pathCode(d: Data, nodeId: string): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  let cur = nodeById(d, nodeId);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    parts.unshift(cur.code);
    const p: string | null = cur.parent;
    cur = p ? nodeById(d, p) : undefined;
  }
  return parts.join('_');
}

export function childrenOf(d: Data, nodeId: string | null, view: string): TreeNode[] {
  return d.nodes.filter((n) => n.view === view && n.parent === nodeId);
}

export function subtreeIds(d: Data, nodeId: string): string[] {
  const out: string[] = [];
  const walk = (id: string) => {
    for (const c of d.nodes.filter((n) => n.parent === id)) {
      out.push(c.id);
      walk(c.id);
    }
  };
  walk(nodeId);
  return out;
}

export function templateSlots(d: Data, a: Asset) {
  return d.templates.find((t) => t.type === a.type)?.slots ?? [];
}

export function slotsOfType(d: Data, type: string) {
  return d.templates.find((t) => t.type === type)?.slots ?? [];
}

/** 태그 한 줄의 입력이 모두 채워졌는지 (승인 가능 조건) */
export function isComplete(t: SourceTag): boolean {
  return Boolean(t.name && t.assetId && t.slot && t.unit);
}

/** 같은 설비 항목에 이미 승인된 다른 태그 */
export function slotOwner(d: Data, assetId: string, slot: string, exceptRaw?: string): SourceTag | undefined {
  return d.tags.find((t) => t.status === '승인' && t.assetId === assetId && t.slot === slot && t.raw !== exceptRaw);
}

export interface SlotState {
  item: string;
  req: boolean;
  kind: string;
  tag: SourceTag | null;
}

export interface Fulfillment {
  slots: SlotState[];
  requiredTotal: number;
  requiredMet: number;
  ok: boolean;
}

/** 승인된 태그가 설비 항목에 연결된 상태를 템플릿 기준으로 계산 */
export function fulfillment(d: Data, a: Asset): Fulfillment {
  const slots: SlotState[] = templateSlots(d, a).map((s) => ({
    item: s.item,
    req: s.req,
    kind: s.kind,
    tag: slotOwner(d, a.id, s.item) ?? null,
  }));
  const req = slots.filter((s) => s.req);
  const met = req.filter((s) => s.tag).length;
  return { slots, requiredTotal: req.length, requiredMet: met, ok: met === req.length };
}

/** 설비의 순시 전력 값(kW). 승인된 태그가 연결된 경우에만 값이 있다 */
export function assetPower(d: Data, assetId: string): number | null {
  const a = d.assets.find((x) => x.id === assetId);
  if (!a) return null;
  const s = fulfillment(d, a).slots.find((x) => x.item === SLOT_POWER);
  return s?.tag?.value ?? null;
}

export function placementsIn(d: Data, view?: string): Placement[] {
  if (!view) return d.placements;
  return d.placements.filter((p) => nodeById(d, p.nodeId)?.view === view);
}

export function codeUsage(d: Data, group: string, code: string): number {
  switch (group) {
    case 'energy':
      return d.assets.filter((a) => a.energy === code).length;
    case 'asset':
      return d.assets.filter((a) => a.type === code).length;
    case 'unit':
      return d.tags.filter((t) => t.unit === code).length;
    case 'kind':
      return d.templates.reduce((n, t) => n + t.slots.filter((s) => s.kind === code).length, 0);
    case 'node':
      return d.nodes.filter((n) => n.type === code).length;
    default:
      return 0;
  }
}

export function validate(d: Data): Issue[] {
  const out: Issue[] = [];

  // 1) 필수 항목 미연결
  for (const a of d.assets) {
    for (const s of fulfillment(d, a).slots) {
      if (s.req && !s.tag) {
        const n = d.tags.filter((t) => t.status === '제안' && t.assetId === a.id && t.slot === s.item).length;
        out.push({
          id: `slot:${a.id}:${s.item}`,
          severity: '오류',
          title: `필수 항목 미연결: ${a.code} · ${s.item}`,
          detail: n > 0 ? `이 항목으로 지정된 미승인 태그 ${n}개 — 승인하면 연결됩니다` : '이 항목으로 지정된 태그가 없습니다',
          href: '/params',
          linkText: '파라미터 관리로',
          assetId: a.id,
        });
      }
    }
  }

  // 2) 필수 항목에 지정된 태그의 단위 누락
  for (const t of d.tags) {
    if (t.status === '보류' || !t.assetId || t.unit) continue;
    const a = d.assets.find((x) => x.id === t.assetId);
    if (!a) continue;
    if (templateSlots(d, a).some((s) => s.item === t.slot && s.req)) {
      out.push({
        id: `unit:${t.raw}`,
        severity: '오류',
        title: `단위 누락: ${t.raw}`,
        detail: `${a.code} · ${t.slot} 항목에 지정되었으나 단위가 없습니다`,
        href: '/params',
        linkText: '파라미터 관리로',
        assetId: a.id,
      });
    }
  }

  // 3) 같은 항목에 승인된 태그가 둘 이상, 같은 설비 안의 포인트명 중복
  for (const a of d.assets) {
    const approved = d.tags.filter((t) => t.status === '승인' && t.assetId === a.id);
    const bySlot = new Map<string, number>();
    const byName = new Map<string, number>();
    for (const t of approved) {
      if (t.slot) bySlot.set(t.slot, (bySlot.get(t.slot) ?? 0) + 1);
      byName.set(t.name, (byName.get(t.name) ?? 0) + 1);
    }
    for (const [slot, n] of bySlot) {
      if (n > 1) out.push({ id: `dupslot:${a.id}:${slot}`, severity: '오류', title: `중복 연결: ${a.code} · ${slot}`, detail: `승인된 태그가 ${n}개입니다`, href: '/params', linkText: '파라미터 관리로', assetId: a.id });
    }
    for (const [name, n] of byName) {
      if (n > 1) out.push({ id: `dupname:${a.id}:${name}`, severity: '오류', title: `포인트명 중복: ${a.code} · ${name}`, detail: `같은 설비에 같은 이름이 ${n}개입니다`, href: '/params', linkText: '파라미터 관리로', assetId: a.id });
    }
  }

  // 4) 뷰별 배치 누락 (requireCoverage 뷰)
  for (const v of d.views.filter((x) => x.requireCoverage)) {
    const placed = new Set(placementsIn(d, v.key).map((p) => p.assetId));
    for (const a of d.assets) {
      if (!placed.has(a.id)) {
        out.push({
          id: `cov:${v.key}:${a.id}`,
          severity: '경고',
          title: `${v.label} 미배치: ${a.code}`,
          detail: `${v.label} 뷰에는 모든 설비를 배치해야 합니다`,
          href: '/map',
          linkText: '트리 매핑으로',
          assetId: a.id,
        });
      }
    }
  }

  // 5) 배분율 합계 (같은 뷰에서 같은 설비)
  for (const v of d.views) {
    for (const a of d.assets) {
      const pls = placementsIn(d, v.key).filter((p) => p.assetId === a.id);
      if (pls.length === 0) continue;
      const sum = pls.reduce((acc, p) => acc + p.share, 0);
      if (sum !== 100) {
        out.push({
          id: `share:${v.key}:${a.id}`,
          severity: '오류',
          title: `배분율 합계 ${sum}%: ${a.code} (${v.label})`,
          detail: '같은 뷰에서 여러 곳에 배치한 설비의 배분율 합은 100%여야 합니다',
          href: '/map',
          linkText: '트리 매핑으로',
          assetId: a.id,
        });
      }
    }
  }

  // 6) 전력계통 합산 정합성: 상위 노드 설비 값 vs 하위 설비 합
  const tol = d.settings.sumTolerancePct;
  const power = d.views.find((v) => v.key === 'power');
  if (power) {
    for (const p of placementsIn(d, power.key)) {
      const parentVal = assetPower(d, p.assetId);
      if (!parentVal) continue;
      const ids = new Set(subtreeIds(d, p.nodeId));
      let sum = 0;
      for (const q of placementsIn(d, power.key)) {
        if (!ids.has(q.nodeId)) continue;
        sum += (assetPower(d, q.assetId) ?? 0) * (q.share / 100);
      }
      if (sum <= 0) continue;
      const diff = (Math.abs(parentVal - sum) / parentVal) * 100;
      if (diff > tol) {
        const a = d.assets.find((x) => x.id === p.assetId);
        out.push({
          id: `sum:${p.id}`,
          severity: '경고',
          title: `합산 차이 ${diff.toFixed(1)}%: ${a?.code ?? p.assetId}`,
          detail: `상위 ${parentVal}kW 대비 하위 설비 합 ${sum}kW (허용 ${tol}%)`,
          href: '/map',
          linkText: '트리 매핑으로',
          assetId: p.assetId,
        });
      }
    }
  }

  // 7) 사용 중지된 코드를 아직 쓰는 경우
  for (const c of d.codes.filter((x) => !x.active)) {
    const n = codeUsage(d, c.group, c.code);
    if (n > 0) {
      out.push({
        id: `code:${c.group}:${c.code}`,
        severity: '경고',
        title: `사용 중지 코드 참조: ${c.code}`,
        detail: `${n}건이 아직 이 코드를 사용합니다`,
        href: '/codes',
        linkText: '기준 코드로',
      });
    }
  }

  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === '오류' ? -1 : 1));
}
