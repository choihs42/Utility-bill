import { describe, expect, it } from 'vitest';
import { makeStore } from '../src/store/store';
import * as A from '../src/domain/actions';
import { parseTagCsv } from '../src/domain/csv';
import { codeUsage, fulfillment, pathCode, validate } from '../src/domain/derive';

// 화면 간 연동(설비·템플릿 → 포인트 매핑 → 트리 설계 → 트리 매핑 → 점검)을 같은 데이터로 확인한다.
const setup = () => {
  const store = makeStore({ persist: false });
  const run = (fn: Parameters<ReturnType<typeof store.getState>['run']>[0]) => store.getState().run(fn).error;
  const data = () => store.getState().data;
  return { store, run, data };
};
const ids = (d: ReturnType<ReturnType<typeof setup>['data']>) => validate(d).map((i) => i.id);
const tag = (d: ReturnType<ReturnType<typeof setup>['data']>, raw: string) => d.tags.find((t) => t.raw === raw)!;
const asset = (d: ReturnType<ReturnType<typeof setup>['data']>, code: string) => d.assets.find((a) => a.code === code)!;

describe('포인트 매핑', () => {
  it('승인은 이름·설비·항목·단위가 모두 있어야 하고, 승인하면 바로 설비 항목에 연결된다', () => {
    const { run, data } = setup();
    expect(run((d) => A.approveTag(d, 'CP1_FLW'))).toMatch(/단위/);
    expect(run((d) => A.approveTag(d, 'XYZ_T3'))).toMatch(/포인트명/);
    expect(ids(data())).toContain('unit:CP1_FLW');
    run((d) => A.updateTag(d, 'CP1_FLW', { unit: 'Nm3/min' }));
    expect(run((d) => A.approveTag(d, 'CP1_FLW'))).toBeNull();
    expect(tag(data(), 'CP1_FLW').ptId).toMatch(/^PT-\d{6}$/);
    run((d) => A.approveTag(d, 'CP1_RUN'));
    expect(fulfillment(data(), asset(data(), 'CP1')).ok).toBe(true);
    expect(ids(data()).filter((i) => i.includes(':a2:') || i === 'unit:CP1_FLW')).toEqual([]);
  });

  it('같은 설비 항목에 둘째 태그는 승인할 수 없고, 먼저 것을 보류하면 가능하다', () => {
    const { run, data } = setup();
    run((d) => A.importTags(d, [{ raw: 'CP1_KW2', device: 'GW1', assetCode: 'CP1', slot: '순시 전력', unit: 'kW', name: 'CP-01 순시 전력(보조)' }]));
    expect(run((d) => A.approveTag(d, 'CP1_KW2'))).toMatch(/이미 CP1_KW/);
    run((d) => A.holdTag(d, 'CP1_KW'));
    expect(run((d) => A.approveTag(d, 'CP1_KW2'))).toBeNull();
    expect(fulfillment(data(), asset(data(), 'CP1')).slots[0].tag?.raw).toBe('CP1_KW2');
  });

  it('보류하면 연결이 풀려 점검에 다시 나타나고, 승인된 태그의 설비를 바꾸면 승인이 해제된다', () => {
    const { run, data } = setup();
    run((d) => A.holdTag(d, 'CP1_PRS'));
    expect(ids(data())).toContain('slot:a2:토출 압력');
    run((d) => A.updateTag(d, 'RM1_KWH_01', { assetId: 'a5' }));
    const t = tag(data(), 'RM1_KWH_01');
    expect(t.status).toBe('제안');
    expect(t.slot).toBeNull();
    expect(ids(data())).toContain('slot:a1:누적 전력량');
  });

  it('일괄 승인은 입력이 덜 된 태그를 남기고, 일괄 수정은 하나라도 오류면 전체를 취소한다', () => {
    const { run, data } = setup();
    run((d) => A.approveAllReady(d));
    expect(['FAN1_KW', 'FAN1_A', 'PMP1_KW', 'CP1_RUN'].every((r) => tag(data(), r).status === '승인')).toBe(true);
    expect(tag(data(), 'CP1_FLW').status).toBe('제안');
    expect(tag(data(), 'XYZ_T3').status).toBe('보류');
    expect(run((d) => A.bulkUpdateTags(d, ['CP1_FLW', 'XYZ_T3'], { slot: '토출 압력' }))).toMatch(/없는 항목/);
    expect(tag(data(), 'CP1_FLW').slot).toBe('토출 유량');
    expect(run((d) => A.bulkUpdateTags(d, ['CP1_FLW'], { unit: 'Nm3/min' }))).toBeNull();
    expect(tag(data(), 'CP1_FLW').unit).toBe('Nm3/min');
  });

  it('가져오기는 중복을 건너뛰고 약어 사전으로 빈 칸을 채운다', () => {
    const { run, data } = setup();
    const rows = parseTagCsv('원천 태그,장치\n# 메모\nCP1_KW,GW1\nPMP1_KW_B\tGW2\nZZ9_TMP,GW2');
    expect(rows.map((r) => r.raw)).toEqual(['CP1_KW', 'PMP1_KW_B', 'ZZ9_TMP']);
    expect(run((d) => A.importTags(d, rows))).toBeNull();
    const n = data().tags.length;
    expect(n).toBe(14);
    const b = tag(data(), 'PMP1_KW_B');
    expect([b.assetId, b.slot, b.unit, b.name, b.status]).toEqual(['a5', '순시 전력', 'kW', '냉각수 펌프 순시 전력', '제안']);
    expect(tag(data(), 'ZZ9_TMP').assetId).toBeNull();
    expect(run((d) => A.importTags(d, rows))).toMatch(/새로 추가할/);
  });

  it('약어 사전은 이미 입력된 값을 바꾸지 않고, 약어 형식을 검사한다', () => {
    const { run, data } = setup();
    run((d) => A.updateTag(d, 'FAN1_KW', { unit: 'kWh' }));
    run((d) => A.applyAliases(d));
    expect(tag(data(), 'FAN1_KW').unit).toBe('kWh');
    expect(run((d) => A.addAlias(d, 'asset', 'cp1', { assetId: 'a2' }))).toMatch(/이미/);
    expect(run((d) => A.addAlias(d, 'slot', 'A_B', { slot: '전류' }))).toMatch(/밑줄/);
    expect(run((d) => A.addAlias(d, 'slot', 'TMP', { slot: '없는 항목' }))).toMatch(/항목/);
  });
});

