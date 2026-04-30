import { DEFAULT_GENERATOR_OPTIONS, GRID_TO_WORLD_SCALE } from "./constants";
import { SeededRandom } from "./random";
import {
  DirAbs,
  GenerationLogEntry,
  GeneratorOptions,
  MazeLayout,
  OpenConnector,
  RailConfigItem,
  RailInstance,
  RotAbs,
  Vector3,
} from "./types";

type CellKey = `${number},${number},${number}`;

function keyOf(cell: [number, number, number]): CellKey {
  return `${cell[0]},${cell[1]},${cell[2]}`;
}

function cloneRot(rot: RotAbs): RotAbs {
  return { p: rot.p, y: rot.y, r: rot.r };
}

function mod360(value: number): number {
  return ((value % 360) + 360) % 360;
}

function boundRadius(size: number): number {
  return Math.max(0, Math.floor((size - 1) / 2));
}

export function calculateOccupiedCells(
  railId: string,
  pos: Vector3,
  size: Vector3,
  rotIdx: number,
  rollIdx = 0,
): [number, number, number][] {
  let yMin = 0;
  let yMax = 0;
  let zMin = 0;
  let zMax = 0;
  const rid = railId.toUpperCase();

  if (rid.includes("_L90_") || rid.includes("_FL90_")) {
    yMin = -(size.y - 1);
  } else if (rid.includes("_R90_") || rid.includes("_FR90_")) {
    yMax = size.y - 1;
  } else if (rid.includes("_T_") || rid.includes("_CR_")) {
    yMin = -(size.y - 1);
    yMax = size.y - 1;
  }

  if (rid.includes("_U90_") || rid.includes("_FU_")) {
    zMax = size.z - 1;
  } else if (rid.includes("_D90_") || rid.includes("_FD_")) {
    zMin = -(size.z - 1);
  }

  const cells: [number, number, number][] = [];
  for (let lx = 0; lx < size.x; lx += 1) {
    for (let ly = yMin; ly <= yMax; ly += 1) {
      for (let lz = zMin; lz <= zMax; lz += 1) {
        const rotated = new Vector3(lx, ly, lz).rotateX(rollIdx).rotateZ(rotIdx);
        cells.push([pos.x + rotated.x, pos.y + rotated.y, pos.z + rotated.z]);
      }
    }
  }

  return cells;
}

export class MazeGenerator {
  readonly logs: GenerationLogEntry[] = [];
  readonly options: GeneratorOptions;
  placedRails: RailInstance[] = [];
  occupiedCells = new Map<CellKey, number>();
  openList: OpenConnector[] = [];
  currentTotalDifficulty = 0;
  backtrackCount = 0;
  private globalIndexCounter = 0;
  private placedCheckpointsCount = 0;
  private segmentDiffAcc = 0;
  private random: SeededRandom;
  private globalBounds?: [number, number, number, number, number, number];

  constructor(
    private configMap: Map<string, RailConfigItem>,
    options: Partial<GeneratorOptions> = {},
  ) {
    this.options = { ...DEFAULT_GENERATOR_OPTIONS, ...options };
    this.random = new SeededRandom(this.options.seed);
  }

