import gsap from "gsap";
import railConfigCsv from "../rail_config.csv?raw";
import sampleLayoutRaw from "../maze_layout.json?raw";
import { loadConfigFromCsv } from "./maze/csv";
import { MazeGenerator } from "./maze/generator";
import { DEFAULT_GENERATOR_OPTIONS, GRID_TO_WORLD_SCALE } from "./maze/constants";
import { MazeLayout, Vec3Dict, Vector3 } from "./maze/types";
import { MazeViewer } from "./viewer/MazeViewer";
import "./styles/main.css";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing #app");

app.innerHTML = `
  <main class="shell">
    <aside class="panel">
      <div class="brand">
        <div class="brand-mark"></div>
        <h1>BALL MAZE BUILDER</h1>
        <div class="lang-switch" aria-label="Language">
          <button class="lang is-active">中</button>
          <button class="lang">EN</button>
        </div>
      </div>

      <div class="panel-body">
        <section class="drop" id="dropZone" title="拖入 UE 导出的 CSV 会重新生成配置；拖入 maze JSON 会直接打开布局。">
          <strong>Drop CSV or maze JSON</strong>
          <span>CSV regenerates config. JSON opens a layout.</span>
        </section>

        <section class="section">
          <div class="section-head">
            <h2>Generator</h2>
            <button id="generateBtn" class="primary" title="使用当前 CSV、seed、目标难度和边界重新生成迷宫。">Generate</button>
          </div>
          <label class="field">
            <span title="随机种子。相同 CSV、参数和 seed 会生成同一套迷宫，方便复现和调试。">Seed</span>
            <div class="seed-row">
              <input id="seedInput" type="number" value="20260425" />
              <button id="randomSeedBtn" class="icon-button" title="随机生成一个新的 seed。">↻</button>
            </div>
          </label>
          <label class="field">
            <span title="目标总难度。生成器达到该难度后会尝试收尾并放置终点。">Target difficulty</span>
            <input id="difficultyInput" type="number" min="1" step="1" value="${DEFAULT_GENERATOR_OPTIONS.targetDifficulty}" />
          </label>
          <label class="field">
            <span title="生成边界，单位是逻辑 grid。X/Y/Z 分别限制迷宫可占用的半宽范围。">Bounds X/Y/Z</span>
            <div class="triple">
              <input id="boundX" type="number" value="${DEFAULT_GENERATOR_OPTIONS.bounds.x}" />
              <input id="boundY" type="number" value="${DEFAULT_GENERATOR_OPTIONS.bounds.y}" />
              <input id="boundZ" type="number" value="${DEFAULT_GENERATOR_OPTIONS.bounds.z}" />
            </div>
          </label>
          <div class="actions">
            <button id="moveCenterBtn" title="按 grid 整数偏移当前迷宫，使布局尽量落在当前 bounds 的中心。">Move to center</button>
            <button id="fitBoundsBtn" title="把 bounds 收缩到能容纳当前迷宫的最小 grid 尺寸，并重新居中布局。">Fit size</button>
            <button id="downloadBtn" title="下载当前迷宫 JSON。">Download JSON</button>
            <button id="resetCameraBtn" title="重置相机视角。">Reset View</button>
          </div>
        </section>

        <section class="section stats">
          <h2>Stats</h2>
          <div id="statsContent" class="stats-grid"></div>
        </section>

        <section class="section details">
          <h2>Rail Detail</h2>
          <div id="detailContent" class="muted">Hover a rail in the scene.</div>
        </section>
      </div>
    </aside>

    <section class="viewport">
      <header class="topbar">
        <button id="historyBackBtn" class="tool-chip" title="返回上一个相机 focus。">返回</button>
        <button id="historyForwardBtn" class="tool-chip" title="前进到下一个相机 focus。">前进</button>
        <button id="focusToggleBtn" class="tool-chip primary-tool" data-current="Focus: Maze" data-next="Focus: Bounds" title="在建筑区域中心和当前迷宫中心之间切换相机 focus。"></button>
      </header>
      <div id="viewerHost" class="viewer"></div>
      <div class="log-dock">
        <div class="log-head">Generation Log</div>
        <div id="logContent" class="log-content"></div>
      </div>
    </section>
  </main>
`;

