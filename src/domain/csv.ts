// 원천 태그 가져오기용 단순 CSV/TSV 파서. 열 순서: 원천 태그, 장치, 파라미터, 단위
export interface TagRow {
  raw: string;
  device: string;
  param: string;
  unit: string;
}

export function parseTagCsv(text: string): TagRow[] {
  const rows: TagRow[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  lines.forEach((line, i) => {
    const cells = line.split(line.includes('\t') ? '\t' : ',').map((c) => c.trim());
    if (i === 0 && /^(raw|원천\s*태그)$/i.test(cells[0])) return; // 머리글 건너뜀
    rows.push({ raw: cells[0] ?? '', device: cells[1] ?? '', param: cells[2] ?? '', unit: cells[3] ?? '' });
  });
  return rows;
}
