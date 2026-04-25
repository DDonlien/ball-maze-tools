import { GRID_TO_WORLD_SCALE } from "./constants";
import { RailConfigItem, RotAbs, Vector3 } from "./types";

function parseCsvRows(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    const next = input[i + 1];

    if (ch === '"' && inQuotes && next === '"') {
      cell += '"';
      i += 1;
    } else if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some((value) => value.trim() !== "")) rows.push(row);
  }

  return rows;
}

function normalizeNumber(value: string | undefined, fallback = 0): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getRowValue(row: Record<string, string>, names: string[]): string | undefined {
  for (const name of names) {
    const value = row[name];
    if (value !== undefined && value.trim() !== "") return value;
  }
  return undefined;
}

function parseSize(row: Record<string, string>, name: string): Vector3 {
  const sx = normalizeNumber(row.SizeX, NaN);
  const sy = normalizeNumber(row.SizeY, NaN);
  const sz = normalizeNumber(row.SizeZ, NaN);
  if ([sx, sy, sz].every(Number.isFinite)) {
    return new Vector3(Math.trunc(sx), Math.trunc(sy), Math.trunc(sz));
  }

  const sizeColumn = row.Size?.match(/X\s*=\s*(\d+).*Y\s*=\s*(\d+).*Z\s*=\s*(\d+)/i);
  if (sizeColumn) {
    return new Vector3(Number(sizeColumn[1]), Number(sizeColumn[2]), Number(sizeColumn[3]));
  }

  const fromName = name.match(/_X(\d+)_Y(\d+)_Z(\d+)/i);
  if (fromName) {
    return new Vector3(Number(fromName[1]), Number(fromName[2]), Number(fromName[3]));
  }

  return new Vector3(1, 1, 1);
}

function parseSpinDiff(text: string, startIndex: number): number[] {
  const spinMatch = text.slice(startIndex).match(/SpinDiff=\(X=([\d.-]+),Y=([\d.-]+),Z=([\d.-]+),W=([\d.-]+)\)/);
  if (!spinMatch) return [1, 1, 1, 1];
  return spinMatch.slice(1).map((value) => Number(value));
}

function parseExitArray(exitStr: string) {
  const exits = [];
  const pattern =
    /Pos=\(X=([\d.-]+),Y=([\d.-]+),Z=([\d.-]+)\),BaseRot=\(P=([\d.-]+),Y=([\d.-]+),R=([\d.-]+)\)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(exitStr)) !== null) {
    const [px, py, pz, rp, ry, rr] = match.slice(1).map((value) => Number(value));
    const localRot: RotAbs = { p: rp, y: ry, r: rr };
    exits.push({
      Pos: new Vector3(
        Math.round(px / GRID_TO_WORLD_SCALE),
        Math.round(py / GRID_TO_WORLD_SCALE),
        Math.round(pz / GRID_TO_WORLD_SCALE),
      ),
      RotOffset: Math.trunc(ry / 90) % 4,
      LocalRot: localRot,
      SpinDiff: parseSpinDiff(exitStr, pattern.lastIndex),
    });
  }

  return exits;
}

export function loadConfigFromCsv(csvText: string): Map<string, RailConfigItem> {
  const rows = parseCsvRows(csvText);
  if (rows.length < 2) throw new Error("CSV does not contain any rail rows.");

  const headers = rows[0].map((header) => header.trim());
  const config = new Map<string, RailConfigItem>();

  for (const columns of rows.slice(1)) {
    const row = Object.fromEntries(headers.map((header, index) => [header, columns[index] ?? ""]));
    const rowName = getRowValue(row, ["RowName", "Name"]);
    if (!rowName) continue;

    const diffBase = normalizeNumber(getRowValue(row, ["Diff_Base", "Difficulty"]), 0);
    const sizeRev = parseSize(row, rowName);
    let exitsLogic = row.Exit_Array ? parseExitArray(row.Exit_Array) : [];

    if (exitsLogic.length === 0) {
      exitsLogic = [1, 2, 3]
        .map((idx) => {
          const pos = row[`Exit${idx}Pos`];
          if (!pos) return null;
          const [x, y, z] = pos
            .replace(/^"|"$/g, "")
            .split(",")
            .map((value) => Number(value));
          if (![x, y, z].every(Number.isFinite)) return null;
          const rot = normalizeNumber(row[`Exit${idx}Rot`], 0);
          return {
            Pos: new Vector3(x, y, z),
            RotOffset: Math.trunc(rot) % 4,
            LocalRot: { p: 0, y: rot * 90, r: 0 },
            SpinDiff: [1, 1, 1, 1],
          };
        })
        .filter((exit): exit is NonNullable<typeof exit> => exit !== null);
    }

    const railType = row.Type?.trim().toLowerCase() || rowName.toLowerCase();
    config.set(rowName, {
      rowName,
      diffBase,
      sizeRev,
      exitsLogic,
      isEnd: railType.includes("end"),
      isStart: railType.includes("start"),
      isCheckpoint: railType.includes("checkpoint"),
    });
  }

  return config;
}