const viewerHost = document.querySelector<HTMLDivElement>("#viewerHost")!;
const statsContent = document.querySelector<HTMLDivElement>("#statsContent")!;
const detailContent = document.querySelector<HTMLDivElement>("#detailContent")!;
const logContent = document.querySelector<HTMLDivElement>("#logContent")!;
const generateBtn = document.querySelector<HTMLButtonElement>("#generateBtn")!;
const downloadBtn = document.querySelector<HTMLButtonElement>("#downloadBtn")!;
const resetCameraBtn = document.querySelector<HTMLButtonElement>("#resetCameraBtn")!;
const randomSeedBtn = document.querySelector<HTMLButtonElement>("#randomSeedBtn")!;
const moveCenterBtn = document.querySelector<HTMLButtonElement>("#moveCenterBtn")!;
const fitBoundsBtn = document.querySelector<HTMLButtonElement>("#fitBoundsBtn")!;
const historyBackBtn = document.querySelector<HTMLButtonElement>("#historyBackBtn")!;
const historyForwardBtn = document.querySelector<HTMLButtonElement>("#historyForwardBtn")!;
const focusToggleBtn = document.querySelector<HTMLButtonElement>("#focusToggleBtn")!;
const dropZone = document.querySelector<HTMLDivElement>("#dropZone")!;
const seedInput = document.querySelector<HTMLInputElement>("#seedInput")!;
const difficultyInput = document.querySelector<HTMLInputElement>("#difficultyInput")!;
const boundX = document.querySelector<HTMLInputElement>("#boundX")!;
const boundY = document.querySelector<HTMLInputElement>("#boundY")!;
const boundZ = document.querySelector<HTMLInputElement>("#boundZ")!;

const viewer = new MazeViewer(viewerHost);
let csvText = railConfigCsv;
let currentLayout: MazeLayout = JSON.parse(sampleLayoutRaw) as MazeLayout;
let focusMode: "maze" | "bounds" = "maze";

function markLatin(text: string): string {
  const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
  return escape(text).replace(/[A-Za-z0-9_.:/()+,-]+/g, (match) => `<span class="latin">${match}</span>`);
}

viewer.onHover = (rail) => {
  if (!rail) {
    detailContent.innerHTML = `<span class="muted">${markLatin("Hover a rail in the scene.")}</span>`;
    return;
  }
  detailContent.innerHTML = `
    <div class="detail-row"><span>${markLatin("ID")}</span><strong>${markLatin(String(rail.id))}</strong></div>
    <div class="detail-row"><span>${markLatin("Type")}</span><strong>${markLatin(rail.type)}</strong></div>
    <div class="detail-row"><span>${markLatin("Rev")}</span><strong>${markLatin(formatVec(rail.posRev))}</strong></div>
    <div class="detail-row"><span>${markLatin("Abs")}</span><strong>${markLatin(formatVec(rail.pos))}</strong></div>
    <div class="detail-row"><span>${markLatin("Rot")}</span><strong>${markLatin(`${rail.rot.p}/${rail.rot.y}/${rail.rot.r}`)}</strong></div>
    <div class="detail-row"><span>${markLatin("Diff")}</span><strong>${markLatin(rail.diff.toFixed(2))}</strong></div>
  `;
};

function generateLayout(): void {
  try {
    const config = loadConfigFromCsv(csvText);
    const generator = new MazeGenerator(config, {
      seed: Number(seedInput.value) || Date.now(),
      targetDifficulty: Number(difficultyInput.value) || DEFAULT_GENERATOR_OPTIONS.targetDifficulty,
      bounds: new Vector3(
        Number(boundX.value) || DEFAULT_GENERATOR_OPTIONS.bounds.x,
        Number(boundY.value) || DEFAULT_GENERATOR_OPTIONS.bounds.y,
        Number(boundZ.value) || DEFAULT_GENERATOR_OPTIONS.bounds.z,
      ),
    });
    currentLayout = generator.generate();
    setLayout(currentLayout);
    renderLog(generator.logs);
  } catch (error) {
    logContent.innerHTML = `<div class="log-line fail">${error instanceof Error ? error.message : String(error)}</div>`;
  }
}

