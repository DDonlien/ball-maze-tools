import gsap from "gsap";
import { exportResultCsv, importReferenceCsv } from "./hermite/csv";
import { ArcInput, GenerationResult, Vec3, generateFromArcGroups, generateFromVectors, vec } from "./hermite/math";
import { CurveRenderer, HoverPoint } from "./hermite/renderer";
import "./styles/main.css";

type Mode = "arc" | "vector";

interface ArcGroup {
  start: Vec3;
  tangent: Vec3;
  editStart: boolean;
  arcs: ArcInput[];
}

interface VectorRow {
  point: Vec3;
  tangent: Vec3;
}

interface Snapshot {
  mode: Mode;
  arcGroups: ArcGroup[];
  vectorRows: VectorRow[];
  params: {
    gap: number;
    numCurves: number;
    step: number;
  };
}

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing #app");

let mode: Mode = "arc";
let arcGroups: ArcGroup[] = [
  { start: vec(0, 0, 0), tangent: vec(1, 0, 0), editStart: true, arcs: [{ radius: 32, angleDeg: 90, direction: -1 }] },
];
let vectorRows: VectorRow[] = [
  { point: vec(0, 0, 0), tangent: vec(52.32197266, 0, 0) },
  { point: vec(32, -32, 0), tangent: vec(0, -52.32197266, 0) },
];
let currentResult: GenerationResult | null = null;
let history: Snapshot[] = [];
let future: Snapshot[] = [];
let isRestoring = false;
let hoverPoint: HoverPoint | null = null;
let hoverPosition: { x: number; y: number } | undefined;
let hoverFieldIndex = 0;

app.innerHTML = `
  <main class="shell">
    <aside class="panel">
      <div class="brand">
        <div class="brand-mark"></div>
        <h1>HERMITE SPLINE</h1>
        <div class="lang-switch" aria-label="Mode">
          <button id="arcModeBtn" class="lang is-active">ARC</button>
          <button id="vectorModeBtn" class="lang" title="Import/edit existing control point and tangent data">VEC</button>
        </div>
      </div>

      <section class="drop top-upload" id="dropZone">
        <strong>Import CSV</strong>
        <span>Parameter / Reference rows</span>
        <input id="fileInput" type="file" accept=".csv,text/csv" />
      </section>

      <div class="panel-body">
        <section class="section global-settings">
          <div class="section-head">
            <h2>Global</h2>
            <button id="generateBtn" class="primary">Generate</button>
          </div>
          <label class="field">
            <span>Gap / Curves / Fit Step</span>
            <div class="triple">
              <input id="gapInput" type="number" step="0.01" value="4" />
              <input id="numCurvesInput" type="number" min="0" step="1" value="2" />
              <input id="stepInput" type="number" min="0.001" step="0.001" value="0.01" />
            </div>
          </label>
          <div class="actions">
            <button id="exportBtn">Export CSV</button>
            <button id="sampleBtn">Sample</button>
          </div>
        </section>

        <section id="arcEditor" class="section editor"></section>
        <section id="vectorEditor" class="section editor is-hidden"></section>

        <section class="section stats">
          <h2>Stats</h2>
          <div id="statsContent" class="stats-grid"></div>
        </section>
      </div>
    </aside>

    <section class="viewport">
      <header class="topbar">
        <button class="nav-chip" id="backBtn">Back</button>
        <button class="nav-chip" id="forwardBtn">Forward</button>
      </header>
      <canvas id="curveCanvas" class="viewer"></canvas>
      <div id="pointTooltip" class="point-tooltip is-hidden"></div>
      <div class="log-dock">
        <div class="log-head">Output</div>
        <div id="logContent" class="log-content"></div>
      </div>
    </section>
  </main>
`;

const arcModeBtn = document.querySelector<HTMLButtonElement>("#arcModeBtn")!;
const vectorModeBtn = document.querySelector<HTMLButtonElement>("#vectorModeBtn")!;
const generateBtn = document.querySelector<HTMLButtonElement>("#generateBtn")!;
const exportBtn = document.querySelector<HTMLButtonElement>("#exportBtn")!;
const sampleBtn = document.querySelector<HTMLButtonElement>("#sampleBtn")!;
const backBtn = document.querySelector<HTMLButtonElement>("#backBtn")!;
const forwardBtn = document.querySelector<HTMLButtonElement>("#forwardBtn")!;
const fileInput = document.querySelector<HTMLInputElement>("#fileInput")!;
const dropZone = document.querySelector<HTMLDivElement>("#dropZone")!;
const arcEditor = document.querySelector<HTMLDivElement>("#arcEditor")!;
const vectorEditor = document.querySelector<HTMLDivElement>("#vectorEditor")!;
const statsContent = document.querySelector<HTMLDivElement>("#statsContent")!;
const logContent = document.querySelector<HTMLDivElement>("#logContent")!;
const pointTooltip = document.querySelector<HTMLDivElement>("#pointTooltip")!;
const canvas = document.querySelector<HTMLCanvasElement>("#curveCanvas")!;
const renderer = new CurveRenderer(canvas);

