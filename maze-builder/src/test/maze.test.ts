import { describe, expect, it } from "vitest";
import railConfigCsv from "../../rail_config.csv?raw";
import { loadConfigFromCsv } from "../maze/csv";
import { calculateOccupiedCells, MazeGenerator } from "../maze/generator";
import { Vector3 } from "../maze/types";

describe("TypeScript maze port", () => {
  it("loads UE CSV config and recognizes key rail types", () => {
    const config = loadConfigFromCsv(railConfigCsv);
    expect(config.size).toBeGreaterThan(30);
    expect([...config.values()].some((rail) => rail.isStart)).toBe(true);
    expect([...config.values()].some((rail) => rail.isEnd)).toBe(true);
    expect(config.get("BP_Start_F_X1_Y1_Z1_Rail")?.exitsLogic[0].Pos.toDict()).toEqual({ x: 1, y: 0, z: 0 });
  });

  it("matches occupied cell behavior for a downward bump", () => {
    const cells = calculateOccupiedCells("BP_Bump_FD_X2_Y1_Z2_Rail", new Vector3(-2, 2, 0), new Vector3(2, 1, 2), 0);
    expect(cells.sort()).toEqual([
      [-1, 2, -1],
      [-1, 2, 0],
      [-2, 2, -1],
      [-2, 2, 0],
    ].sort());
  });

  it("keeps forward-up occupied cells above the start cell", () => {
    const cells = calculateOccupiedCells("BP_Bump_FU_X2_Y1_Z2_Rail", new Vector3(0, 0, 0), new Vector3(2, 1, 2), 0);
    expect(cells.sort()).toEqual([
      [0, 0, 0],
      [0, 0, 1],
      [1, 0, 0],
      [1, 0, 1],
    ].sort());
  });

  it("keeps curve-down exits below their entry height", () => {
    const config = loadConfigFromCsv(railConfigCsv);
    const downCurves = [...config.values()].filter((rail) => rail.rowName.includes("_D90_"));
    expect(downCurves.length).toBeGreaterThan(0);

    for (const rail of downCurves) {
      expect(rail.exitsLogic[0].LocalRot.p).toBeLessThan(0);
      expect(rail.exitsLogic[0].Pos.z).toBeLessThan(0);
    }
  });

  it("generates a connected layout in the exported JSON shape", () => {
    const config = loadConfigFromCsv(railConfigCsv);
    const layout = new MazeGenerator(config, { seed: 20260425, targetDifficulty: 15 }).generate();
    expect(layout.MapMeta.RailCount).toBe(layout.Rail.length);
    expect(layout.Rail.filter((rail) => rail.Rail_ID.includes("Start"))).toHaveLength(1);
    expect(layout.Rail.filter((rail) => rail.Rail_ID.includes("End"))).toHaveLength(1);
    expect(layout.MapMeta.MazeDiff).toBeGreaterThanOrEqual(15);
    for (const rail of layout.Rail) {
      expect(Math.abs(rail.Pos_Abs.x % 16)).toBe(0);
      expect(Math.abs(rail.Pos_Abs.y % 16)).toBe(0);
      expect(Math.abs(rail.Pos_Abs.z % 16)).toBe(0);
    }
  });
});
