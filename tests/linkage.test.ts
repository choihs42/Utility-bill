import { describe, expect, it } from 'vitest';
import { makeStore } from '../src/store/store';
import * as A from '../src/domain/actions';
import { parseTagCsv } from '../src/domain/csv';
import { codeUsage, pathCode, pointName, tagStatus, validate } from '../src/domain/derive';
import type { Data } from '../src/domain/types';

// 화면 간 연동(코드·태그 → 트리 설계 → 포인트 매핑 → 점검)을 같은 데이터로 확인한다.
const setup = () => {
  const store = makeStore({ persist: false });
  const run = (fn: Parameters<ReturnType<typeof store.getState>['run']>[0]) => store.getState().run(fn).error;
  const data = () => store.getState().data;
  return { store, run, data };
};
const ids = (d: Data) => validate(d).map((i) => i.id);
const tag = (d: Data, raw: string) => d.tags.find((t) => t.raw === raw)!;
const status = (d: Data, raw: string) => tagStatus(tag(d, raw));

describe('수집 태그', () => {
  it('상태는 입력 내용에서 계산된다(미정리 → 정리됨 → 연결됨, 보류)', () => {
    const { run, data } = setup();
    expect(['CP1_FLW', 'CP1_RUN', 'CP1_KW', 'XYZ_T3'].map((r) => status(data(), r))).toEqual(['미정리', '정리됨', '연결됨', '보류']);
    run((d) => A.updateTag(d, 'CP1_FLW', { unit: 'Nm3/min' }));
    expect(status(data(), 'CP1_FLW')).toBe('정리됨');
    run((d) => A.linkTag(d, 'CP1_FLW', 'a2'));
    expect(status(data(), 'CP1_FLW')).toBe('연결됨');
  });

  it('파라미터를 바꾸면 비어 있거나 이전 기본값이던 단위가 새 기본 단위로 맞춰진다', () => {
    const { run, data } = setup();
    run((d) => A.updateTag(d, 'CP1_FLW', { param: 'PRS_BAR' }));
    expect(tag(data(), 'CP1_FLW').unit).toBe('bar');
    run((d) => A.updateTag(d, 'CP1_FLW', { unit: 'kW' }));
    run((d) => A.updateTag(d, 'CP1_FLW', { param: 'FLW_NM3' }));
    expect(tag(data(), 'CP1_FLW').unit).toBe('kW');
    expect(ids(data())).toContain('unit:CP1_FLW');
    expect(run((d) => A.updateTag(d, 'CP1_FLW', { param: 'NOPE' }))).toMatch(/파라미터/);
  });

  it('가져오기는 코드·코드명·약자로 파라미터를 찾고 중복을 건너뛴다', () => {
    const { run, data } = setup();
    const rows = parseTagCsv('원천 태그,장치,파라미터,단위\n# 메모\nCP1_KW,GW1\nCP2_KW,GW1,순시 전력\nCP2_PRS\tGW1\tPRS\nCP2_X,GW1,없는항목');
    expect(rows.map((r) => r.raw)).toEqual(['CP1_KW', 'CP2_KW', 'CP2_PRS', 'CP2_X']);
    expect(run((d) => A.importTags(d, rows))).toBeNull();
    expect(data().tags).toHaveLength(15);
    expect([tag(data(), 'CP2_KW').param, tag(data(), 'CP2_KW').unit]).toEqual(['PWR_KW', 'kW']);
    expect([tag(data(), 'CP2_PRS').param, tag(data(), 'CP2_PRS').unit]).toEqual(['PRS_BAR', 'bar']);
    expect(status(data(), 'CP2_X')).toBe('미정리');
    expect(run((d) => A.importTags(d, rows))).toMatch(/새로 추가할/);
  });

  it('일괄 수정은 하나라도 오류면 전체를 취소한다', () => {
    const { run, data } = setup();
    expect(run((d) => A.bulkUpdateTags(d, ['FAN1_KW', 'PMP1_KW'], { unit: 'kWh' }))).toBeNull();
    expect(ids(data())).toContain('unit:PMP1_KW');
    expect(run((d) => A.bulkUpdateTags(d, ['FAN1_A', 'PMP1_KW'], { unit: 'xx' }))).toMatch(/단위/);
    expect(tag(data(), 'FAN1_A').unit).toBe('A');
  });
});

