import type { Asset, Data, Issue, Placement, SourceTag, TreeNode } from './types';

// 저장하지 않고 항상 데이터에서 계산하는 값들(경로 코드, 충족도, 검증 결과).

export const SLOT_POWER = '순시 전력';
export const SUM_TOLERANCE_PCT = 2;

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

/** 해당 설비의 슬롯에 들어갈 수 있는 후보: 승인된 표준 포인트 중 설비·슬롯이 일치하는 것 */
export function candidates(d: Data, a: Asset, slot: string): SourceTag[] {
  return d.tags.filter((t) => t.status === '승인' && t.assetCode === a.code && t.slot === slot);
}

export interface SlotState {
  item: string;
  req: boolean;
  raw: string | null;
  tag: SourceTag | null;
}

export interface Fulfillment {
  slots: SlotState[];
  requiredTotal: number;
  requiredMet: number;
  ok: boolean;
}

export function fulfillment(d: Data, a: Asset): Fulfillment {
  const slots: SlotState[] = templateSlots(d, a).map((s) => {
    const link = d.links.find((l) => l.assetId === a.id && l.slot === s.item);
    const tag = link ? d.tags.find((t) => t.raw === link.raw && t.status === '승인') ?? null : null;
    return { item: s.item, req: s.req, raw: tag ? tag.raw : null, tag };
  });
  const req = slots.filter((s) => s.req);
  const met = req.filter((s) => s.tag).length;
  return { slots, requiredTotal: req.length, requiredMet: met, ok: met === req.length };
}

/** 설비의 순시 전력 값(kW). 연결·승인된 경우에만 값이 있다 */
export function assetPower(d: Data, assetId: string): number | null {
  const a = d.assets.find((x) => x.id === assetId);
  if (!a) return null;
  const s = fulfillment(d, a).slots.find((x) => x.item === SLOT_POWER);
  return s?.tag?.value ?? null;
}

export function activePlacements(d: Data, view?: string): Placement[] {
  return d.placements.filter((p) => {
    if (p.status !== 'active') return false;
    if (!view) return true;
    return nodeById(d, p.nodeId)?.view === view;
  });
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
      return d.tags.filter((t) => t.kind === code).length;
    case 'node':
      return d.nodes.filter((n) => n.type === code).length;
    default:
      return 0;
  }
}

export function validate(d: Data): Issue[] {
  const out: Issue[] = [];

  // 1) 필수 슬롯 미연결
  for (const a of d.assets) {
    for (const s of fulfillment(d, a).slots) {
      if (s.req && !s.tag) {
        const n = candidates(d, a, s.item).length;
        out.push({
          id: `slot:${a.id}:${s.item}`,
          severity: '오류',
          title: `필수 슬롯 미연결: ${a.code} · ${s.item}`,
          detail: n > 0 ? `연결 가능한 승인 포인트 ${n}개 — 설비 연결에서 선택` : '승인된 후보 없음 — 포인트 승인이 먼저 필요',
          href: '/assets',
          linkText: '설비 연결로',
          assetId: a.id,
        });
      }
    }
  }

  // 2) 필수 슬롯에 해당하는 태그의 단위 누락
  for (const t of d.tags) {
    if (t.status === '보류' || !t.assetCode || t.unit) continue;
    const a = d.assets.find((x) => x.code === t.assetCode);
    if (!a) continue;
    const isReq = templateSlots(d, a).some((s) => s.item === t.slot && s.req);
    if (isReq) {
      out.push({
        id: `unit:${t.raw}`,
        severity: '오류',
        title: `단위 누락: ${t.raw}`,
        detail: `${a.code} · ${t.slot} 슬롯에 해당하나 단위가 없어 승인할 수 없음`,
        href: '/points',
        linkText: '포인트 승인으로',
        assetId: a.id,
      });
    }
  }

  // 3) 뷰별 배치 누락 (requireCoverage 뷰)
  for (const v of d.views.filter((x) => x.requireCoverage)) {
    const placed = new Set(activePlacements(d, v.key).map((p) => p.assetId));
    for (const a of d.assets) {
      if (!placed.has(a.id)) {
        out.push({
          id: `cov:${v.key}:${a.id}`,
          severity: '경고',
          title: `${v.label} 미배치: ${a.code}`,
          detail: `${v.label}은(는) 모든 설비가 배치되어야 합니다`,
          href: '/',
          linkText: '설비 배치로',
          assetId: a.id,
        });
      }
    }
  }

  // 4) 배분율 합계 (같은 뷰에서 같은 설비)
  for (const v of d.views) {
    for (const a of d.assets) {
      const pls = activePlacements(d, v.key).filter((p) => p.assetId === a.id);
      if (pls.length === 0) continue;
      const sum = pls.reduce((acc, p) => acc + p.share, 0);
      if (sum !== 100) {
        out.push({
          id: `share:${v.key}:${a.id}`,
          severity: '오류',
          title: `배분율 합계 ${sum}%: ${a.code} (${v.label})`,
          detail: '같은 뷰에서 여러 곳에 배치한 설비의 배분율 합은 100%여야 합니다',
          href: '/',
          linkText: '설비 배치로',
          assetId: a.id,
        });
      }
    }
  }

  // 5) 전력계통 합산 정합성: 상위 노드 설비 값 vs 하위 설비 합
  const power = d.views.find((v) => v.key === 'power');
  if (power) {
    for (const p of activePlacements(d, power.key)) {
      const parentVal = assetPower(d, p.assetId);
      if (!parentVal) continue;
      const ids = new Set(subtreeIds(d, p.nodeId));
      let sum = 0;
      for (const q of activePlacements(d, power.key)) {
        if (!ids.has(q.nodeId)) continue;
        sum += (assetPower(d, q.assetId) ?? 0) * (q.share / 100);
      }
      if (sum <= 0) continue;
      const diff = (Math.abs(parentVal - sum) / parentVal) * 100;
      if (diff > SUM_TOLERANCE_PCT) {
        const a = d.assets.find((x) => x.id === p.assetId);
        out.push({
          id: `sum:${p.id}`,
          severity: '경고',
          title: `합산 차이 ${diff.toFixed(1)}%: ${a?.code ?? p.assetId}`,
          detail: `상위 ${parentVal}kW 대비 하위 설비 합 ${sum}kW (허용 ${SUM_TOLERANCE_PCT}%)`,
          href: '/',
          linkText: '설비 배치로',
          assetId: p.assetId,
        });
      }
    }
  }

  // 6) 사용 중지된 코드를 아직 쓰는 경우
  for (const c of d.codes.filter((x) => !x.active)) {
    const n = codeUsage(d, c.group, c.code);
    if (n > 0) {
      out.push({
        id: `code:${c.group}:${c.code}`,
        severity: '경고',
        title: `사용 중지 코드 참조: ${c.code}`,
        detail: `${n}건이 아직 이 코드를 사용합니다`,
        href: '/codes',
        linkText: '코드 관리로',
      });
    }
  }

  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === '오류' ? -1 : 1));
}
