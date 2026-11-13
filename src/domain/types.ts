// 기준정보 도메인 타입. 모든 화면이 같은 데이터(Data)를 공유한다.

/** 태그 상태는 저장하지 않고 입력 내용에서 계산한다(모순된 상태가 생기지 않도록) */
export type TagStatus = '미정리' | '정리됨' | '연결됨' | '보류';

export interface CodeGroup {
  key: string;
  label: string;
  /** 새 코드가 만족해야 하는 형식(정규식) */
  pattern: string;
  rule: string;
}

export interface CodeItem {
  group: string;
  code: string;
  label: string; // 코드명
  abbr: string; // 약자 (참고용)
  desc: string; // 설명
  scope: '표준' | '로컬';
  active: boolean;
  from: string;
  /** 파라미터 코드 전용: 기본 단위 */
  unit?: string;
  /** 파라미터 코드 전용: 같은 설비에 여러 개 연결 허용 (예: 상별 전류) */
  multi?: boolean;
}

/** 수집 원천 태그(raw). 파라미터·단위를 정하고(정리됨), 설비에 연결하면(연결됨) 포인트가 된다 */
export interface SourceTag {
  raw: string;
  device: string;
  /** 포인트 ID: 설비에 처음 연결할 때 부여 */
  ptId: string;
  param: string | null; // 파라미터 코드
  unit: string; // 단위 코드 ('' = 미지정)
  assetId: string | null; // 설비는 코드가 아닌 내부 ID로 참조한다
  hold: boolean;
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

export interface View {
  key: string;
  label: string;
  /** true 이면 모든 설비가 이 트리에 놓여야 한다(점검 규칙) */
  requireCoverage: boolean;
  /** true 이면 설비가 아닌 그룹 노드(공장·건물 등)를 만들 수 있다 */
  groups: boolean;
}

/** 트리 노드: 설비를 놓은 것(assetId)이거나 뷰 전용 그룹(code/label/type) */
export interface TreeNode {
  id: string;
  view: string;
  parent: string | null;
  assetId?: string;
  code?: string;
  label?: string;
  type?: string; // 그룹 유형 코드
  share: number; // 배분율(%) — 설비 노드에서만 의미 있음
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
  views: View[];
  nodes: TreeNode[];
  log: LogEntry[];
  settings: { sumTolerancePct: number };
  counters: { nd: number; lg: number; as: number };
}

export interface Issue {
  id: string;
  severity: '오류' | '경고';
  title: string;
  detail: string;
  href: string;
  linkText: string;
}
