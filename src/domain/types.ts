// 기준정보 도메인 타입. 모든 화면이 같은 데이터(Data)를 공유한다.

export type TagStatus = '제안' | '승인' | '보류';
export type RequestStatus = '승인 대기' | '승인됨' | '반려됨';

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

/** 수집 원천 태그(raw) + 표준 포인트 제안. 상태가 '승인'이면 표준 포인트로 확정된 것으로 본다. */
export interface SourceTag {
  raw: string;
  device: string;
  ptId: string;
  name: string;
  item: string;
  kind: string; // 계측 성격 코드 (INST/CUM/INTV)
  unit: string; // 단위 코드 ('' = 누락)
  conf: number;
  status: TagStatus;
  reasons: string[];
  /** 약어 사전으로 추정한 설비 코드 */
  assetCode: string | null;
  /** 설비 템플릿의 어느 슬롯에 해당하는지 */
  slot: string | null;
  /** 더미 순시값(kW). 합산 정합성 검증에 사용 */
  value: number | null;
}

export interface Asset {
  id: string;
  code: string;
  name: string;
  type: string; // 설비 유형 코드
  energy: string; // 에너지원 코드
}

export interface Template {
  type: string;
  slots: { item: string; req: boolean }[];
}

/** 설비 슬롯 ↔ 원천 태그(표준 포인트) 연결 */
export interface AssetLink {
  assetId: string;
  slot: string;
  raw: string;
}

export interface View {
  key: string;
  label: string;
  /** true 이면 모든 설비가 이 뷰에 배치되어야 한다(검증 규칙) */
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
  status: 'active' | 'pending';
}

export interface ChangeRequest {
  id: string;
  title: string;
  before: string;
  after: string;
  by: string;
  when: string;
  status: RequestStatus;
  placementId: string | null;
}

export interface Data {
  codeGroups: CodeGroup[];
  codes: CodeItem[];
  tags: SourceTag[];
  assets: Asset[];
  templates: Template[];
  links: AssetLink[];
  views: View[];
  nodes: TreeNode[];
  placements: Placement[];
  requests: ChangeRequest[];
  counters: { pl: number; rq: number };
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