function numericValue(id: string, fallback: number): number {
  const value = Number((document.querySelector<HTMLInputElement>(`#${id}`)?.value ?? "").trim());
  return Number.isFinite(value) ? value : fallback;
}

function commonParams(): Snapshot["params"] {
  return {
    gap: numericValue("gapInput", 4),
    numCurves: Math.max(0, Math.floor(numericValue("numCurvesInput", 2))),
    step: Math.max(0.001, numericValue("stepInput", 0.01)),
  };
}

function captureSnapshot(): Snapshot {
  return {
    mode,
    arcGroups: cloneArcGroups(arcGroups),
    vectorRows: cloneVectorRows(vectorRows),
    params: commonParams(),
  };
}

function pushHistory(): void {
  if (isRestoring) return;
  history.push(captureSnapshot());
  if (history.length > 80) history.shift();
  future = [];
  updateNavButtons();
}

function restoreSnapshot(snapshot: Snapshot): void {
  isRestoring = true;
  mode = snapshot.mode;
  arcGroups = cloneArcGroups(snapshot.arcGroups);
  vectorRows = cloneVectorRows(snapshot.vectorRows);
  document.querySelector<HTMLInputElement>("#gapInput")!.value = String(snapshot.params.gap);
  document.querySelector<HTMLInputElement>("#numCurvesInput")!.value = String(snapshot.params.numCurves);
  document.querySelector<HTMLInputElement>("#stepInput")!.value = String(snapshot.params.step);
  renderEditors();
  setMode(snapshot.mode, false);
  isRestoring = false;
  runGenerate(false);
  updateNavButtons();
}

function updateNavButtons(): void {
  backBtn.disabled = history.length === 0;
  forwardBtn.disabled = future.length === 0;
}

function cloneArcGroups(groups: ArcGroup[]): ArcGroup[] {
  return groups.map((group) => ({
    start: vec(group.start.x, group.start.y, group.start.z),
    tangent: vec(group.tangent.x, group.tangent.y, group.tangent.z),
    editStart: group.editStart,
    arcs: group.arcs.map((arc) => ({ ...arc })),
  }));
}

function cloneVectorRows(rows: VectorRow[]): VectorRow[] {
  return rows.map((row) => ({
    point: vec(row.point.x, row.point.y, row.point.z),
    tangent: vec(row.tangent.x, row.tangent.y, row.tangent.z),
  }));
}

function getDerivedStart(groupIndex: number): { start: Vec3; tangent: Vec3 } {
  if (groupIndex === 0) {
    const first = arcGroups[0];
    return first ? { start: vec(first.start.x, first.start.y, 0), tangent: vec(first.tangent.x, first.tangent.y, 0) } : { start: vec(0, 0, 0), tangent: vec(1, 0, 0) };
  }
  const previousSegment = currentResult?.referenceSegments?.[groupIndex - 1];
  if (previousSegment) {
    return {
      start: vec(previousSegment.p1.x, previousSegment.p1.y, 0),
      tangent: vec(previousSegment.t1.x, previousSegment.t1.y, 0),
    };
  }
  const previousGroup = arcGroups[groupIndex - 1];
  return previousGroup ? { start: vec(previousGroup.start.x, previousGroup.start.y, 0), tangent: vec(previousGroup.tangent.x, previousGroup.tangent.y, 0) } : { start: vec(0, 0, 0), tangent: vec(1, 0, 0) };
}

