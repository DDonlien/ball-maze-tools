import { describe, expect, it } from "vitest";
import railConfigCsv from "../../rail_config.csv?raw";
import { loadConfigFromCsv } from "../maze/csv";
import { calculateOccupiedCells, calculateOccupiedCellsWithRotAbs, MazeGenerator } from "../maze/generator";
import { Vector3 } from "../maze/types";

function expectedDirFromRot(rot: { p: number; y: number; r: number }): "+X" | "+Y" | "-X" | "-Y" | "+Z" | "-Z" {
  const pitch = ((rot.p % 360) + 360) % 360;
  if (Math.abs(pitch - 90) < 1) return "+Z";
  if (Math.abs(pitch - 270) < 1) return "-Z";
  const yawIndex = (((Math.trunc(rot.y / 90) % 4) + 4) % 4);
  return ["+X", "+Y", "-X", "-Y"][yawIndex] as "+X" | "+Y" | "-X" | "-Y";
}

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

  it("rotates occupied cells by full UE absolute rotation", () => {
    const cells = calculateOccupiedCellsWithRotAbs(
      "BP_Curve_U90_Borderless_Caved_X3_Y1_Z3_Rail",
      new Vector3(0, 0, 0),
      new Vector3(3, 1, 3),
      { p: 90, y: 90, r: 0 },
    );
    expect(cells).toContainEqual([0, 0, 0]);
    expect(cells.some((cell) => cell[1] < 0)).toBe(true);
    expect(cells.some((cell) => cell[2] > 0)).toBe(true);
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

  it("matches right-handed L90 curve overrides to their model direction", () => {
    const config = loadConfigFromCsv(railConfigCsv);
    const expected = [
      ["BP_Curve_L90_X4_Y4_Z1_Rail", new Vector3(4, 4, 1), { x: 3, y: 4, z: 0 }],
      ["BP_Curve_L90_Borderless_O_X2_Y2_Z1_Rail", new Vector3(2, 2, 1), { x: 1, y: 2, z: 0 }],
    ] as const;

    for (const [railId, size, exitPos] of expected) {
      const curve = config.get(railId);
      expect(curve?.exitsLogic[0].Pos.toDict()).toEqual(exitPos);
      expect(curve?.exitsLogic[0].LocalRot.y).toBe(90);
      expect(curve?.exitsLogic[0].RotOffset).toBe(1);

      const cells = calculateOccupiedCells(railId, new Vector3(0, 0, 0), size, 0);
      expect(cells.some((cell) => cell[1] > 0)).toBe(true);
      expect(cells.some((cell) => cell[1] < 0)).toBe(false);
    }
  });

  it("keeps other L90 curves left-handed", () => {
    const config = loadConfigFromCsv(railConfigCsv);
    const curve = config.get("BP_Curve_L90_X3_Y3_Z1_Rail");
    expect(curve?.exitsLogic[0].Pos.toDict()).toEqual({ x: 2, y: -3, z: 0 });
    expect(curve?.exitsLogic[0].LocalRot.y).toBe(-90);
  });

  it("keeps Curve R90 X3 exit right while matching its left-side model footprint", () => {
    const config = loadConfigFromCsv(railConfigCsv);
    const curve = config.get("BP_Curve_R90_X3_Y3_Z1_Rail");
    expect(curve?.exitsLogic[0].Pos.toDict()).toEqual({ x: 2, y: 3, z: 0 });
    expect(curve?.exitsLogic[0].LocalRot.y).toBe(90);

    const cells = calculateOccupiedCells("BP_Curve_R90_X3_Y3_Z1_Rail", new Vector3(0, 0, 0), new Vector3(3, 3, 1), 0);
    expect(cells.some((cell) => cell[1] < 0)).toBe(true);
    expect(cells.some((cell) => cell[1] > 0)).toBe(false);
  });

  it("keeps turn footprints aligned with their exit side except known asset overrides", () => {
    const config = loadConfigFromCsv(railConfigCsv);
    const footprintOverrides = new Set([
      "BP_Curve_R90_X3_Y3_Z1_Rail",
    ]);

    for (const rail of config.values()) {
      if (footprintOverrides.has(rail.rowName)) continue;
      const horizontal = rail.rowName.includes("_L90_") || rail.rowName.includes("_R90_");
      const vertical = rail.rowName.includes("_U90_") || rail.rowName.includes("_D90_");
      if (!horizontal && !vertical) continue;

      const axis = horizontal ? 1 : 2;
      if (horizontal && rail.sizeRev.y <= 1) continue;
      if (vertical && rail.sizeRev.z <= 1) continue;

      const exit = rail.exitsLogic.find((item) => item.Pos.asTuple()[axis] !== 0);
      if (!exit) continue;
      const exitValue = exit.Pos.asTuple()[axis];
      const expectedPositive = exitValue > 0;

      const cells = calculateOccupiedCells(rail.rowName, new Vector3(0, 0, 0), rail.sizeRev, 0);
      const hasNegative = cells.some((cell) => cell[axis] < 0);
      const hasPositive = cells.some((cell) => cell[axis] > 0);
      expect({ rail: rail.rowName, axis, hasNegative, hasPositive, exitValue }).toEqual({
        rail: rail.rowName,
        axis,
        hasNegative: !expectedPositive,
        hasPositive: expectedPositive,
        exitValue,
      });
    }
  });

  it("treats bounds as actual odd grid size", () => {
    const config = loadConfigFromCsv(railConfigCsv);
    const tiny = new MazeGenerator(config, { bounds: new Vector3(1, 1, 1), targetDifficulty: 1 });
    expect(tiny["isInBounds"]([[0, 0, 0]])).toBe(true);
    expect(tiny["isInBounds"]([[1, 0, 0]])).toBe(false);

    const three = new MazeGenerator(config, { bounds: new Vector3(3, 3, 3), targetDifficulty: 1 });
    expect(three["isInBounds"]([[-1, 0, 0], [1, 0, 0]])).toBe(true);
    expect(three["isInBounds"]([[-2, 0, 0]])).toBe(false);
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

  it("disables self-spin by default", () => {
    const config = loadConfigFromCsv(railConfigCsv);
    const generator = new MazeGenerator(config, { seed: 20260425, targetDifficulty: 15 });
    const layout = generator.generate();
    expect(layout.MapMeta.SpinCount).toBe(0);
    expect(layout.MapMeta.MaxSpins).toBe(0);
    expect(generator.placedRails.every((rail) => rail.spinRot === 0)).toBe(true);
  });

  it("never exceeds the configured self-spin count", () => {
    const config = loadConfigFromCsv(railConfigCsv);
    const generator = new MazeGenerator(config, { seed: 20260425, targetDifficulty: 15, maxSpins: 1 });
    const layout = generator.generate();
    expect(layout.MapMeta.SpinCount).toBeLessThanOrEqual(1);
    expect(generator.placedRails.filter((rail) => rail.spinRot !== 0)).toHaveLength(layout.MapMeta.SpinCount ?? 0);
  });

  it("transforms FR90 exits through pitch for the reported seed", () => {
    const config = loadConfigFromCsv(railConfigCsv);
    const layout = new MazeGenerator(config, {
      seed: 790943075,
      targetDifficulty: 24,
      targetCheckpoints: 3,
      maxSpins: 0,
      bounds: new Vector3(13, 9, 5),
    }).generate();
    const rail = layout.Rail.find((item) => item.Rail_ID === "BP_Straight_FR90_X1_Y1_Z1_Rail" && Math.abs(item.Rot_Abs.p - 90) < 1);
    expect(rail).toBeDefined();
    expect(rail?.Exit.some((exit) => exit.Exit_Pos_Rev.z !== rail.Pos_Rev.z)).toBe(true);
    for (const exit of rail?.Exit ?? []) {
      expect(exit.Exit_Dir_Abs).toBe(expectedDirFromRot(exit.Exit_Rot_Abs));
    }
  });

  it("derives every exported exit direction from exit rotation instead of offset direction", () => {
    const config = loadConfigFromCsv(railConfigCsv);
    const layout = new MazeGenerator(config, {
      seed: 790943075,
      targetDifficulty: 24,
      targetCheckpoints: 3,
      maxSpins: 0,
      bounds: new Vector3(13, 9, 5),
    }).generate();

    for (const rail of layout.Rail) {
      for (const exit of rail.Exit) {
        expect({ rail: rail.Rail_ID, index: exit.Index, dir: exit.Exit_Dir_Abs }).toEqual({
          rail: rail.Rail_ID,
          index: exit.Index,
          dir: expectedDirFromRot(exit.Exit_Rot_Abs),
        });
      }
    }
  });

  it("places requested checkpoints on fork branches and reports segment difficulty", () => {
    const config = loadConfigFromCsv(railConfigCsv);
    const layout = new MazeGenerator(config, {
      seed: 20260425,
      targetDifficulty: 15,
      targetCheckpoints: 2,
      maxSpins: 4,
      bounds: new Vector3(13, 13, 5),
    }).generate();

    const checkpoints = layout.Rail.filter((rail) => rail.Rail_ID.toLowerCase().includes("checkpoint"));
    expect(checkpoints).toHaveLength(2);
    expect(layout.MapMeta.CheckpointCount).toBe(2);
    expect(layout.MapMeta.SegmentDiffs).toHaveLength(3);

    for (const checkpoint of checkpoints) {
      const parent = layout.Rail.find((rail) => rail.Rail_Index === checkpoint.Prev_Index);
      expect(parent).toBeDefined();
      expect(parent?.Exit.length).toBeGreaterThanOrEqual(2);
      expect(parent?.Exit.some((exit) => exit.TargetInstanceID === checkpoint.Rail_Index)).toBe(true);
    }
  });
});