describe('포인트 매핑', () => {
  it('파라미터·단위가 있어야 연결할 수 있고, 연결하면 포인트 ID와 포인트명이 생긴다', () => {
    const { run, data } = setup();
    expect(run((d) => A.linkTag(d, 'CP1_FLW', 'a2'))).toMatch(/파라미터와 단위/);
    run((d) => A.updateTag(d, 'CP1_FLW', { unit: 'Nm3/min' }));
    expect(run((d) => A.linkTag(d, 'CP1_FLW', 'a2'))).toBeNull();
    expect(tag(data(), 'CP1_FLW').ptId).toBe('PT-000111');
    expect(pointName(data(), tag(data(), 'CP1_FLW'))).toBe('컴프레서 CP-01 유량');
    run((d) => A.linkTag(d, 'CP1_FLW', null));
    expect(tag(data(), 'CP1_FLW').ptId).toBe('PT-000111');
    expect(status(data(), 'CP1_FLW')).toBe('정리됨');
  });

  it('같은 설비에 같은 파라미터는 연결할 수 없고, 복수 허용 파라미터는 가능하다', () => {
    const { run, data } = setup();
    run((d) => A.importTags(d, [{ raw: 'CP1_KW2', device: 'GW1', param: 'PWR_KW', unit: '' }, { raw: 'FAN1_B', device: 'GW2', param: 'A', unit: '' }]));
    expect(run((d) => A.linkTag(d, 'CP1_KW2', 'a2'))).toMatch(/이미 CP1_KW/);
    run((d) => A.linkTag(d, 'FAN1_A', 'a3'));
    expect(run((d) => A.linkTag(d, 'FAN1_B', 'a3'))).toBeNull();
    expect(ids(data()).some((i) => i.startsWith('dup:'))).toBe(false);
    expect(run((d) => A.updateTag(d, 'CP1_KW2', { param: 'CUR_A' }))).toBeNull();
  });

  it('연결된 태그는 파라미터·단위를 비울 수 없고, 보류하면 연결이 풀린다', () => {
    const { run, data } = setup();
    expect(run((d) => A.updateTag(d, 'CP1_KW', { param: null }))).toMatch(/비울 수 없습니다/);
    expect(run((d) => A.updateTag(d, 'CP1_KW', { unit: '' }))).toMatch(/비울 수 없습니다/);
    run((d) => A.setHold(d, ['CP1_PRS'], true));
    expect(tag(data(), 'CP1_PRS').assetId).toBeNull();
    expect(status(data(), 'CP1_PRS')).toBe('보류');
    expect(run((d) => A.linkTag(d, 'XYZ_T3', 'a2'))).toMatch(/보류/);
  });

  it('일괄 연결은 하나라도 오류면 전체를 취소한다', () => {
    const { run, data } = setup();
    expect(run((d) => A.bulkLinkTags(d, ['FAN1_KW', 'PMP1_KW'], 'a3'))).toMatch(/이미 FAN1_KW/);
    expect(tag(data(), 'FAN1_KW').assetId).toBeNull();
    expect(run((d) => A.bulkLinkTags(d, ['FAN1_KW', 'FAN1_A'], 'a3'))).toBeNull();
    expect(run((d) => A.bulkLinkTags(d, ['FAN1_KW', 'FAN1_A'], null))).toBeNull();
    expect(tag(data(), 'FAN1_A').assetId).toBeNull();
  });
});

