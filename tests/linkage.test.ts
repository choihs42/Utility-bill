import { describe, expect, it } from 'vitest';
import { makeStore } from '../src/store/store';
import * as A from '../src/domain/actions';
import { candidates, codeUsage, fulfillment, pathCode, validate } from '../src/domain/derive';

// 화면 간 연동(포인트 승인 → 설비 연결 → 계통 배치 → 검증/승인)을 같은 데이터로 확인한다.
const setup = () => {
  const store = makeStore({ persist: false });
  const run = (fn: (d: ReturnType<typeof store.getState>['data']) => A.Result) => store.getState().run(fn);
  const data = () => store.getState().data;
  return { run, data };
};
const ids = (d: ReturnType<ReturnType<typeof setup>['data']>) => validate(d).map((i) => i.id);

describe('포인트 → 설비 연결', () => {
  it('단위가 없는 포인트는 승인할 수 없고, 단위 지정 후 승인된다', () => {
    const { run, data } = setup();
    expect(run((d) => A.approveTag(d, 'CP1_FLW'))).toMatch(/단위/);
    expect(run((d) => A.setTagUnit(d, 'CP1_FLW', 'Nm3/min'))).toBeNull();
    expect(run((d) => A.approveTag(d, 'CP1_FLW'))).toBeNull();
    expect(data().tags.find((t) => t.raw === 'CP1_FLW')?.status).toBe('승인');
  });

  it('승인된 포인트만 슬롯 후보가 되고, 연결하면 충족도와 오류가 갱신된다', () => {
    const { run, data } = setup();
    const cp1 = () => data().assets.find((a) => a.code === 'CP1')!;
    expect(candidates(data(), cp1(), '토출 유량')).toHaveLength(0);
    expect(ids(data())).toContain('slot:a2:토출 유량');
    expect(ids(data())).toContain('unit:CP1_FLW');

    run((d) => A.setTagUnit(d, 'CP1_FLW', 'Nm3/min'));
    run((d) => A.approveTag(d, 'CP1_FLW'));
    expect(candidates(data(), cp1(), '토출 유량').map((t) => t.raw)).toEqual(['CP1_FLW']);
    expect(run((d) => A.linkSlot(d, 'a2', '토출 유량', 'CP1_FLW'))).toBeNull();

    run((d) => A.approveTag(d, 'CP1_RUN'));
    run((d) => A.linkSlot(d, 'a2', '가동 상태', 'CP1_RUN'));
    expect(fulfillment(data(), cp1()).ok).toBe(true);
    expect(ids(data()).filter((i) => i.includes(':a2:') || i === 'unit:CP1_FLW')).toEqual([]);
  });

  it('보류로 되돌리면 연결이 풀리고 필수 슬롯 오류가 다시 생긴다', () => {
    const { run, data } = setup();
    run((d) => A.holdTag(d, 'CP1_PRS'));
    expect(data().links.some((l) => l.raw === 'CP1_PRS')).toBe(false);
    expect(ids(data())).toContain('slot:a2:토출 압력');
  });
});

