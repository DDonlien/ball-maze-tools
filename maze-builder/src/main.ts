import gsap from "gsap";
import railConfigCsv from "../rail_config.csv?raw";
import sampleLayoutRaw from "../maze_layout.json?raw";
import { loadConfigFromCsv } from "./maze/csv";
import { MazeGenerator } from "./maze/generator";
import { DEFAULT_GENERATOR_OPTIONS } from "./maze/constants";
import { MazeLayout, Vector3 } from "./maze/types";
import { MazeViewer } from "./viewer/MazeViewer";
import "./styles/main.css";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing #app");

app.innerHTML = `
  <main class="shell">
    <nav class="rail-nav">
      <div class="rail-nav-top">
        <div class="mini-brand">
          <strong>MAZE</strong>
          <span>v1.0</span>
        </div>
        <button class="lang is-active">中</button>
        <button class="lang">EN</button>
      </div>
      <a class="nav-link" href="https://gsap.com" target="_blank" rel="noreferrer">
        <span class="icon">↗</span>
        <span>GSAP</span>
      </a>
    </nav>

    <aside class="panel">
      <div class="brand">
        <div class="brand-mark"></div>
        <div>
          <h1>MAZE FOUNDRY</h1>
          <p>TS GENERATOR / THREE INSPECTOR</p>
        </div>
      </div>

      <div class="panel-body">
        <section class="section">
          <div class="section-head">
            <h2>Generator</h2>
            <button id="generateBtn" class="primary">Generate</button>
          </div>
          <label class="field">
            <span>Seed</span>
            <input id="seedInput" type="number" value="20260425" />
          </label>
          <label class="field">
            <span>Target difficulty</span>
            <input id="difficultyInput" type="number" min="1" step="1" value="${DEFAULT_GENERATOR_OPTIONS.targetDifficulty}" />
          </label>
          <label class="field">
            <span>Bounds X/Y/Z</span>
            <div class="triple">
              <input id="boundX" type="number" value="${DEFAULT_GENERATOR_OPTIONS.bounds.x}" />
              <input id="boundY" type="number" value="${DEFAULT_GENERATOR_OPTIONS.bounds.y}" />
              <input id="boundZ" type="number" value="${DEFAULT_GENERATOR_OPTIONS.bounds.z}" />
            </div>
          </label>
          <div class="actions">
            <button id="downloadBtn">Download JSON</button>
            <button id="resetCameraBtn">Reset View</button>
          </div>
        </section>

        <section class="drop" id="dropZone">
          <strong>Drop CSV or maze JSON</strong>
          <span>CSV regenerates config. JSON opens a layout.</span>
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
        <div class="search-label">搜索</div>
        <button class="filter-chip">播放状态 <span>⌄</span></button>
        <button class="filter-chip">对象 <span>⌄</span></button>
        <button class="filter-chip">表现类型 <span>⌄</span></button>
        <button class="reset-chip" id="topResetBtn">重置</button>
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
const topResetBtn = document.querySelector<HTMLButtonElement>("#topResetBtn")!;
const dropZone = document.querySelector<HTMLDivElement>("#dropZone")!;
const seedInput = document.querySelector<HTMLInputElement>("#seedInput")!;
const difficultyInput = document.querySelector<HTMLInputElement>("#difficultyInput")!;
const boundX = document.querySelector<HTMLInputElement>("#boundX")!;
const boundY = document.querySelector<HTMLInputElement>("#boundY")!;
const boundZ = document.querySelector<HTMLInputElement>("#boundZ")!;

const viewer = new MazeViewer(viewerHost);
let csvText = railConfigCsv;
let currentLayout: MazeLayout = JSON.parse(sampleLayoutRaw) as MazeLayout;

viewer.onHover = (rail) => {
  if (!rail) {
    detailContent.innerHTML = `<span class="muted">Hover a rail in the scene.</span>`;
    return;
  }
  detailContent.innerHTML = `
    <div class="detail-row"><span>ID</span><strong>${rail.id}</strong></div>
    <div class="detail-row"><span>Type</span><strong>${rail.type}</strong></div>
    <div class="detail-row"><span>Rev</span><strong>${formatVec(rail.posRev)}</strong></div>
    <div class="detail-row"><span>Abs</span><strong>${formatVec(rail.pos)}</strong></div>
    <div class="detail-row"><span>Rot</span><strong>${rail.rot.p}/${rail.rot.y}/${rail.rot.r}</strong></div>
    <div class="detail-row"><span>Diff</span><strong>${rail.diff.toFixed(2)}</strong></div>
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
  viewer.setLayout(layout);
  statsContent.innerHTML = `
    <div><span>Rails</span><strong>${layout.MapMeta.RailCount}</strong></div>
    <div><span>Difficulty</span><strong>${layout.MapMeta.MazeDiff.toFixed(2)}</strong></div>
    <div><span>Start</span><strong>${layout.Rail.filter((rail) => rail.Rail_ID.includes("Start")).length}</strong></div>
    <div><span>End</span><strong>${layout.Rail.filter((rail) => rail.Rail_ID.includes("End")).length}</strong></div>
  `;
}

function renderLog(logs: { kind: string; message: string }[]): void {
  logContent.innerHTML = logs
    .slice(-80)
    .map((entry) => `<div class="log-line ${entry.kind}">${entry.message}</div>`)
    .join("");
  logContent.scrollTop = logContent.scrollHeight;
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
topResetBtn.addEventListener("click", () => viewer.resetCamera());
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
renderLog([{ kind: "info", message: "Loaded existing maze_layout.json. Generate to run the TypeScript port." }]);
gsap.from(".panel", { x: -20, opacity: 0, duration: 0.45, ease: "power3.out" });
gsap.from(".log-dock", { y: 18, opacity: 0, duration: 0.45, delay: 0.12, ease: "power3.out" });
gsap.from(".rail-nav", { opacity: 0, duration: 0.35, ease: "power2.out" });