function renderEditors(): void {
  arcEditor.innerHTML = `
    <div class="section-head">
      <h2>Arc Groups</h2>
      <button id="addGroupBtn">Add Group</button>
    </div>
    <div class="group-list">
      ${arcGroups.map((group, groupIndex) => `
        <div class="group" data-group-index="${groupIndex}">
          <div class="group-head">
            <strong>Group ${groupIndex + 1}</strong>
            <div class="mini-actions">
              ${groupIndex === 0 ? "" : `<button class="edit-start">${group.editStart ? "Use Previous" : "Edit Start"}</button>`}
              <button class="remove-group">Del</button>
            </div>
          </div>
          ${group.editStart ? `
            <label class="field">
              <span>Start X/Y</span>
              <div class="pair">
                <input class="group-start-x" type="number" step="0.01" value="${group.start.x}" />
                <input class="group-start-y" type="number" step="0.01" value="${group.start.y}" />
              </div>
            </label>
            <label class="field">
              <span>Start Tangent X/Y</span>
              <div class="pair">
                <input class="group-tangent-x" type="number" step="0.01" value="${group.tangent.x}" />
                <input class="group-tangent-y" type="number" step="0.01" value="${group.tangent.y}" />
              </div>
            </label>
          ` : `
            <div class="derived-start">
              <span>Start inherits previous end</span>
              <strong>${formatVec(getDerivedStart(groupIndex).start)} / T ${formatVec(getDerivedStart(groupIndex).tangent)}</strong>
            </div>
          `}
          <div class="table-head four"><span>Radius</span><span>Angle</span><span>Dir</span></div>
          <div class="rows">
            ${group.arcs.slice(0, 1).map((arc, arcIndex) => `
              <div class="row four" data-arc-index="${arcIndex}">
                <input class="arc-radius" type="number" step="0.01" value="${arc.radius}" />
                <input class="arc-angle" type="number" step="0.01" value="${arc.angleDeg}" />
                <select class="arc-direction">
                  <option value="1" ${arc.direction === 1 ? "selected" : ""}>CCW</option>
                  <option value="-1" ${arc.direction === -1 ? "selected" : ""}>CW</option>
                </select>
              </div>
            `).join("")}
          </div>
        </div>
      `).join("")}
    </div>
  `;
  vectorEditor.innerHTML = `
    <div class="section-head">
      <h2>Vector Reference</h2>
      <button id="addVectorBtn">Add Point</button>
    </div>
    <div class="table-head seven"><span>Px</span><span>Py</span><span>Pz</span><span>Tx</span><span>Ty</span><span>Tz</span><span></span></div>
    <div id="vectorRows" class="rows">
      ${vectorRows.map((row, index) => `
        <div class="row seven" data-index="${index}">
          <input class="point-x" type="number" step="0.01" value="${row.point.x}" />
          <input class="point-y" type="number" step="0.01" value="${row.point.y}" />
          <input class="point-z" type="number" step="0.01" value="${row.point.z}" />
          <input class="tangent-x" type="number" step="0.01" value="${row.tangent.x}" />
          <input class="tangent-y" type="number" step="0.01" value="${row.tangent.y}" />
          <input class="tangent-z" type="number" step="0.01" value="${row.tangent.z}" />
          <button class="remove-vector">Del</button>
        </div>
      `).join("")}
    </div>
  `;
  bindEditorEvents();
}