describe('설비 → 계통 배치와 승인', () => {
  it('배치는 대기 상태와 변경 요청을 만들고 경로 코드는 노드 코드로 자동 생성된다', () => {
    const { run, data } = setup();
    expect(pathCode(data(), 'pw3')).toBe('TR1_LV1_MCC1');
    expect(pathCode(data(), 'og3')).toBe('압연공장_압연공정_압연기1');
    expect(run((d) => A.placeAsset(d, 'a3', 'pw3'))).toBeNull();
    const pl = data().placements.at(-1)!;
    expect(pl.status).toBe('pending');
    expect(data().requests.at(-1)?.after).toBe('전력계통 · TR1_LV1_MCC1');
  });

  it('같은 설비를 전력·조직·공간 뷰에 동시에 둘 수 있다', () => {
    const { data } = setup();
    const views = data().placements.filter((p) => p.assetId === 'a1' && p.status === 'active').map((p) => data().nodes.find((n) => n.id === p.nodeId)!.view);
    expect(new Set(views)).toEqual(new Set(['power', 'org', 'space']));
  });

  it('필수 슬롯이 비어 있는 설비의 배치 요청은 승인할 수 없다', () => {
    const { run, data } = setup();
    expect(run((d) => A.approveRequest(d, 'rq-1'))).toMatch(/승인할 수 없습니다/);
    expect(data().placements.find((p) => p.id === 'pl-7')?.status).toBe('pending');

    run((d) => A.approveTag(d, 'PMP1_KW'));
    run((d) => A.linkSlot(d, 'a5', '순시 전력', 'PMP1_KW'));
    expect(run((d) => A.approveRequest(d, 'rq-1'))).toBeNull();
    expect(data().placements.find((p) => p.id === 'pl-7')?.status).toBe('active');
  });

  it('반려하면 대기 배치가 제거된다', () => {
    const { run, data } = setup();
    run((d) => A.rejectRequest(d, 'rq-1'));
    expect(data().placements.some((p) => p.id === 'pl-7')).toBe(false);
    expect(data().requests.find((r) => r.id === 'rq-1')?.status).toBe('반려됨');
  });

  it('같은 뷰에 나눠 배치하면 배분율 합 100%가 될 때까지 승인되지 않는다', () => {
    const { run, data } = setup();
    run((d) => A.placeAsset(d, 'a1', 'pw4'));
    expect(run((d) => A.approveRequest(d, 'rq-2'))).toMatch(/배분율/);
    run((d) => A.setShare(d, 'pl-8', 50));
    run((d) => A.setShare(d, 'pl-2', 50));
    expect(run((d) => A.approveRequest(d, 'rq-2'))).toBeNull();
    expect(ids(data()).some((i) => i.startsWith('share:'))).toBe(false);
  });
});

describe('합산 정합성', () => {
  it('상위 TR1 대비 하위 합 차이 경고가 FAN1을 연결·배치하면 사라진다', () => {
    const { run, data } = setup();
    const sum = validate(data()).find((i) => i.id === 'sum:pl-1');
    expect(sum?.title).toContain('3.0%');

    run((d) => A.approveTag(d, 'FAN1_KW'));
    run((d) => A.linkSlot(d, 'a3', '순시 전력', 'FAN1_KW'));
    run((d) => A.placeAsset(d, 'a3', 'pw3'));
    expect(run((d) => A.approveRequest(d, 'rq-2'))).toBeNull();
    expect(ids(data())).not.toContain('sum:pl-1');
  });
});

describe('코드 관리', () => {
  it('사용 중인 코드를 중지하면 영향 경고가 나온다', () => {
    const { run, data } = setup();
    expect(codeUsage(data(), 'unit', 'kW')).toBeGreaterThan(0);
    run((d) => A.toggleCode(d, 'unit', 'kW'));
    expect(ids(data())).toContain('code:unit:kW');
    run((d) => A.toggleCode(d, 'unit', 'kW'));
    expect(ids(data())).not.toContain('code:unit:kW');
  });

  it('중지된 단위 코드는 포인트에 지정할 수 없다', () => {
    const { run } = setup();
    run((d) => A.toggleCode(d, 'unit', 'bar'));
    expect(run((d) => A.setTagUnit(d, 'CP1_FLW', 'bar'))).toMatch(/사용할 수 없는/);
  });

  it('로컬 코드는 LOC_ 접두와 형식·중복을 검사한다', () => {
    const { run, data } = setup();
    expect(run((d) => A.addCode(d, 'energy', 'STEAM2', '스팀2'))).toMatch(/LOC_/);
    expect(run((d) => A.addCode(d, 'energy', 'LOC_steam', '스팀'))).toMatch(/형식/);
    expect(run((d) => A.addCode(d, 'energy', 'LOC_STEAM', '스팀'))).toMatch(/이미/);
    expect(run((d) => A.addCode(d, 'kind', 'LOC_X', 'x'))).toMatch(/고정/);
    expect(run((d) => A.addCode(d, 'energy', 'LOC_HOTW', '온수'))).toBeNull();
    expect(data().codes.some((c) => c.code === 'LOC_HOTW' && c.scope === '로컬')).toBe(true);
  });
});
