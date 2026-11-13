// 기준정보 도메인 타입. 모든 화면이 같은 데이터(Data)를 공유한다.

export type TagStatus = '제안' | '승인' | '보류';

export interface CodeGroup {
  key: string;
  label: string;
  /** 새 코드가 만족해야 하는 형식(정규식). extendable=false 이면 추가 불가 */
  pattern: string;
  rule: string;
  extendable: boolean;
}

export interface CodeItem {
  group: string;
  code: string;
  label: string;
  scope: '표준' | '로컬';
  active: boolean;
  from: string;
}

/**
 * 수집 원천 태그(raw) + 표준 포인트 정의.
 * 설비(assetId)와 항목(slot)이 정해지고 상태가 '승인'이면 그 설비 항목에 연결된 것으로 본다.
 */
export interface SourceTag {
  raw: string;
  device: string;
  /** 포인트 ID: 승인할 때 부여 */
  ptId: string;
  name: string;
  unit: string; // 단위 코드 ('' = 미지정)
  status: TagStatus;
  /** 설비는 코드가 아닌 내부 ID로 참조한다(코드를 바꿔도 연결 유지) */
  assetId: string | null;
  slot: string | null;
  /** 더미 순시값(kW). 합산 정합성 점검에 사용 */
  value: number | null;
}

export interface Asset {
  id: string;
  code: string;
  name: string;
  type: string; // 설비 유형 코드
  energy: string; // 에너지원 코드
}

export interface TemplateSlot {
  item: string;
  req: boolean;
  kind: string; // 계측 성격 코드 (INST/CUM/INTV)
}

export interface Template {
  type: string;
  slots: TemplateSlot[];
}

/** 약어 사전: 원천 태그 이름의 조각(토큰) → 설비 또는 항목 */
export interface Alias {
  id: string;
  token: string;
  kind: 'asset' | 'slot';
  assetId?: string;
  slot?: string;
  unit?: string;
}

export interface View {
  key: string;
  label: string;
  /** true 이면 모든 설비가 이 뷰에 배치되어야 한다(점검 규칙) */
  requireCoverage: boolean;
}

export interface TreeNode {
  id: string;
  view: string;
  code: string;
  label: string;
  parent: string | null;
  type: string; // 노드 유형 코드
}

export interface Placement {
  id: string;
  assetId: string;
  nodeId: string;
  share: number; // 배분율(%)
  from: string;
}

export interface LogEntry {
  id: string;
  when: string;
  text: string;
}

export interface Data {
  codeGroups: CodeGroup[];
  codes: CodeItem[];
  tags: SourceTag[];
  assets: Asset[];
  templates: Template[];
  aliases: Alias[];
  views: View[];
  nodes: TreeNode[];
  placements: Placement[];
  log: LogEntry[];
  settings: { sumTolerancePct: number };
  counters: { pl: number; nd: number; lg: number; as: number; al: number };
}

export interface Issue {
  id: string;
  severity: '오류' | '경고';
  title: string;
  detail: string;
  href: string;
  linkText: string;
  assetId?: string;
}
