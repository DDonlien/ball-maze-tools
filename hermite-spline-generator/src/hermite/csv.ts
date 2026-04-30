import { GenerationResult, SegmentResult, Vec3, vec } from "./math";

export interface ImportedCsv {
  controlPoints: Vec3[];
  tangents: Vec3[];
}

function escapeCsv(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function formatNumber(value: number): string {
  if (Math.abs(value) < 1e-12) return "0";
  return Number(value.toFixed(12)).toString();
}

function vecToCsvCell(value: Vec3): string {
  return `[${formatNumber(value.x)}, ${formatNumber(value.y)}, ${formatNumber(value.z)}]`;
}

export function exportResultCsv(result: GenerationResult): string {
  const headers = ["Parameter", "Reference", ...result.parallelCurves.map((_, i) => `Parallel_${i}`)];
  const rows = [headers];
  const refData: Array<[string, Vec3]> = [];
  const referenceSegments = result.referenceSegments ?? result.controlPoints.slice(0, -1).map((p0, index) => ({
    p0,
    p1: result.controlPoints[index + 1],
    t0: result.segmentTangents?.[index]?.[0] ?? result.tangents[index],
    t1: result.segmentTangents?.[index]?.[1] ?? result.tangents[index + 1],
  }));

  for (let i = 0; i < referenceSegments.length; i += 1) {
    const segment = referenceSegments[i];
    refData.push([`P${i}`, segment.p0]);
    refData.push([`T${i}`, segment.t0]);
    refData.push([`P${i + 1}`, segment.p1]);
    refData.push([`T${i + 1}`, segment.t1]);
  }

  const parallelData = result.parallelCurves.map((curve) => flattenCurve(curve));
  for (let i = 0; i < refData.length; i += 1) {
    rows.push([
      refData[i][0],
      vecToCsvCell(refData[i][1]),
      ...parallelData.map((curve) => curve[i] ? vecToCsvCell(curve[i]) : ""),
    ]);
  }

  return rows.map((row) => row.map((cell) => escapeCsv(cell)).join(",")).join("\r\n");
}

function flattenCurve(curve: SegmentResult[]): Vec3[] {
  const values: Vec3[] = [];
  for (const segment of curve) {
    values.push(segment.p0, segment.t0, segment.p1, segment.t1);
  }
  return values;
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}

export function importReferenceCsv(text: string): ImportedCsv {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error("CSV 内容为空或缺少数据行");
  const header = rows[0].map((value) => value.trim().toLowerCase());
  const parameterIndex = header.indexOf("parameter");
  const referenceIndex = header.indexOf("reference");
  if (parameterIndex < 0 || referenceIndex < 0) throw new Error("CSV 需要包含 Parameter 和 Reference 列");

  const pointMap = new Map<number, Vec3>();
  const tangentMap = new Map<number, Vec3>();
  for (const row of rows.slice(1)) {
    const key = row[parameterIndex]?.trim();
    const value = parseVec(row[referenceIndex]);
    const match = /^([pt])(\d+)$/i.exec(key ?? "");
    if (!match || !value) continue;
    const index = Number(match[2]);
    if (match[1].toUpperCase() === "P") pointMap.set(index, value);
    else tangentMap.set(index, value);
  }

  const controlPoints = [...pointMap.entries()].sort((a, b) => a[0] - b[0]).map((entry) => entry[1]);
  const tangents = [...tangentMap.entries()].sort((a, b) => a[0] - b[0]).map((entry) => entry[1]);
  if (controlPoints.length < 2 || tangents.length < 2) throw new Error("CSV 至少需要 P0/P1 和 T0/T1");
  if (controlPoints.length !== tangents.length) throw new Error("控制点数量和切线数量不一致");

  return { controlPoints, tangents };
}

function parseVec(value: string | undefined): Vec3 | null {
  if (!value) return null;
  const matches = value.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi);
  if (!matches || matches.length < 2) return null;
  return vec(Number(matches[0]), Number(matches[1]), Number(matches[2] ?? 0));
}