  generate(): MazeLayout {
    this.log("info", `Start Generating... Target Diff: ${this.options.targetDifficulty}`);
    const startCandidates = [...this.configMap.values()].filter((item) => item.isStart);
    if (startCandidates.length === 0) throw new Error("No Start Rail defined.");

    const start = this.random.choice(startCandidates);
    const radiusX = boundRadius(this.options.bounds.x);
    const radiusY = boundRadius(this.options.bounds.y);
    const minX = -radiusX;
    const maxX = radiusX - start.sizeRev.x + 1;
    const minY = -radiusY;
    const maxY = radiusY - start.sizeRev.y + 1;
    const startPos = new Vector3(this.random.int(Math.min(minX, maxX), Math.max(minX, maxX)), this.random.int(Math.min(minY, maxY), Math.max(minY, maxY)), 0);

    const startResult = this.placeRailV2(start.rowName, startPos, 0, { p: 0, y: 0, r: 0 }, 0, 1, -1, 0);
    if (typeof startResult === "string") throw new Error(`Start Rail Placement Failed: ${startResult}`);
    this.log("success", `Start: ${start.rowName} at ${startPos.asTuple().join(",")}`);

    const segmentTargetDiff = this.options.targetDifficulty / (this.options.targetCheckpoints + 1);

    while (true) {
      const mustEnd = this.currentTotalDifficulty >= this.options.targetDifficulty;
      const triggerCheckpoint =
        this.placedCheckpointsCount < this.options.targetCheckpoints && this.segmentDiffAcc >= segmentTargetDiff;

      if (this.openList.length === 0) {
        if (!this.backtrackLastRail()) break;
        continue;
      }

      const connector = this.openList.splice(this.random.int(0, this.openList.length - 1), 1)[0];
      let candidates = this.getCandidates(mustEnd, triggerCheckpoint).filter(
        (candidate) => !connector.forbiddenCandidates.has(candidate),
      );
      const spinOptions = connector.spinDiffs
        .map((ratio, spinRot) => ({ spinRot, ratio }))
        .filter((item) => item.ratio > 0);

      let success = false;
      let attempts = 0;
      let placed: RailInstance | null = null;
      let placedId = "";
      const failReasons = new Map<string, number>();

      while (candidates.length > 0 && !success) {
        const candidateIdx = this.random.int(0, candidates.length - 1);
        const candidate = candidates.splice(candidateIdx, 1)[0];

        for (const { spinRot, ratio } of spinOptions) {
          attempts += 1;
          const [targetRot, targetRotAbs, targetRoll] = this.calculateRailTransform(connector, spinRot);
          const result = this.placeRailV2(
            candidate,
            connector.targetPos,
            targetRot,
            targetRotAbs,
            connector.accumulatedDiff,
            ratio,
            connector.parentId,
            targetRoll,
          );

          if (typeof result !== "string") {
            const parent = this.placedRails.find((rail) => rail.railIndex === connector.parentId);
            if (parent) {
              parent.nextIndices.push(result.railIndex);
              parent.exitStatus[connector.parentExitIdx].IsConnected = true;
              parent.exitStatus[connector.parentExitIdx].TargetID = result.railIndex;
            }

            result.forbiddenSiblings = new Set(connector.forbiddenCandidates);
            placed = result;
            placedId = candidate;
            success = true;
            this.segmentDiffAcc += result.diffAct;
            break;
          }

          failReasons.set(result, (failReasons.get(result) ?? 0) + 1);
        }
      }

      if (!success) {
        this.log("fail", `Step failed: ${JSON.stringify(Object.fromEntries(failReasons))}`);
      } else if (placed) {
        this.log(
          "success",
          `[Step ${placed.railIndex}] ${placedId}, attempts=${attempts}, diff=${placed.diffAct.toFixed(2)}, backtracks=${this.backtrackCount}`,
        );
      }

      if (mustEnd && success) {
        this.log("success", `Target difficulty reached (${this.currentTotalDifficulty.toFixed(2)}).`);
        break;
      }
    }

    return this.exportLayout();
  }

  exportLayout(): MazeLayout {
    const rails = this.placedRails.map((rail) => {
      const cfg = this.requireConfig(rail.railId);
      const exits = rail.exitStatus.map((status, i) => {
        const logicOffset = cfg.exitsLogic[i].Pos;
        const exitLocalRotIdx = cfg.exitsLogic[i].RotOffset;
        const exitAbsRotIdx = (rail.rotIndex + exitLocalRotIdx) % 4;
        const worldLogicPos = rail.posRev.add(logicOffset.rotateZ(rail.rotIndex));
        const localRot = cfg.exitsLogic[i].LocalRot;
        const exitRotAbs = {
          p: mod360(rail.rotAbs.p + localRot.p),
          y: mod360(rail.rotAbs.y + localRot.y),
          r: mod360(rail.rotAbs.r + localRot.r),
        };

        let exitDirAbs: DirAbs;
        if (Math.abs(localRot.p - 90) < 1) exitDirAbs = "+Z";
        else if (Math.abs(localRot.p + 90) < 1 || Math.abs(localRot.p - 270) < 1) exitDirAbs = "-Z";
        else exitDirAbs = this.getUeDirStr(exitAbsRotIdx);

        return {
          Index: i,
          Exit_Pos_Rev: worldLogicPos.toDict(),
          Exit_Pos_Abs: worldLogicPos.toWorldDict(GRID_TO_WORLD_SCALE),
          Exit_Rot_Abs: exitRotAbs,
          Exit_Dir_Abs: exitDirAbs,
          IsConnected: status.IsConnected,
          TargetInstanceID: status.TargetID !== -1 ? status.TargetID : -1,
        };
      });

      return {
        Rail_Index: rail.railIndex,
        Rail_ID: rail.railId,
        Pos_Rev: rail.posRev.toDict(),
        Pos_Abs: rail.posRev.toWorldDict(GRID_TO_WORLD_SCALE),
        Rot_Abs: cloneRot(rail.rotAbs),
        Dir_Abs: this.getUeDirStr(rail.rotIndex),
        Size_Rev: rail.sizeRev.toDict(),
        Occupied_Cells_Rev: rail.occupiedCellsRev.map((cell) => cell.toDict()),
        Diff_Base: 0,
        Diff_Act: rail.diffAct,
        Prev_Index: rail.prevIndex,
        Next_Index: rail.nextIndices,
        Exit: exits,
      };
    });

    return {
      MapMeta: {
        LevelName: "TypeScript_Generated_Web",
        RailCount: rails.length,
        MazeDiff: rails.reduce((sum, rail) => sum + rail.Diff_Act, 0),
      },
      Rail: rails,
    };
  }