describe('설비와 템플릿', () => {
  it('설비 코드를 바꿔도 태그 연결과 배치가 유지된다(내부 ID 참조)', () => {
    const { run, data } = setup();
    expect(run((d) => A.addAsset(d, 'CP1', '중복', 'COMP', 'ELEC'))).toMatch(/이미/);
    expect(run((d) => A.updateAsset(d, 'a2', 'CP9', '컴프레서 CP-09', 'COMP', 'ELEC'))).toBeNull();
    expect(fulfillment(data(), asset(data(), 'CP9')).slots[0].tag?.raw).toBe('CP1_KW');
    expect(data().placements.some((p) => p.assetId === 'a2')).toBe(true);
    expect(run((d) => A.updateAsset(d, 'a2', 'CP9', '컴프레서', 'FAN', 'ELEC'))).toMatch(/유형/);
  });

  it('새 설비는 삭제할 수 있고, 태그나 배치가 있는 설비는 삭제할 수 없다', () => {
    const { run, data } = setup();
    expect(run((d) => A.deleteAsset(d, 'a2'))).toMatch(/태그/);
    run((d) => A.addAsset(d, 'CP2', '컴프레서 CP-02', 'COMP', 'ELEC'));
    const id = asset(data(), 'CP2').id;
    expect(ids(data())).toContain(`slot:${id}:토출 압력`);
    expect(run((d) => A.deleteAsset(d, id))).toBeNull();
  });

  it('템플릿 항목을 추가하면 해당 유형 설비에 필수 항목 점검이 생기고, 필수를 끄면 사라진다', () => {
    const { run, data } = setup();
    run((d) => A.addSlot(d, 'COMP', '토출 온도', true, 'INST'));
    expect(ids(data())).toContain('slot:a2:토출 온도');
    expect(run((d) => A.addSlot(d, 'COMP', '토출 온도', true, 'INST'))).toMatch(/이미/);
    run((d) => A.toggleSlotReq(d, 'COMP', '토출 온도'));
    expect(ids(data())).not.toContain('slot:a2:토출 온도');
    expect(run((d) => A.removeSlot(d, 'COMP', '토출 압력'))).toMatch(/태그/);
    expect(run((d) => A.removeSlot(d, 'COMP', '토출 온도'))).toBeNull();
  });
});

describe('계통 트리 설계', () => {
  it('노드를 추가하면 경로 코드가 자동 생성되고, 같은 상위 아래 중복 코드는 막는다', () => {
    const { run, data } = setup();
    expect(run((d) => A.addNode(d, 'power', 'pw2', 'MCC3', 'MCC-3', 'PANEL'))).toBeNull();
    expect(pathCode(data(), data().nodes.at(-1)!.id)).toBe('TR1_LV1_MCC3');
    expect(run((d) => A.addNode(d, 'power', 'pw2', 'MCC3', 'MCC-3b', 'PANEL'))).toMatch(/이미/);
    expect(run((d) => A.addNode(d, 'power', 'pw2', 'bad code!', 'x', 'PANEL'))).toMatch(/코드/);
    expect(run((d) => A.addNode(d, 'power', 'og1', 'X1', 'x', 'PANEL'))).toMatch(/같은 뷰/);
  });

  it('코드를 바꾸거나 노드를 옮기면 하위 경로가 함께 바뀌고, 순환 이동은 막는다', () => {
    const { run, data } = setup();
    run((d) => A.updateNode(d, 'pw2', 'pw1', 'LVA', '저압반 A', 'PANEL'));
    expect(pathCode(data(), 'pw3')).toBe('TR1_LVA_MCC1');
    run((d) => A.updateNode(d, 'pw4', 'pw1', 'MCC2', 'MCC-2', 'PANEL'));
    expect(pathCode(data(), 'pw4')).toBe('TR1_MCC2');
    expect(run((d) => A.updateNode(d, 'pw1', 'pw3', 'TR1', 'TR-1', 'TRANS'))).toMatch(/하위 노드 아래/);
  });

  it('하위 노드나 배치된 설비가 있는 노드는 삭제할 수 없다', () => {
    const { run, data } = setup();
    expect(run((d) => A.deleteNode(d, 'pw2'))).toMatch(/하위/);
    expect(run((d) => A.deleteNode(d, 'pw3'))).toMatch(/배치/);
    run((d) => A.addNode(d, 'power', 'pw2', 'MCC3', 'MCC-3', 'PANEL'));
    expect(run((d) => A.deleteNode(d, data().nodes.at(-1)!.id))).toBeNull();
  });
});