function bindEditorEvents(): void {
  arcEditor.querySelector("#addGroupBtn")?.addEventListener("click", () => {
    pushHistory();
    const derived = getDerivedStart(arcGroups.length);
    arcGroups.push({ start: derived.start, tangent: derived.tangent, editStart: arcGroups.length === 0, arcs: [{ radius: 20, angleDeg: 45, direction: -1 }] });
    renderEditors();
    runGenerate(false);
  });
  arcEditor.querySelectorAll(".edit-start").forEach((button) => button.addEventListener("click", (event) => {
    pushHistory();
    const group = findGroupElement(event.currentTarget as HTMLElement);
    if (!group) return;
    const index = Number(group.dataset.groupIndex);
    if (arcGroups[index].editStart) {
      arcGroups[index].editStart = index === 0;
    } else {
      const derived = getDerivedStart(index);
      arcGroups[index].start = derived.start;
      arcGroups[index].tangent = derived.tangent;
      arcGroups[index].editStart = true;
    }
    renderEditors();
    runGenerate(false);
  }));
  arcEditor.querySelectorAll(".remove-group").forEach((button) => button.addEventListener("click", (event) => {
    pushHistory();
    const group = findGroupElement(event.currentTarget as HTMLElement);
    if (!group) return;
    arcGroups.splice(Number(group.dataset.groupIndex), 1);
    renderEditors();
    runGenerate(false);
  }));
  arcEditor.querySelectorAll(".remove-arc").forEach((button) => button.addEventListener("click", (event) => {
    pushHistory();
    const row = (event.currentTarget as HTMLElement).closest<HTMLElement>(".row");
    const group = findGroupElement(event.currentTarget as HTMLElement);
    if (!row || !group) return;
    arcGroups[Number(group.dataset.groupIndex)].arcs.splice(Number(row.dataset.arcIndex), 1);
    renderEditors();
    runGenerate(false);
  }));
  vectorEditor.querySelector("#addVectorBtn")?.addEventListener("click", () => {
    pushHistory();
    vectorRows.push({ point: vec(0, 0, 0), tangent: vec(10, 0, 0) });
    renderEditors();
    runGenerate(false);
  });
  vectorEditor.querySelectorAll(".remove-vector").forEach((button) => button.addEventListener("click", (event) => {
    pushHistory();
    const row = (event.currentTarget as HTMLElement).closest<HTMLElement>(".row");
    if (!row) return;
    vectorRows.splice(Number(row.dataset.index), 1);
    renderEditors();
    runGenerate(false);
  }));
  arcEditor.querySelectorAll("input, select").forEach((input) => {
    input.addEventListener("focus", pushHistory, { once: true });
    input.addEventListener("input", () => {
      collectArcGroups();
      runGenerate(false);
    });
  });
  vectorEditor.querySelectorAll("input").forEach((input) => {
    input.addEventListener("focus", pushHistory, { once: true });
    input.addEventListener("input", () => {
      collectVectorRows();
      runGenerate(false);
    });
  });
}

function findGroupElement(element: HTMLElement): HTMLElement | null {
  return element.closest<HTMLElement>(".group");
}

function collectArcGroups(): void {
  arcGroups = [...arcEditor.querySelectorAll<HTMLElement>(".group")].map((group) => ({
    start: vec(
      Number(group.querySelector<HTMLInputElement>(".group-start-x")?.value ?? arcGroups[Number(group.dataset.groupIndex)]?.start.x) || 0,
      Number(group.querySelector<HTMLInputElement>(".group-start-y")?.value ?? arcGroups[Number(group.dataset.groupIndex)]?.start.y) || 0,
      0,
    ),
    tangent: vec(
      Number(group.querySelector<HTMLInputElement>(".group-tangent-x")?.value ?? arcGroups[Number(group.dataset.groupIndex)]?.tangent.x) || 0,
      Number(group.querySelector<HTMLInputElement>(".group-tangent-y")?.value ?? arcGroups[Number(group.dataset.groupIndex)]?.tangent.y) || 0,
      0,
    ),
    editStart: arcGroups[Number(group.dataset.groupIndex)]?.editStart ?? (Number(group.dataset.groupIndex) === 0),
    arcs: [...group.querySelectorAll<HTMLElement>(".row")].map((row) => ({
      radius: Number(row.querySelector<HTMLInputElement>(".arc-radius")?.value) || 0,
      angleDeg: Number(row.querySelector<HTMLInputElement>(".arc-angle")?.value) || 0,
      direction: (Number(row.querySelector<HTMLSelectElement>(".arc-direction")?.value) === 1 ? 1 : -1) as 1 | -1,
    })),
  }));
}

function collectVectorRows(): void {
  vectorRows = [...vectorEditor.querySelectorAll<HTMLElement>(".row")].map((row) => ({
    point: vec(
      Number(row.querySelector<HTMLInputElement>(".point-x")?.value) || 0,
      Number(row.querySelector<HTMLInputElement>(".point-y")?.value) || 0,
      Number(row.querySelector<HTMLInputElement>(".point-z")?.value) || 0,
    ),
    tangent: vec(
      Number(row.querySelector<HTMLInputElement>(".tangent-x")?.value) || 0,
      Number(row.querySelector<HTMLInputElement>(".tangent-y")?.value) || 0,
      Number(row.querySelector<HTMLInputElement>(".tangent-z")?.value) || 0,
    ),
  }));
}

