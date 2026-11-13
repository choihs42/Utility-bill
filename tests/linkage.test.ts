import { describe, expect, it } from 'vitest';
import { makeStore } from '../src/store/store';
import * as A from '../src/domain/actions';
import { candidates, codeUsage, fulfillment, pathCode, validate } from '../src/domain/derive';

// 화면 간 연동(파라미터 → 트리 설계 → 트리 매핑 → 점검)을 같은 데이터로 확인한다.
const setup = () => {
  const store = makeStore({ persist: false });
  const run = (fn: Parameters<ReturnType<typeof store.getState>['run']>[0]) => store.getState().run(fn).error;
  const data = () => store.getState().data;
  return { run, data };
};
const ids = (d: ReturnType<ReturnType<typeof setup>['data']>) => validate(d).map((i) => i.id);

describe('파라미터 → 설비 연결', () => {
  it('단위가 없는 포인트는 승인할 수 없고, 단위 지정 후 승인된다', () => {
    const { run, data } = setup();
    expect(run((d) => A.approveTag(d, 'CP1_FLW'))).toMatch(/단위/);
    expect(run((d) => A.setTagUnit(d, 'CP1_FLW', 'Nm3/min'))).toBeNull();
    expect(run((d) => A.approveTag(d, 'CP1_FLW'))).toBeNull();
    expect(data().tags.find((t) => t.raw === 'CP1_FLW')?.status).toBe('승인');
  });

  it('승인된 포인트만 후보가 되고, 연결하면 충족도와 점검 항목이 갱신된다', () => {
    const { run, data } = setup();
    const cp1 = () => data().assets.find((a) => a.code === 'CP1')!;
    expect(candidates(data(), cp1(), '토출 유량')).toHaveLength(0);
    expect(ids(data())).toContain('slot:a2:토출 유량');
    expect(ids(data())).toContain('unit:CP1_FLW');

    run((d) => A.setTagUnit(d, 'CP1_FLW', 'Nm3/min'));
    run((d) => A.approveTag(d, 'CP1_FLW'));
    expect(run((d) => A.linkSlot(d, 'a2', '토출 유량', 'CP1_FLW'))).toBeNull();
    run((d) => A.approveTag(d, 'CP1_RUN'));
    run((d) => A.linkSlot(d, 'a2', '가동 상태', 'CP1_RUN'));
    expect(fulfillment(data(), cp1()).ok).toBe(true);
    expect(ids(data()).filter((i) => i.includes(':a2:') || i === 'unit:CP1_FLW')).toEqual([]);
  });

  it('보류로 되돌리면 연결이 풀리고 필수 항목 점검이 다시 생긴다', () => {
    const { run, data } = setup();
    run((d) => A.holdTag(d, 'CP1_PRS'));
    expect(data().links.some((l) => l.raw === 'CP1_PRS')).toBe(false);
    expect(ids(data())).toContain('slot:a2:토출 압력');
  });

  it('일괄 승인은 단위가 없는 태그를 남기고, 자동 연결은 후보가 하나인 항목만 연결한다', () => {
    const { run, data } = setup();
    run((d) => A.approveAllReady(d));
    const st = (raw: string) => data().tags.find((t) => t.raw === raw)?.status;
    expect(st('PMP1_KW')).toBe('승인');
    expect(st('FAN1_KW')).toBe('승인');
    expect(st('CP1_FLW')).toBe('제안');
    expect(st('XYZ_T3')).toBe('보류');
    run((d) => A.autoLinkAll(d));
    expect(data().links.some((l) => l.raw === 'PMP1_KW')).toBe(true);
    expect(data().links.some((l) => l.raw === 'CP1_FLW')).toBe(false);
  });
});