describe('코드', () => {
  it('로컬 코드는 LOC_ 접두와 형식·중복을 검사하고, 코드명·약자·설명은 수정할 수 있다', () => {
    const { run, data } = setup();
    expect(run((d) => A.addCode(d, 'param', 'TEMP_C', '온도'))).toMatch(/LOC_/);
    expect(run((d) => A.addCode(d, 'param', 'LOC_temp', '온도'))).toMatch(/형식/);
    expect(run((d) => A.addCode(d, 'param', 'LOC_PWR_KW', ''))).toMatch(/코드명/);
    expect(run((d) => A.addCode(d, 'energy', 'LOC_STEAM', '스팀'))).toMatch(/이미/);
    expect(run((d) => A.addCode(d, 'param', 'LOC_TEMP', '온도', { abbr: 'TMP', unit: 'kW', multi: true }))).toBeNull();
    const c = data().codes.find((x) => x.code === 'LOC_TEMP')!;
    expect([c.scope, c.abbr, c.multi]).toEqual(['로컬', 'TMP', true]);
    run((d) => A.updateCode(d, 'param', 'LOC_TEMP', { label: '설비 온도', desc: '표면 온도' }));
    expect(data().codes.find((x) => x.code === 'LOC_TEMP')?.desc).toBe('표면 온도');
    expect(run((d) => A.updateCode(d, 'param', 'LOC_TEMP', { label: ' ' }))).toMatch(/비울 수 없/);
  });

  it('사용 중인 코드를 중지하면 점검 경고가 나오고, 중지된 파라미터는 지정할 수 없다', () => {
    const { run, data } = setup();
    expect(codeUsage(data(), 'unit', 'kW')).toBeGreaterThan(0);
    expect(codeUsage(data(), 'param', 'PWR_KW')).toBe(6);
    run((d) => A.toggleCode(d, 'unit', 'kW'));
    expect(ids(data())).toContain('code:unit:kW');
    run((d) => A.toggleCode(d, 'param', 'CUR_A'));
    expect(run((d) => A.updateTag(d, 'CP1_FLW', { param: 'CUR_A' }))).toMatch(/사용할 수 없는/);
    run((d) => A.toggleCode(d, 'unit', 'kW'));
    expect(ids(data())).not.toContain('code:unit:kW');
  });
});

describe('하드코딩 없는 설정', () => {
  it('코드 테이블의 접두사·형식을 바꾸면 새 코드부터 적용된다', () => {
    const { run, data } = setup();
    expect(run((d) => A.updateCodeGroup(d, 'unit', { prefix: '' }))).toBeNull();
    expect(run((d) => A.addCode(d, 'unit', 'Mpa', '메가파스칼'))).toBeNull();
    expect(data().codes.find((c) => c.code === 'Mpa')?.scope).toBe('로컬');
    expect(run((d) => A.updateCodeGroup(d, 'param', { prefix: 'lower' }))).toMatch(/접두사/);
    expect(run((d) => A.updateCodeGroup(d, 'param', { pattern: '([' }))).toMatch(/정규식/);
    expect(run((d) => A.updateCodeGroup(d, 'param', { label: ' ' }))).toMatch(/비울 수 없/);
    expect(run((d) => A.updateCodeGroup(d, 'param', { prefix: 'SITE_' }))).toBeNull();
    expect(run((d) => A.addCode(d, 'param', 'LOC_X', 'x'))).toMatch(/SITE_/);
  });

  it('합산 점검은 파라미터의 합산 속성과 트리의 합산 점검 옵션을 따른다', () => {
    const { run, data } = setup();
    expect(ids(data())).toContain('sum:pw1:PWR_KW');
    run((d) => A.setViewOption(d, 'power', { sumCheck: false }));
    expect(ids(data()).some((i) => i.startsWith('sum:'))).toBe(false);
    run((d) => A.setViewOption(d, 'power', { sumCheck: true }));
    run((d) => A.updateCode(d, 'param', 'PWR_KW', { sum: false }));
    expect(ids(data()).some((i) => i.startsWith('sum:'))).toBe(false);
    run((d) => A.updateCode(d, 'param', 'PWR_KW', { sum: true }));
    expect(ids(data())).toContain('sum:pw1:PWR_KW');
    run((d) => A.setViewOption(d, 'org', { sumCheck: true }));
    expect(ids(data()).filter((i) => i.startsWith('sum:'))).toContain('sum:pw1:PWR_KW');
  });

  it('포인트 ID 형식은 설정을 따르고 번호는 이어서 부여된다', () => {
    const { run, data } = setup();
    expect(run((d) => A.setPtFormat(d, 'P#', 6))).toMatch(/접두사/);
    expect(run((d) => A.setPtFormat(d, 'PT-', 2))).toMatch(/자릿수/);
    expect(run((d) => A.setPtFormat(d, 'EP', 5))).toBeNull();
    run((d) => A.linkTag(d, 'CP1_RUN', 'a2'));
    expect(tag(data(), 'CP1_RUN').ptId).toBe('EP00111');
  });
});