function setLayout(layout: MazeLayout): void {
  currentLayout = layout;
  viewer.setBounds(currentBounds());
  viewer.setLayout(layout);
  statsContent.innerHTML = `
    <div><span>${markLatin("Rails")}</span><strong>${markLatin(String(layout.MapMeta.RailCount))}</strong></div>
    <div><span>${markLatin("Difficulty")}</span><strong>${markLatin(layout.MapMeta.MazeDiff.toFixed(2))}</strong></div>
    <div><span>${markLatin("Start")}</span><strong>${markLatin(String(layout.Rail.filter((rail) => rail.Rail_ID.includes("Start")).length))}</strong></div>
    <div><span>${markLatin("End")}</span><strong>${markLatin(String(layout.Rail.filter((rail) => rail.Rail_ID.includes("End")).length))}</strong></div>
  `;
}

function cloneLayout(layout: MazeLayout): MazeLayout {
  return JSON.parse(JSON.stringify(layout)) as MazeLayout;
}

function worldDict(vec: Vec3Dict): Vec3Dict {
  return {
    x: Number((vec.x * GRID_TO_WORLD_SCALE).toFixed(8)),
    y: Number((vec.y * GRID_TO_WORLD_SCALE).toFixed(8)),
    z: Number((vec.z * GRID_TO_WORLD_SCALE).toFixed(8)),
  };
}

function layoutBounds(layout: MazeLayout): { min: Vec3Dict; max: Vec3Dict } {
  const cells = layout.Rail.flatMap((rail) => (rail.Occupied_Cells_Rev.length > 0 ? rail.Occupied_Cells_Rev : [rail.Pos_Rev]));
  return {
    min: {
      x: Math.min(...cells.map((cell) => cell.x)),
      y: Math.min(...cells.map((cell) => cell.y)),
      z: Math.min(...cells.map((cell) => cell.z)),
    },
    max: {
      x: Math.max(...cells.map((cell) => cell.x)),
      y: Math.max(...cells.map((cell) => cell.y)),
      z: Math.max(...cells.map((cell) => cell.z)),
    },
  };
}

function clamp(value: number, min: number, max: number): number {
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  return Math.max(low, Math.min(high, value));
}

function currentBounds(): Vec3Dict {
  return {
    x: Math.max(0, Number(boundX.value) || DEFAULT_GENERATOR_OPTIONS.bounds.x),
    y: Math.max(0, Number(boundY.value) || DEFAULT_GENERATOR_OPTIONS.bounds.y),
    z: Math.max(0, Number(boundZ.value) || DEFAULT_GENERATOR_OPTIONS.bounds.z),
  };
}

function centerOffsetForBounds(layout: MazeLayout, bounds: Vec3Dict): Vec3Dict {
  const box = layoutBounds(layout);
  return {
    x: clamp(Math.round(-(box.min.x + box.max.x) / 2), -bounds.x - box.min.x, bounds.x - box.max.x),
    y: clamp(Math.round(-(box.min.y + box.max.y) / 2), -bounds.y - box.min.y, bounds.y - box.max.y),
    z: clamp(Math.round(-(box.min.z + box.max.z) / 2), -bounds.z - box.min.z, bounds.z - box.max.z),
  };
}

function translateLayout(layout: MazeLayout, offset: Vec3Dict): MazeLayout {
  const next = cloneLayout(layout);
  next.Rail.forEach((rail) => {
    rail.Pos_Rev = { x: rail.Pos_Rev.x + offset.x, y: rail.Pos_Rev.y + offset.y, z: rail.Pos_Rev.z + offset.z };
    rail.Pos_Abs = worldDict(rail.Pos_Rev);
    rail.Occupied_Cells_Rev = rail.Occupied_Cells_Rev.map((cell) => ({ x: cell.x + offset.x, y: cell.y + offset.y, z: cell.z + offset.z }));
    rail.Exit = rail.Exit.map((exit) => {
      const exitPos = { x: exit.Exit_Pos_Rev.x + offset.x, y: exit.Exit_Pos_Rev.y + offset.y, z: exit.Exit_Pos_Rev.z + offset.z };
      return { ...exit, Exit_Pos_Rev: exitPos, Exit_Pos_Abs: worldDict(exitPos) };
    });
  });
  return next;
}

