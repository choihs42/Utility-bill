import type { Asset, CodeItem, Data, Issue, SourceTag, TagStatus, TreeNode } from './types';

// 저장하지 않고 항상 데이터에서 계산하는 값들(상태, 경로 코드, 점검 결과).

export const POWER_PARAM = 'PWR_KW';

export function tagStatus(t: SourceTag): TagStatus {
  if (t.hold) return '보류';
  if (t.assetId && t.param && t.unit) return '연결됨';
  if (t.param && t.unit) return '정리됨';
  return '미정리';
}

export const paramOf = (d: Data, code: string | null): CodeItem | undefined =>
  code ? d.codes.find((c) => c.group === 'param' && c.code === code) : undefined;

export const assetOf = (d: Data, id: string | null | undefined): Asset | undefined =>
  id ? d.assets.find((a) => a.id === id) : undefined;

export function codeLabel(d: Data, group: string, code: string): string {
  return d.codes.find((c) => c.group === group && c.code === code)?.label ?? code;
}

/** 포인트명: 연결된 설비가 있으면 '설비명 + 파라미터명', 아니면 파라미터명 */
export function pointName(d: Data, t: SourceTag): string {
  const p = paramOf(d, t.param)?.label ?? '';
  const a = assetOf(d, t.assetId);
  return a ? `${a.name} ${p}`.trim() : p;
}

export function nodeById(d: Data, id: string): TreeNode | undefined {
  return d.nodes.find((n) => n.id === id);
}
export function nodeCode(d: Data, n: TreeNode): string {
  return n.assetId ? assetOf(d, n.assetId)?.code ?? '?' : n.code ?? '?';
}
export function nodeLabel(d: Data, n: TreeNode): string {
  return n.assetId ? assetOf(d, n.assetId)?.name ?? '?' : n.label ?? '?';
}

/** 경로 코드: 루트부터 노드 코드를 '_'로 이어서 자동 생성 (TR1_LV1_MCC1_RM1) */
export function pathCode(d: Data, nodeId: string): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  let cur = nodeById(d, nodeId);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    parts.unshift(nodeCode(d, cur));
    const p: string | null = cur.parent;
    cur = p ? nodeById(d, p) : undefined;
  }
  return parts.join('_');
}