describe('설비', () => {
  it('설비 코드를 바꿔도 연결과 트리 배치가 유지된다(내부 ID 참조)', () => {
    const { run, data } = setup();
    expect(run((d) => A.addAsset(d, { code: 'CP1', name: '중복', type: 'COMP', energy: 'ELEC' }))).toMatch(/이미/);
    expect(run((d) => A.updateAsset(d, 'a2', { code: 'CP9' }))).toBeNull();
    expect(tag(data(), 'CP1_KW').assetId).toBe('a2');
    expect(pathCode(data(), 'pw6')).toBe('TR1_LV1_MCC2_CP9');
    expect(pathCode(data(), 'og6')).toBe('압연공장_유틸리티_CP9');
  });

  it('연결된 포인트나 트리 배치가 있는 설비는 삭제할 수 없다', () => {
    const { run } = setup();
    expect(run((d) => A.deleteAsset(d, 'a2'))).toMatch(/포인트/);
    expect(run((d) => A.deleteAsset(d, 'a6'))).toMatch(/트리/);
    run((d) => A.addAsset(d, { code: 'CP2', name: '컴프레서 CP-02', type: 'COMP', energy: 'ELEC' }));
    expect(run((d) => A.deleteAsset(d, 'a9'))).toBeNull();
  });
});