describe('태그 매핑 편집', () => {
  it('설비·항목·단위·이름을 직접 지정하면 새 포인트로 승인되고 ID가 부여된다', () => {
    const { run, data } = setup();
    expect(run((d) => A.approveTag(d, 'XYZ_T3'))).toMatch(/포인트명/);
    run((d) => A.updateTag(d, 'XYZ_T3', { name: '집진 팬 전류(현장 확인)', assetCode: 'FAN1' }));
    expect(run((d) => A.updateTag(d, 'XYZ_T3', { slot: '냉각' }))).toMatch(/없는 항목/);
    run((d) => A.updateTag(d, 'XYZ_T3', { slot: '전류', unit: 'A' }));
    expect(run((d) => A.approveTag(d, 'XYZ_T3'))).toBeNull();
    const t = data().tags.find((x) => x.raw === 'XYZ_T3')!;
    expect(t.status).toBe('승인');
    expect(t.ptId).toBe('PT-000114');
    const fan = data().assets.find((a) => a.code === 'FAN1')!;
    expect(candidates(data(), fan, '전류').map((x) => x.raw)).toContain('XYZ_T3');
  });

  it('승인된 태그의 설비·항목을 바꾸면 승인과 연결이 해제된다', () => {
    const { run, data } = setup();
    expect(data().links.some((l) => l.raw === 'CP1_PRS')).toBe(true);
    run((d) => A.updateTag(d, 'CP1_PRS', { assetCode: 'PMP1' }));
    const t = data().tags.find((x) => x.raw === 'CP1_PRS')!;
    expect(t.status).toBe('제안');
    expect(t.slot).toBeNull();
    expect(data().links.some((l) => l.raw === 'CP1_PRS')).toBe(false);
    run((d) => A.updateTag(d, 'CP1_PRS', { unit: 'A' }));
    expect(data().tags.find((x) => x.raw === 'CP1_PRS')?.unit).toBe('A');
  });
});

describe('계통 트리 설계', () => {
  it('노드를 추가하면 경로 코드가 자동 생성되고, 같은 상위 아래 중복 코드는 막는다', () => {
    const { run, data } = setup();
    expect(run((d) => A.addNode(d, 'power', 'pw2', 'MCC3', 'MCC-3', 'PANEL'))).toBeNull();
    const n = data().nodes.at(-1)!;
    expect(pathCode(data(), n.id)).toBe('TR1_LV1_MCC3');
    expect(run((d) => A.addNode(d, 'power', 'pw2', 'MCC3', 'MCC-3b', 'PANEL'))).toMatch(/이미/);
    expect(run((d) => A.addNode(d, 'power', 'pw2', 'bad code!', 'x', 'PANEL'))).toMatch(/코드/);
    expect(run((d) => A.addNode(d, 'power', 'og1', 'X1', 'x', 'PANEL'))).toMatch(/같은 뷰/);
  });

  it('코드를 바꾸거나 노드를 옮기면 하위와 배치된 설비의 경로가 함께 바뀐다', () => {
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
    const id = data().nodes.at(-1)!.id;
    expect(run((d) => A.deleteNode(d, id))).toBeNull();
  });
});

describe('트리 매핑', () => {
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

  it('배치를 해제하면 미배치 점검이 생기고, 전력계통 합산 경고가 계산된다', () => {
    const { run, data } = setup();
    expect(validate(data()).find((i) => i.id === 'sum:pl-1')?.title).toContain('3.0%');
    run((d) => A.approveAllReady(d));
    run((d) => A.autoLinkAll(d));
    run((d) => A.placeAsset(d, 'a3', 'pw3'));
    expect(ids(data())).not.toContain('sum:pl-1');
    run((d) => A.removePlacement(d, data().placements.at(-1)!.id));
    expect(ids(data())).toContain('sum:pl-1');
  });
});

describe('코드와 진행 현황', () => {
  it('사용 중인 코드를 중지하면 점검 경고가 나온다', () => {
    const { run, data } = setup();
    expect(codeUsage(data(), 'unit', 'kW')).toBeGreaterThan(0);
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

  it('변경 이력이 남는다', () => {
    const { run, data } = setup();
    run((d) => A.approveAllReady(d));
    expect(data().log[0].text).toContain('일괄 승인');
  });
});