function runGenerate(recordHistory = false): void {
  if (recordHistory) pushHistory();
  const params = commonParams();
  try {
    const started = performance.now();
    if (mode === "arc") {
      collectArcGroups();
      if (arcGroups.length < 1 || arcGroups.every((group) => group.arcs.length === 0)) throw new Error("至少需要 1 组圆弧数据");
      currentResult = generateFromArcGroups(arcGroups.map((group) => ({
        startPoint: group.editStart ? group.start : undefined,
        startTangentDirection: group.editStart ? group.tangent : undefined,
        arcs: group.arcs.slice(0, 1),
      })), params.gap, params.numCurves, params.step);
    } else {
      collectVectorRows();
      if (vectorRows.length < 2) throw new Error("至少需要 2 个控制点");
      currentResult = generateFromVectors(vectorRows.map((row) => row.point), vectorRows.map((row) => row.tangent), params.gap, params.numCurves, params.step);
    }
    renderer.setResult(currentResult);
    renderStats(currentResult, performance.now() - started);
    renderLog(currentResult, performance.now() - started);
  } catch (error) {
    logContent.innerHTML = `<div class="log-line fail">${error instanceof Error ? error.message : String(error)}</div>`;
  }
}

function renderStats(result: GenerationResult, ms: number): void {
  const maxErr = Math.max(0, ...result.parallelCurves.flatMap((curve) => curve.map((segment) => segment.err)));
  statsContent.innerHTML = `
    <div><span>Groups</span><strong>${mode === "arc" ? arcGroups.length : "-"}</strong></div>
    <div><span>Segments</span><strong>${result.referenceSegments?.length ?? Math.max(result.controlPoints.length - 1, 0)}</strong></div>
    <div><span>Parallel</span><strong>${result.parallelCurves.length}</strong></div>
    <div><span>Max Err</span><strong>${format(maxErr)}</strong></div>
    <div><span>Time</span><strong>${ms.toFixed(0)}ms</strong></div>
    <div><span>Mode</span><strong>${mode.toUpperCase()}</strong></div>
  `;
}

function renderLog(result: GenerationResult, ms: number): void {
  const rows = [
    `<div class="log-line success">Generated ${result.parallelCurves.length} parallel curves in ${ms.toFixed(1)} ms.</div>`,
    ...(result.referenceSegments ?? []).map((segment, index) => `<div class="log-line info">P${index} = ${formatVec(segment.p0)} / T${index} = ${formatVec(segment.t0)}</div>`),
  ];
  const referenceSegments = result.referenceSegments;
  const last = referenceSegments && referenceSegments.length > 0 ? referenceSegments[referenceSegments.length - 1] : undefined;
  if (last) rows.push(`<div class="log-line info">End = ${formatVec(last.p1)} / T = ${formatVec(last.t1)}</div>`);
  for (const [curveIndex, curve] of result.parallelCurves.entries()) {
    const maxErr = Math.max(0, ...curve.map((segment) => segment.err));
    rows.push(`<div class="log-line warn">Parallel_${curveIndex} max error ${format(maxErr)}</div>`);
  }
  logContent.innerHTML = rows.join("");
}

function setMode(nextMode: Mode, recordHistory = true): void {
  if (recordHistory && mode !== nextMode) pushHistory();
  mode = nextMode;
  arcModeBtn.classList.toggle("is-active", mode === "arc");
  vectorModeBtn.classList.toggle("is-active", mode === "vector");
  arcEditor.classList.toggle("is-hidden", mode !== "arc");
  vectorEditor.classList.toggle("is-hidden", mode !== "vector");
  runGenerate(false);
}

function resetSample(): void {
  pushHistory();
  arcGroups = [{ start: vec(0, 0, 0), tangent: vec(1, 0, 0), editStart: true, arcs: [{ radius: 32, angleDeg: 90, direction: -1 }] }];
  vectorRows = [
    { point: vec(0, 0, 0), tangent: vec(52.32197266, 0, 0) },
    { point: vec(32, -32, 0), tangent: vec(0, -52.32197266, 0) },
  ];
  renderEditors();
  runGenerate(false);
}