describe('트리 설계', () => {
  it('설비를 놓으면 설비 코드로 경로가 만들어지고, 중복·순환은 막는다', () => {
    const { run, data } = setup();
    expect(run((d) => A.placeAsset(d, 'power', 'a3', 'pw3'))).toBeNull();
    expect(pathCode(data(), 'nd-1')).toBe('TR1_LV1_MCC1_FAN1');
    expect(run((d) => A.placeAsset(d, 'power', 'a3', 'pw3'))).toMatch(/이미/);
    expect(run((d) => A.placeAsset(d, 'power', 'a0', 'pw5'))).toMatch(/자기 자신/);
    expect(run((d) => A.placeAsset(d, 'org', 'a3', 'pw3'))).toMatch(/같은 트리/);
  });

  it('그룹은 조직·공간 트리에서만 만들 수 있고 형식·중복을 검사한다', () => {
    const { run, data } = setup();
    expect(run((d) => A.addGroup(d, 'power', null, 'G1', 'g', 'FAC'))).toMatch(/그룹을 만들 수 없습니다/);
    expect(run((d) => A.addGroup(d, 'org', 'og1', '설비과', '설비과', 'PROC'))).toBeNull();
    expect(pathCode(data(), 'nd-1')).toBe('압연공장_설비과');
    expect(run((d) => A.addGroup(d, 'org', 'og1', '설비과', 'x', 'PROC'))).toMatch(/이미/);
    expect(run((d) => A.addGroup(d, 'org', 'og1', 'bad code', 'x', 'PROC'))).toMatch(/코드/);
    expect(run((d) => A.addGroup(d, 'org', 'og1', 'ok1', 'x', 'NOPE'))).toMatch(/유형/);
  });

  it('노드를 옮기거나 코드를 바꾸면 하위 경로가 함께 바뀌고, 순환 이동과 하위가 있는 삭제는 막는다', () => {
    const { run, data } = setup();
    run((d) => A.updateNode(d, 'pw4', { parent: 'pw1' }));
    expect(pathCode(data(), 'pw6')).toBe('TR1_MCC2_CP1');
    run((d) => A.updateNode(d, 'og2', { code: '압연' }));
    expect(pathCode(data(), 'og5')).toBe('압연공장_압연_압연1라인_RM1');
    expect(run((d) => A.updateNode(d, 'pw1', { parent: 'pw3' }))).toMatch(/하위 노드 아래/);
    expect(run((d) => A.deleteNode(d, 'pw2'))).toMatch(/하위/);
    expect(run((d) => A.deleteNode(d, 'pw5'))).toBeNull();
  });

  it('같은 설비를 세 트리에 놓을 수 있고, 한 트리에서 나누면 균등 배분되며 합이 틀리면 오류가 뜬다', () => {
    const { run, data } = setup();
    expect(['power', 'org', 'space'].every((v) => data().nodes.some((n) => n.view === v && n.assetId === 'a1'))).toBe(true);
    run((d) => A.placeAsset(d, 'power', 'a1', 'pw4'));
    expect(data().nodes.filter((n) => n.view === 'power' && n.assetId === 'a1').map((n) => n.share)).toEqual([50, 50]);
    expect(ids(data()).some((i) => i.startsWith('share:'))).toBe(false);
    run((d) => A.setShare(d, 'pw5', 70));
    expect(ids(data())).toContain('share:power:a1');
    expect(run((d) => A.setShare(d, 'og1', 50))).toMatch(/설비 노드/);
  });
});

describe('점검', () => {
  it('처음 샘플에서 미정리·미연결 태그, 포인트 없는 설비, 미배치를 알려준다(구조용 설비는 제외)', () => {
    const { data } = setup();
    const got = ids(data());
    expect(got).toEqual(expect.arrayContaining(['untidy', 'unlinked', 'nopoint:a3', 'nopoint:a5', 'cov:power:a3', 'cov:power:a4', 'cov:power:a5']));
    expect(got).not.toContain('nopoint:a6');
    expect(validate(data()).filter((i) => i.severity === '오류')).toHaveLength(0);
  });

  it('전력계통 합산 경고는 FAN1을 연결·배치하면 사라지고, 허용 오차 설정을 따른다', () => {
    const { run, data } = setup();
    expect(validate(data()).find((i) => i.id === 'sum:pw1:PWR_KW')?.title).toContain('3.0%');
    run((d) => A.setTolerance(d, 5));
    expect(ids(data())).not.toContain('sum:pw1:PWR_KW');
    run((d) => A.setTolerance(d, 2));
    run((d) => A.linkTag(d, 'FAN1_KW', 'a3'));
    run((d) => A.placeAsset(d, 'power', 'a3', 'pw3'));
    expect(ids(data())).not.toContain('sum:pw1:PWR_KW');
    expect(ids(data())).not.toContain('nopoint:a3');
    run((d) => A.deleteNode(d, 'nd-1'));
    expect(ids(data())).toContain('sum:pw1:PWR_KW');
    expect(run((d) => A.setTolerance(d, 80))).toMatch(/0~50/);
  });

  it('변경 이력이 남고, 되돌리기로 직전 상태를 복원한다', () => {
    const { store, run, data } = setup();
    run((d) => A.updateTag(d, 'CP1_FLW', { unit: 'Nm3/min' }));
    expect(data().log[0].text).toContain('태그 수정');
    expect(status(data(), 'CP1_FLW')).toBe('정리됨');
    store.getState().undo();
    expect(status(data(), 'CP1_FLW')).toBe('미정리');
    expect(store.getState().past).toHaveLength(0);
  });
});