function moveLayoutToCenter(): void {
  const offset = centerOffsetForBounds(currentLayout, currentBounds());
  setLayout(translateLayout(currentLayout, offset));
  renderLog([{ kind: "info", message: `Moved layout by grid offset (${offset.x}, ${offset.y}, ${offset.z}).` }]);
}

function fitLayoutBounds(): void {
  const box = layoutBounds(currentLayout);
  const fitted = {
    x: Math.max(0, Math.ceil((box.max.x - box.min.x) / 2)),
    y: Math.max(0, Math.ceil((box.max.y - box.min.y) / 2)),
    z: Math.max(0, Math.ceil((box.max.z - box.min.z) / 2)),
  };
  boundX.value = String(fitted.x);
  boundY.value = String(fitted.y);
  boundZ.value = String(fitted.z);
  const offset = centerOffsetForBounds(currentLayout, fitted);
  setLayout(translateLayout(currentLayout, offset));
  renderLog([{ kind: "info", message: `Fitted bounds to ${fitted.x}/${fitted.y}/${fitted.z} and centered by (${offset.x}, ${offset.y}, ${offset.z}).` }]);
}

function renderLog(logs: { kind: string; message: string }[]): void {
  logContent.innerHTML = logs
    .slice(-80)
    .map((entry) => `<div class="log-line ${entry.kind}">${markLatin(entry.message)}</div>`)
    .join("");
  logContent.scrollTop = logContent.scrollHeight;
}

function randomizeSeed(): void {
  seedInput.value = String(Math.floor(Math.random() * 90000000) + 10000000);
}

function refreshBoundsOnly(): void {
  viewer.setBounds(currentBounds());
  viewer.setLayout(currentLayout);
}

function updateFocusButton(): void {
  const current = focusMode === "maze" ? "Focus: Maze" : "Focus: Bounds";
  const next = focusMode === "maze" ? "Focus: Bounds" : "Focus: Maze";
  focusToggleBtn.dataset.current = current;
  focusToggleBtn.dataset.next = next;
}

function downloadLayout(): void {
  const blob = new Blob([JSON.stringify(currentLayout, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `maze_layout_${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function handleFile(file: File): void {
  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result ?? "");
    if (file.name.toLowerCase().endsWith(".json")) {
      setLayout(JSON.parse(text) as MazeLayout);
      renderLog([{ kind: "info", message: `Loaded ${file.name}` }]);
    } else {
      csvText = text;
      generateLayout();
    }
  };
  reader.readAsText(file);
}

function formatVec(vec: { x: number; y: number; z: number }): string {
  return `(${fmt(vec.x)}, ${fmt(vec.y)}, ${fmt(vec.z)})`;
}

function fmt(value: number): string {
  return Number(value.toFixed(3)).toString();
}

generateBtn.addEventListener("click", generateLayout);
downloadBtn.addEventListener("click", downloadLayout);
resetCameraBtn.addEventListener("click", () => viewer.resetCamera());
randomSeedBtn.addEventListener("click", randomizeSeed);
moveCenterBtn.addEventListener("click", moveLayoutToCenter);
fitBoundsBtn.addEventListener("click", fitLayoutBounds);
historyBackBtn.addEventListener("click", () => viewer.goBack());
historyForwardBtn.addEventListener("click", () => viewer.goForward());
focusToggleBtn.addEventListener("click", () => {
  focusMode = focusMode === "maze" ? "bounds" : "maze";
  if (focusMode === "maze") {
    viewer.focusMaze();
  } else {
    viewer.focusBounds(currentBounds());
  }
  updateFocusButton();
});
[boundX, boundY, boundZ].forEach((input) => input.addEventListener("input", refreshBoundsOnly));
dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("is-over");
});
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("is-over"));
dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("is-over");
  const file = event.dataTransfer?.files[0];
  if (file) handleFile(file);
});

setLayout(currentLayout);
updateFocusButton();
renderLog([{ kind: "info", message: "Loaded existing maze_layout.json. Generate to run the TypeScript port." }]);
gsap.from(".panel", { x: -20, opacity: 0, duration: 0.45, ease: "power3.out" });
gsap.from(".log-dock", { y: 18, opacity: 0, duration: 0.45, delay: 0.12, ease: "power3.out" });