  private placeRailV2(
    railId: string,
    pos: Vector3,
    rot: number,
    rotAbs: RotAbs,
    diffBaseAcc: number,
    ratio: number,
    prevIdx: number,
    roll = 0,
  ): RailInstance | string {
    const cfg = this.requireConfig(railId);
    const expectedCells = calculateOccupiedCells(railId, pos, cfg.sizeRev, rot, roll);
    const collision = this.findCollision(expectedCells);
    if (collision !== null) return `Collision with Rail ${collision}`;
    if (!this.isInBounds(expectedCells)) return "OutOfBounds";

    const idx = this.globalIndexCounter;
    this.globalIndexCounter += 1;
    const diffAct = (1 + diffBaseAcc * 0.1) * cfg.diffBase * ratio;
    const instance: RailInstance = {
      railIndex: idx,
      railId,
      posRev: pos.clone(),
      rotIndex: rot,
      rotAbs: cloneRot(rotAbs),
      sizeRev: cfg.sizeRev.clone(),
      diffAct,
      prevIndex: prevIdx,
      nextIndices: [],
      exitStatus: cfg.exitsLogic.map((_, i) => ({ Index: i, IsConnected: false, TargetID: -1, WorldPos: null })),
      forbiddenSiblings: new Set(),
      occupiedCellsRev: expectedCells.map(([x, y, z]) => new Vector3(x, y, z)),
    };

    this.markOccupied(expectedCells, idx);
    this.placedRails.push(instance);
    this.currentTotalDifficulty += diffAct;

    cfg.exitsLogic.forEach((exit, i) => {
      const worldExitPos = pos.add(exit.Pos.rotateX(roll).rotateZ(rot));
      this.openList.push({
        targetPos: worldExitPos,
        parentId: idx,
        parentExitIdx: i,
        accumulatedDiff: diffAct,
        parentRotIndex: rot,
        parentRotAbs: cloneRot(rotAbs),
        spinDiffs: exit.SpinDiff,
        parentExitRotOffset: exit.RotOffset,
        parentExitLocalRot: cloneRot(exit.LocalRot),
        forbiddenCandidates: new Set(),
      });
    });

    return instance;
  }

  private backtrackLastRail(): boolean {
    if (this.placedRails.length === 0) return false;
    this.backtrackCount += 1;
    const lastRail = this.placedRails.pop();
    if (!lastRail) return false;

    this.globalIndexCounter -= 1;
    this.currentTotalDifficulty -= lastRail.diffAct;
    for (const cell of lastRail.occupiedCellsRev) {
      const key = keyOf(cell.asTuple());
      if (this.occupiedCells.get(key) === lastRail.railIndex) this.occupiedCells.delete(key);
    }

    if (lastRail.prevIndex === -1) return this.placedRails.length > 0;
    const parent = this.placedRails.find((rail) => rail.railIndex === lastRail.prevIndex);
    if (!parent) return true;

    const exitIdx = parent.exitStatus.findIndex((status) => status.TargetID === lastRail.railIndex);
    if (exitIdx === -1) return true;
    const status = parent.exitStatus[exitIdx];
    status.IsConnected = false;
    status.TargetID = -1;

    const exitData = this.requireConfig(parent.railId).exitsLogic[exitIdx];
    const forbiddenCandidates = new Set(lastRail.forbiddenSiblings);
    forbiddenCandidates.add(lastRail.railId);
    this.openList.push({
      targetPos: parent.posRev.add(exitData.Pos.rotateZ(parent.rotIndex)),
      parentId: parent.railIndex,
      parentExitIdx: exitIdx,
      accumulatedDiff: this.currentTotalDifficulty,
      parentRotIndex: parent.rotIndex,
      parentRotAbs: cloneRot(parent.rotAbs),
      spinDiffs: exitData.SpinDiff,
      parentExitRotOffset: exitData.RotOffset,
      parentExitLocalRot: cloneRot(exitData.LocalRot),
      forbiddenCandidates,
    });

    return true;
  }