function exportCsv(): void {
  if (!currentResult) runGenerate(false);
  if (!currentResult) return;
  const blob = new Blob([exportResultCsv(currentResult)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `hermite_spline_${Date.now()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function importCsvFile(file: File): void {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      pushHistory();
      const imported = importReferenceCsv(String(reader.result ?? ""));
      vectorRows = imported.controlPoints.map((point, index) => ({ point, tangent: imported.tangents[index] }));
      renderEditors();
      setMode("vector", false);
      logContent.innerHTML = `<div class="log-line success">Loaded ${file.name} into Vector Reference.</div>` + logContent.innerHTML;
    } catch (error) {
      logContent.innerHTML = `<div class="log-line fail">${error instanceof Error ? error.message : String(error)}</div>`;
    }
  };
  reader.readAsText(file);
}

function showHover(point: HoverPoint | null, position?: { x: number; y: number }): void {
  hoverPoint = point;
  hoverPosition = position;
  if (!point || !position) {
    pointTooltip.classList.add("is-hidden");
    return;
  }
  const values = getHoverValues(point);
  pointTooltip.innerHTML = `
    ${values.map((entry, index) => `
      <span class="tooltip-value ${index === hoverFieldIndex ? "is-active" : ""}" data-field="${entry.key}">
        <b>${entry.label}</b>${entry.value}
      </span>
    `).join("")}
  `;
  pointTooltip.style.left = `${position.x + 12}px`;
  pointTooltip.style.top = `${position.y + 12}px`;
  pointTooltip.classList.remove("is-hidden");
}

function getHoverValues(point: HoverPoint): Array<{ key: string; label: string; value: string; copy: string }> {
  const full = `${point.label}: XY(${format(point.point.x)}, ${format(point.point.y)}), T(${format(point.tangent.x)}, ${format(point.tangent.y)}, ${format(point.tangent.z)})`;
  return [
    { key: "name", label: "Name", value: point.label, copy: full },
    { key: "x", label: "X", value: format(point.point.x), copy: format(point.point.x) },
    { key: "y", label: "Y", value: format(point.point.y), copy: format(point.point.y) },
    { key: "tx", label: "TX", value: format(point.tangent.x), copy: format(point.tangent.x) },
    { key: "ty", label: "TY", value: format(point.tangent.y), copy: format(point.tangent.y) },
    { key: "tz", label: "TZ", value: format(point.tangent.z), copy: format(point.tangent.z) },
  ];
}

function cycleHoverField(delta: number): void {
  if (!hoverPoint) return;
  const count = getHoverValues(hoverPoint).length;
  hoverFieldIndex = (hoverFieldIndex + delta + count) % count;
  showHover(hoverPoint, hoverPosition);
}

function copyHoverValue(): void {
  if (!hoverPoint) return;
  const value = getHoverValues(hoverPoint)[hoverFieldIndex]?.copy;
  if (!value) return;
  void navigator.clipboard?.writeText(value);
  logContent.innerHTML = `<div class="log-line success">Copied ${value}</div>` + logContent.innerHTML;
}

function formatVec(value: Vec3): string {
  return `[${format(value.x)}, ${format(value.y)}, ${format(value.z)}]`;
}

function format(value: number): string {
  return Math.abs(value) < 0.000001 ? "0" : Number(value.toFixed(6)).toString();
}

renderEditors();
runGenerate(false);
updateNavButtons();

renderer.onHover = showHover;
canvas.addEventListener("wheel", (event) => {
  if (!hoverPoint) return;
  event.preventDefault();
  cycleHoverField(event.deltaY > 0 ? 1 : -1);
}, { passive: false });
canvas.addEventListener("mousedown", (event) => {
  if (event.button === 0) copyHoverValue();
});
arcModeBtn.addEventListener("click", () => setMode("arc"));
vectorModeBtn.addEventListener("click", () => setMode("vector"));
generateBtn.addEventListener("click", () => runGenerate(true));
exportBtn.addEventListener("click", exportCsv);
sampleBtn.addEventListener("click", resetSample);
backBtn.addEventListener("click", () => {
  const previous = history.pop();
  if (!previous) return;
  future.push(captureSnapshot());
  restoreSnapshot(previous);
});
forwardBtn.addEventListener("click", () => {
  const next = future.pop();
  if (!next) return;
  history.push(captureSnapshot());
  restoreSnapshot(next);
});
fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) importCsvFile(file);
  fileInput.value = "";
});
dropZone.addEventListener("click", () => fileInput.click());
dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("is-over");
});
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("is-over"));
dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("is-over");
  const file = event.dataTransfer?.files[0];
  if (file) importCsvFile(file);
});
document.querySelectorAll<HTMLInputElement>("#gapInput, #numCurvesInput, #stepInput").forEach((input) => {
  input.addEventListener("focus", pushHistory, { once: true });
  input.addEventListener("input", () => runGenerate(false));
});

gsap.from(".panel", { x: -20, opacity: 0, duration: 0.45, ease: "power3.out" });
gsap.from(".log-dock", { y: 18, opacity: 0, duration: 0.45, delay: 0.12, ease: "power3.out" });