describe('트리 매핑과 점검', () => {
  it('배치는 바로 반영되고, 같은 설비를 세 뷰에 동시에 둘 수 있다', () => {
    const { run, data } = setup();
    run((d) => A.placeAsset(d, 'a3', 'pw3'));
    expect(data().placements.at(-1)?.nodeId).toBe('pw3');
    expect(run((d) => A.placeAsset(d, 'a3', 'pw3'))).toMatch(/이미/);
    const views = data().placements.filter((p) => p.assetId === 'a1').map((p) => data().nodes.find((n) => n.id === p.nodeId)!.view);
    expect(new Set(views)).toEqual(new Set(['power', 'org', 'space']));
  });

  it('같은 뷰에 나눠 놓으면 균등 배분되고, 합이 100이 아니면 점검에 오류가 뜬다', () => {
    const { run, data } = setup();
    run((d) => A.placeAsset(d, 'a1', 'pw4'));
    expect(data().placements.filter((p) => p.assetId === 'a1' && p.nodeId.startsWith('pw')).map((p) => p.share)).toEqual([50, 50]);
    expect(ids(data()).some((i) => i.startsWith('share:'))).toBe(false);
    run((d) => A.setShare(d, 'pl-2', 70));
    expect(ids(data())).toContain('share:power:a1');
  });

  it('전력계통 합산 경고는 FAN1을 승인·배치하면 사라지고, 허용 오차 설정을 따른다', () => {
    const { run, data } = setup();
    expect(validate(data()).find((i) => i.id === 'sum:pl-1')?.title).toContain('3.0%');
    run((d) => A.setTolerance(d, 5));
    expect(ids(data())).not.toContain('sum:pl-1');
    run((d) => A.setTolerance(d, 2));
    run((d) => A.approveAllReady(d));
    run((d) => A.placeAsset(d, 'a3', 'pw3'));
    expect(ids(data())).not.toContain('sum:pl-1');
    run((d) => A.removePlacement(d, data().placements.at(-1)!.id));
    expect(ids(data())).toContain('sum:pl-1');
    expect(run((d) => A.setTolerance(d, 80))).toMatch(/0~50/);
  });
});

describe('코드와 되돌리기', () => {
  it('사용 중인 코드를 중지하면 점검 경고가 나온다', () => {
    const { run, data } = setup();
    expect(codeUsage(data(), 'unit', 'kW')).toBeGreaterThan(0);
    expect(codeUsage(data(), 'kind', 'INST')).toBeGreaterThan(0);
    run((d) => A.toggleCode(d, 'unit', 'kW'));
    expect(ids(data())).toContain('code:unit:kW');
    run((d) => A.toggleCode(d, 'unit', 'kW'));
    expect(ids(data())).not.toContain('code:unit:kW');
  });

  it('로컬 코드는 LOC_ 접두와 형식·중복을 검사한다', () => {
    const { run } = setup();
    expect(run((d) => A.addCode(d, 'energy', 'STEAM2', '스팀2'))).toMatch(/LOC_/);
    expect(run((d) => A.addCode(d, 'energy', 'LOC_steam', '스팀'))).toMatch(/형식/);
    expect(run((d) => A.addCode(d, 'energy', 'LOC_STEAM', '스팀'))).toMatch(/이미/);
    expect(run((d) => A.addCode(d, 'kind', 'LOC_X', 'x'))).toMatch(/고정/);
    expect(run((d) => A.addCode(d, 'energy', 'LOC_HOTW', '온수'))).toBeNull();
  });

  it('변경 이력이 남고, 되돌리기로 직전 상태를 복원한다', () => {
    const { store, run, data } = setup();
    run((d) => A.approveAllReady(d));
    expect(data().log[0].text).toContain('일괄 승인');
    expect(tag(data(), 'FAN1_KW').status).toBe('승인');
    store.getState().undo();
    expect(tag(data(), 'FAN1_KW').status).toBe('제안');
    expect(store.getState().past).toHaveLength(0);
  });
});