  private getCandidates(mustEnd: boolean, triggerCheckpoint: boolean): string[] {
    const all = [...this.configMap.values()];
    if (mustEnd) return all.filter((item) => item.isEnd).map((item) => item.rowName);
    if (triggerCheckpoint) {
      const forkCandidates = all
        .filter((item) => !item.isEnd && !item.isStart && !item.isCheckpoint && item.exitsLogic.length >= 2)
        .map((item) => item.rowName);
      if (forkCandidates.length > 0) return forkCandidates;
    }
    return all.filter((item) => !item.isEnd && !item.isStart && !item.isCheckpoint).map((item) => item.rowName);
  }

  private calculateRailTransform(connector: OpenConnector, spinRot: number): [number, RotAbs, number] {
    const rotIdx = (connector.parentRotIndex + connector.parentExitRotOffset) % 4;
    return [
      rotIdx,
      {
        p: mod360(connector.parentRotAbs.p + connector.parentExitLocalRot.p),
        y: mod360(connector.parentRotAbs.y + connector.parentExitLocalRot.y),
        r: mod360(connector.parentRotAbs.r + connector.parentExitLocalRot.r + spinRot * 90),
      },
      spinRot,
    ];
  }

  private isInBounds(cells: [number, number, number][]): boolean {
    const xs = cells.map((cell) => cell[0]);
    const ys = cells.map((cell) => cell[1]);
    const zs = cells.map((cell) => cell[2]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    const radiusX = boundRadius(this.options.bounds.x);
    const radiusY = boundRadius(this.options.bounds.y);
    const radiusZ = boundRadius(this.options.bounds.z);

    if (this.options.boundaryMode === 0) {
      return (
        minX >= -radiusX &&
        maxX <= radiusX &&
        minY >= -radiusY &&
        maxY <= radiusY &&
        minZ >= -radiusZ &&
        maxZ <= radiusZ
      );
    }

    const curr = this.globalBounds ?? [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
    const next: [number, number, number, number, number, number] = [
      Math.min(curr[0], minX),
      Math.max(curr[1], maxX),
      Math.min(curr[2], minY),
      Math.max(curr[3], maxY),
      Math.min(curr[4], minZ),
      Math.max(curr[5], maxZ),
    ];

    return (
      next[1] - next[0] + 1 <= this.options.bounds.x &&
      next[3] - next[2] + 1 <= this.options.bounds.y &&
      next[5] - next[4] + 1 <= this.options.bounds.z
    );
  }

  private markOccupied(cells: [number, number, number][], railIndex: number): void {
    if (this.options.boundaryMode === 1) {
      const xs = cells.map((cell) => cell[0]);
      const ys = cells.map((cell) => cell[1]);
      const zs = cells.map((cell) => cell[2]);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const minZ = Math.min(...zs);
      const maxZ = Math.max(...zs);
      const curr = this.globalBounds ?? [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
      this.globalBounds = [
        Math.min(curr[0], minX),
        Math.max(curr[1], maxX),
        Math.min(curr[2], minY),
        Math.max(curr[3], maxY),
        Math.min(curr[4], minZ),
        Math.max(curr[5], maxZ),
      ];
    }

    for (const cell of cells) this.occupiedCells.set(keyOf(cell), railIndex);
  }

  private findCollision(cells: [number, number, number][]): number | null {
    for (const cell of cells) {
      const existing = this.occupiedCells.get(keyOf(cell));
      if (existing !== undefined) return existing;
    }
    return null;
  }

  private getUeDirStr(rotIdx: number): DirAbs {
    return ["+X", "+Y", "-X", "-Y"][((rotIdx % 4) + 4) % 4] as DirAbs;
  }

  private requireConfig(railId: string): RailConfigItem {
    const config = this.configMap.get(railId);
    if (!config) throw new Error(`Unknown rail id: ${railId}`);
    return config;
  }

  private log(kind: GenerationLogEntry["kind"], message: string): void {
    this.logs.push({ kind, message });
  }
}