export function childrenOf(d: Data, parent: string | null, view: string): TreeNode[] {
  return d.nodes.filter((n) => n.view === view && n.parent === parent);
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

/** 트리를 위에서부터 훑은 순서(들여쓰기 깊이 포함) */
export function flatTree(d: Data, view: string): { node: TreeNode; depth: number }[] {
  const out: { node: TreeNode; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const n of childrenOf(d, parent, view)) {
      out.push({ node: n, depth });
      walk(n.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export function linkedTags(d: Data, assetId: string): SourceTag[] {
  return d.tags.filter((t) => t.assetId === assetId && !t.hold);
}

/** 설비의 순시 전력 값(kW): 연결된 순시 전력 태그의 값 */
export function assetPower(d: Data, assetId: string): number | null {
  const t = linkedTags(d, assetId).find((x) => x.param === POWER_PARAM && x.value != null);
  return t?.value ?? null;
}

export function codeUsage(d: Data, group: string, code: string): number {
  switch (group) {
    case 'param':
      return d.tags.filter((t) => t.param === code).length;
    case 'unit':
      return d.tags.filter((t) => t.unit === code).length + d.codes.filter((c) => c.group === 'param' && c.unit === code).length;
    case 'asset':
      return d.assets.filter((a) => a.type === code).length;
    case 'energy':
      return d.assets.filter((a) => a.energy === code).length;
    case 'group':
      return d.nodes.filter((n) => !n.assetId && n.type === code).length;
    default:
      return 0;
  }
}

/** 노드 아래 합산 값: 자기 값이 있으면 그 값, 없으면 하위 합 */
function nodeTotal(d: Data, n: TreeNode): number {
  const own = n.assetId ? assetPower(d, n.assetId) : null;
  if (own != null) return own * (n.share / 100);
  return childrenOf(d, n.id, n.view).reduce((s, c) => s + nodeTotal(d, c), 0);
}

export function validate(d: Data): Issue[] {
  const out: Issue[] = [];
  const live = d.tags.filter((t) => !t.hold);

  // 1) 파라미터·단위가 정해지지 않은 태그 / 설비에 연결되지 않은 태그
  const todo = live.filter((t) => tagStatus(t) === '미정리');
  if (todo.length > 0) {
    out.push({ id: 'untidy', severity: '경고', title: `파라미터·단위 미지정 태그 ${todo.length}개`, detail: todo.map((t) => t.raw).join(', '), href: '/data', linkText: '코드·태그로' });
  }
  const unlinked = live.filter((t) => tagStatus(t) === '정리됨');
  if (unlinked.length > 0) {
    out.push({ id: 'unlinked', severity: '경고', title: `설비에 연결되지 않은 태그 ${unlinked.length}개`, detail: unlinked.map((t) => t.raw).join(', '), href: '/map', linkText: '포인트 매핑으로' });
  }

  // 2) 연결된 포인트가 없는 설비 (다른 설비를 하위로 거느린 구조용 설비는 제외)
  const parents = new Set(d.nodes.filter((n) => n.parent).map((n) => nodeById(d, n.parent!)?.assetId));
  for (const a of d.assets) {
    if (!parents.has(a.id) && linkedTags(d, a.id).length === 0) {
      out.push({ id: `nopoint:${a.id}`, severity: '경고', title: `연결된 포인트 없음: ${a.code}`, detail: a.name, href: '/map', linkText: '포인트 매핑으로' });
    }
  }

  // 3) 같은 설비에 같은 파라미터 중복 연결(복수 허용 파라미터 제외)
  for (const a of d.assets) {
    const count = new Map<string, number>();
    for (const t of linkedTags(d, a.id)) if (t.param) count.set(t.param, (count.get(t.param) ?? 0) + 1);
    for (const [p, n] of count) {
      if (n > 1 && !paramOf(d, p)?.multi) {
        out.push({ id: `dup:${a.id}:${p}`, severity: '오류', title: `중복 연결: ${a.code} · ${codeLabel(d, 'param', p)}`, detail: `같은 파라미터가 ${n}개 연결되었습니다`, href: '/map', linkText: '포인트 매핑으로' });
      }
    }
  }

  // 4) 파라미터 기본 단위와 다른 단위
  for (const t of live) {
    const def = paramOf(d, t.param)?.unit;
    if (def && t.unit && t.unit !== def) {
      out.push({ id: `unit:${t.raw}`, severity: '경고', title: `단위 불일치: ${t.raw}`, detail: `${codeLabel(d, 'param', t.param ?? '')} 기본 단위는 ${def}, 현재 ${t.unit}`, href: '/data', linkText: '코드·태그로' });
    }
  }

  // 5) 필수 트리에 놓이지 않은 설비
  for (const v of d.views.filter((x) => x.requireCoverage)) {
    const placed = new Set(d.nodes.filter((n) => n.view === v.key && n.assetId).map((n) => n.assetId));
    for (const a of d.assets) {
      if (!placed.has(a.id)) {
        out.push({ id: `cov:${v.key}:${a.id}`, severity: '경고', title: `${v.label} 미배치: ${a.code}`, detail: a.name, href: '/tree', linkText: '트리 설계로' });
      }
    }
  }

  // 6) 배분율 합계 (같은 트리에서 같은 설비가 여러 곳에 놓인 경우)
  for (const v of d.views) {
    for (const a of d.assets) {
      const ns = d.nodes.filter((n) => n.view === v.key && n.assetId === a.id);
      if (ns.length === 0) continue;
      const sum = ns.reduce((s, n) => s + n.share, 0);
      if (sum !== 100) {
        out.push({ id: `share:${v.key}:${a.id}`, severity: '오류', title: `배분율 합계 ${sum}%: ${a.code} (${v.label})`, detail: '같은 트리에서 여러 곳에 놓은 설비의 배분율 합은 100%여야 합니다', href: '/tree', linkText: '트리 설계로' });
      }
    }
  }

  // 7) 전력계통 합산: 상위 설비 값 vs 하위 합
  const tol = d.settings.sumTolerancePct;
  for (const n of d.nodes.filter((x) => x.view === 'power' && x.assetId)) {
    const own = assetPower(d, n.assetId!);
    if (!own) continue;
    const sub = childrenOf(d, n.id, n.view).reduce((s, c) => s + nodeTotal(d, c), 0);
    if (sub <= 0) continue;
    const diff = (Math.abs(own - sub) / own) * 100;
    if (diff > tol) {
      out.push({ id: `sum:${n.id}`, severity: '경고', title: `합산 차이 ${diff.toFixed(1)}%: ${nodeCode(d, n)}`, detail: `상위 ${own}kW, 하위 합 ${sub}kW (허용 ${tol}%)`, href: '/tree', linkText: '트리 설계로' });
    }
  }

  // 8) 사용 중지된 코드를 아직 쓰는 경우
  for (const c of d.codes.filter((x) => !x.active)) {
    const n = codeUsage(d, c.group, c.code);
    if (n > 0) out.push({ id: `code:${c.group}:${c.code}`, severity: '경고', title: `사용 중지 코드 참조: ${c.code}`, detail: `${n}건이 아직 사용합니다`, href: '/data', linkText: '코드·태그로' });
  }

  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === '오류' ? -1 : 1));
}
