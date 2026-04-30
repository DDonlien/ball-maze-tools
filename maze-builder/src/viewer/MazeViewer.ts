import gsap from "gsap";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GRID_TO_WORLD_SCALE } from "../maze/constants";
import { MazeLayout, MazeRailJson, Vec3Dict } from "../maze/types";

interface RailMeta {
  id: number;
  type: string;
  pos: Vec3Dict;
  posRev: Vec3Dict;
  rot: { p: number; y: number; r: number };
  diff: number;
}

export class MazeViewer {
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private root?: THREE.Group;
  private blockMesh?: THREE.InstancedMesh;
  private spriteMap = new Map<number, THREE.Sprite>();
  private railDataMap = new Map<number, RailMeta>();
  private railArrowMap = new Map<number, number[]>();
  private lastHoveredId: number | null = null;
  private arrowColorCache = new Map<number, THREE.Color>();
  private arrowScaleCache = new Map<string, THREE.Matrix4>();
  private shaftMesh?: THREE.InstancedMesh;
  private headMesh?: THREE.InstancedMesh;
  private exitMesh?: THREE.InstancedMesh;
  private activeLayout?: MazeLayout;
  private bounds: Vec3Dict = { x: 4, y: 4, z: 1 };
  private focusHistory: THREE.Vector3[] = [new THREE.Vector3(0, 0, 0)];
  private focusHistoryIndex = 0;
  private projectionMode: "perspective" | "orthographic" = "perspective";
  private readonly orthoHeight = 260;
  onHover?: (rail: RailMeta | null) => void;

  constructor(private host: HTMLElement) {
    this.scene.background = new THREE.Color(0xfbfbf8);
    this.camera = this.createPerspectiveCamera();
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(130, -150, 115);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(host.clientWidth, host.clientHeight);
    host.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 0, 0);

    this.setupBaseScene();
    this.renderer.domElement.addEventListener("mousemove", this.handleMouseMove);
    window.addEventListener("resize", this.resize);
    this.animate();
  }

  dispose(): void {
    this.renderer.domElement.removeEventListener("mousemove", this.handleMouseMove);
    window.removeEventListener("resize", this.resize);
    this.renderer.dispose();
    this.host.innerHTML = "";
  }

  setLayout(layout: MazeLayout): void {
    this.activeLayout = layout;
    if (this.root) this.scene.remove(this.root);
    this.root = new THREE.Group();
    this.root.name = "MazeRoot";
    this.scene.add(this.root);
    this.spriteMap.clear();
    this.railDataMap.clear();
    this.railArrowMap.clear();
    this.lastHoveredId = null;
    this.arrowColorCache.clear();
    this.arrowScaleCache.clear();

    this.drawBounds();
    this.drawRails(layout.Rail);
    gsap.fromTo(this.root.scale, { x: 0.96, y: 0.96, z: 0.96 }, { x: 1, y: 1, z: 1, duration: 0.55, ease: "power3.out" });
    gsap.fromTo(this.root.position, { z: -8 }, { z: 0, duration: 0.55, ease: "power3.out" });
  }

  setBounds(bounds: Vec3Dict): void {
    this.bounds = bounds;
  }

  toggleProjection(): "perspective" | "orthographic" {
    this.setProjectionMode(this.projectionMode === "perspective" ? "orthographic" : "perspective");
    return this.projectionMode;
  }

  setProjectionMode(mode: "perspective" | "orthographic"): void {
    if (mode === this.projectionMode) return;
    const position = this.camera.position.clone();
    const up = this.camera.up.clone();
    const target = this.controls.target.clone();
    this.projectionMode = mode;
    this.controls.dispose();
    this.camera = mode === "perspective" ? this.createPerspectiveCamera() : this.createOrthographicCamera();
    this.camera.position.copy(position);
    this.camera.up.copy(up);
    this.camera.lookAt(target);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.target.copy(target);
    this.resize();
  }

  focusView(view: "iso" | "top" | "front" | "back" | "left" | "right"): void {
    const target = this.controls.target.clone();
    const distance = Math.max(this.camera.position.distanceTo(target), 160);
    const directions = {
      iso: new THREE.Vector3(1, -1, 0.8).normalize(),
      top: new THREE.Vector3(0, 0, 1),
      front: new THREE.Vector3(0, -1, 0),
      back: new THREE.Vector3(0, 1, 0),
      left: new THREE.Vector3(-1, 0, 0),
      right: new THREE.Vector3(1, 0, 0),
    };
    const up = view === "top" ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
    const nextPosition = target.clone().add(directions[view].multiplyScalar(distance));
    this.camera.up.copy(up);
    gsap.to(this.camera.position, {
      x: nextPosition.x,
      y: nextPosition.y,
      z: nextPosition.z,
      duration: 0.45,
      ease: "power3.inOut",
      onUpdate: () => this.camera.lookAt(this.controls.target),
    });
  }

  resetCamera(): void {
    this.moveFocus(new THREE.Vector3(0, 0, 0), true);
    gsap.to(this.camera.position, { x: 130, y: -150, z: 115, duration: 0.6, ease: "power3.inOut" });
  }

  focusMaze(): void {
    this.moveFocus(this.getMazeCenter(), true);
  }

  focusBounds(bounds: Vec3Dict): void {
    const radiusZ = Math.max(0, Math.floor((bounds.z - 1) / 2));
    this.moveFocus(new THREE.Vector3(0, 0, radiusZ * GRID_TO_WORLD_SCALE * 0.5), true);
  }

  goBack(): void {
    if (this.focusHistoryIndex <= 0) return;
    this.focusHistoryIndex -= 1;
    this.moveFocus(this.focusHistory[this.focusHistoryIndex], false);
  }

  goForward(): void {
    if (this.focusHistoryIndex >= this.focusHistory.length - 1) return;
    this.focusHistoryIndex += 1;
    this.moveFocus(this.focusHistory[this.focusHistoryIndex], false);
  }

  private moveFocus(target: THREE.Vector3, pushHistory: boolean): void {
    const current = this.controls.target;
    const cameraDelta = this.camera.position.clone().sub(current);

    if (pushHistory) {
      this.focusHistory = this.focusHistory.slice(0, this.focusHistoryIndex + 1);
      const last = this.focusHistory[this.focusHistory.length - 1];
      if (!last || last.distanceTo(target) > 0.01) {
        this.focusHistory.push(target.clone());
        this.focusHistoryIndex = this.focusHistory.length - 1;
      }
    }

    gsap.to(this.controls.target, { x: target.x, y: target.y, z: target.z, duration: 0.55, ease: "power3.inOut" });
    gsap.to(this.camera.position, {
      x: target.x + cameraDelta.x,
      y: target.y + cameraDelta.y,
      z: target.z + cameraDelta.z,
      duration: 0.55,
      ease: "power3.inOut",
    });
  }

  private createPerspectiveCamera(): THREE.PerspectiveCamera {
    return new THREE.PerspectiveCamera(60, this.host.clientWidth / Math.max(this.host.clientHeight, 1), 1, 5000);
  }

  private createOrthographicCamera(): THREE.OrthographicCamera {
    const aspect = this.host.clientWidth / Math.max(this.host.clientHeight, 1);
    const halfHeight = this.orthoHeight / 2;
    return new THREE.OrthographicCamera(-halfHeight * aspect, halfHeight * aspect, halfHeight, -halfHeight, 1, 5000);
  }

  private updateCameraProjection(): void {
    const width = Math.max(this.host.clientWidth, 1);
    const height = Math.max(this.host.clientHeight, 1);
    if (this.camera instanceof THREE.PerspectiveCamera) {
      this.camera.aspect = width / height;
    } else {
      const halfHeight = this.orthoHeight / 2;
      const halfWidth = halfHeight * (width / height);
      this.camera.left = -halfWidth;
      this.camera.right = halfWidth;
      this.camera.top = halfHeight;
      this.camera.bottom = -halfHeight;
    }
    this.camera.updateProjectionMatrix();
  }

  private getMazeCenter(): THREE.Vector3 {
    const rails = this.activeLayout?.Rail ?? [];
    const cells = rails.flatMap((rail) => (rail.Occupied_Cells_Rev.length > 0 ? rail.Occupied_Cells_Rev : [rail.Pos_Rev]));
    if (cells.length === 0) return new THREE.Vector3(0, 0, 0);

    const xs = cells.map((cell) => cell.x * GRID_TO_WORLD_SCALE);
    const ys = cells.map((cell) => -cell.y * GRID_TO_WORLD_SCALE);
    const zs = cells.map((cell) => cell.z * GRID_TO_WORLD_SCALE);
    return new THREE.Vector3(
      (Math.min(...xs) + Math.max(...xs)) / 2,
      (Math.min(...ys) + Math.max(...ys)) / 2,
      (Math.min(...zs) + Math.max(...zs)) / 2,
    );
  }

  private setupBaseScene(): void {
    const gridSize = 3200;
    const gridDivisions = gridSize / GRID_TO_WORLD_SCALE;
    const gridHelper = new THREE.GridHelper(gridSize, gridDivisions, 0xd6d8d4, 0xeeeeea);
    gridHelper.rotation.x = Math.PI / 2;
    gridHelper.position.set(GRID_TO_WORLD_SCALE / 2, GRID_TO_WORLD_SCALE / 2, 0);
    this.scene.add(gridHelper);

    const axesHelper = new THREE.AxesHelper(50);
    axesHelper.scale.set(1, -1, 1);
    this.scene.add(axesHelper);

    const light = new THREE.DirectionalLight(0xffffff, 1.2);
    light.position.set(50, 200, 120);
    this.scene.add(light);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.45));
  }

  private drawBounds(): void {
    if (!this.root) return;
    const half = GRID_TO_WORLD_SCALE / 2;
    const radiusX = Math.max(0, Math.floor((this.bounds.x - 1) / 2));
    const radiusY = Math.max(0, Math.floor((this.bounds.y - 1) / 2));
    const radiusZ = Math.max(0, Math.floor((this.bounds.z - 1) / 2));
    const minX = -radiusX * GRID_TO_WORLD_SCALE - half;
    const maxX = radiusX * GRID_TO_WORLD_SCALE + half;
    const minY = -radiusY * GRID_TO_WORLD_SCALE - half;
    const maxY = radiusY * GRID_TO_WORLD_SCALE + half;
    const minZ = -radiusZ * GRID_TO_WORLD_SCALE - half;
    const maxZ = radiusZ * GRID_TO_WORLD_SCALE + half;
    const boxGeo = new THREE.BoxGeometry(maxX - minX, maxY - minY, maxZ - minZ);
    const edges = new THREE.EdgesGeometry(boxGeo);
    const line = new THREE.LineSegments(
      edges,
      new THREE.LineDashedMaterial({ color: 0x9da39f, dashSize: 4, gapSize: 2, transparent: true, opacity: 0.7 }),
    );
    line.computeLineDistances();
    line.position.set((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
    this.root.add(line);
  }

  private drawRails(rails: MazeRailJson[]): void {
    if (!this.root) return;
    const arrowGeos = this.createArrowGeometries();
    const arrowCount =
      rails.reduce((count, rail) => count + rail.Exit.filter((exit) => exit.Exit_Pos_Abs).length + (rail.Prev_Index !== -1 ? 1 : 0), 0) || 1;
    const exitCount = rails.reduce((count, rail) => count + rail.Exit.filter((exit) => exit.Exit_Pos_Abs).length, 0) || 1;

    this.blockMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }),
      Math.max(rails.length, 1),
    );
    this.blockMesh.userData.isBlock = true;
    this.blockMesh.userData.instanceMap = [];
    this.root.add(this.blockMesh);

    this.shaftMesh = new THREE.InstancedMesh(arrowGeos.shaft, new THREE.MeshLambertMaterial({ color: 0xffffff }), arrowCount);
    this.headMesh = new THREE.InstancedMesh(arrowGeos.head, new THREE.MeshLambertMaterial({ color: 0xffffff }), arrowCount);
    this.exitMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.7, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }), exitCount);
    this.root.add(this.shaftMesh, this.headMesh, this.exitMesh);

    const dummy = new THREE.Object3D();
    let blockIdx = 0;
    rails.forEach((rail) => {
      const { center, size } = this.railBounds(rail);
      const color = this.railColor(rail.Rail_ID);
      dummy.position.set(center.x, center.y, center.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(size.x, size.y, size.z);
      dummy.updateMatrix();
      this.blockMesh?.setMatrixAt(blockIdx, dummy.matrix);
      this.blockMesh?.setColorAt(blockIdx, color);
      const meta: RailMeta = {
        id: rail.Rail_Index,
        type: rail.Rail_ID,
        pos: rail.Pos_Abs,
        posRev: rail.Pos_Rev,
        rot: rail.Rot_Abs,
        diff: rail.Diff_Act,
      };
      this.railDataMap.set(rail.Rail_Index, meta);
      this.blockMesh!.userData.instanceMap[blockIdx] = meta;
      this.addTextSprite(rail.Rail_Index, new THREE.Vector3(center.x, center.y, center.z));
      blockIdx += 1;
    });
    this.blockMesh.instanceMatrix.needsUpdate = true;
    if (this.blockMesh.instanceColor) this.blockMesh.instanceColor.needsUpdate = true;

    let arrowIdx = 0;
    let exitIdx = 0;
    rails.forEach((rail) => {
      const railBasis = this.getRailBasis(rail.Rot_Abs);
      const prev = rails.find((candidate) => candidate.Rail_Index === rail.Prev_Index);
      const connectedExit = prev?.Exit.find((exit) => exit.TargetInstanceID === rail.Rail_Index);
      if (connectedExit) {
        const pos = new THREE.Vector3(connectedExit.Exit_Pos_Abs.x, -connectedExit.Exit_Pos_Abs.y, connectedExit.Exit_Pos_Abs.z);
        arrowIdx = this.addArrow(arrowIdx, pos.clone().sub(this.getDirVector(connectedExit.Exit_Dir_Abs).multiplyScalar(8)), 4, true, connectedExit.Exit_Dir_Abs, railBasis);
        this.addArrowIndex(rail.Rail_Index, arrowIdx - 1);
      }

      rail.Exit.forEach((exit) => {
        const pos = new THREE.Vector3(exit.Exit_Pos_Abs.x, -exit.Exit_Pos_Abs.y, exit.Exit_Pos_Abs.z);
        const dir = this.getDirVector(exit.Exit_Dir_Abs);
        arrowIdx = this.addArrow(arrowIdx, pos.clone().sub(dir.clone().multiplyScalar(12)), 4, false, exit.Exit_Dir_Abs, railBasis);
        this.addArrowIndex(rail.Rail_Index, arrowIdx - 1);
        dummy.scale.set(1, 1, 1);
        dummy.position.copy(pos);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        this.exitMesh?.setMatrixAt(exitIdx, dummy.matrix);
        this.exitMesh?.setColorAt(exitIdx, exit.IsConnected ? new THREE.Color(0x46d483) : new THREE.Color(0xf06363));
        exitIdx += 1;
      });

      if (prev) {
        const pts = [
          new THREE.Vector3(prev.Pos_Abs.x, -prev.Pos_Abs.y, prev.Pos_Abs.z),
          new THREE.Vector3(rail.Pos_Abs.x, -rail.Pos_Abs.y, rail.Pos_Abs.z),
        ];
        this.root?.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x303633, opacity: 0.22, transparent: true })));
      }
    });

    for (const mesh of [this.shaftMesh, this.headMesh, this.exitMesh]) {
      if (!mesh) continue;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  private railBounds(rail: MazeRailJson): { center: THREE.Vector3; size: THREE.Vector3 } {
    const cells = this.visualCellsForRail(rail);
    const xs = cells.map((cell) => cell.x * GRID_TO_WORLD_SCALE);
    const ys = cells.map((cell) => -cell.y * GRID_TO_WORLD_SCALE);
    const zs = cells.map((cell) => cell.z * GRID_TO_WORLD_SCALE);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    return {
      center: new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2),
      size: new THREE.Vector3(maxX - minX + GRID_TO_WORLD_SCALE - 1, maxY - minY + GRID_TO_WORLD_SCALE - 1, maxZ - minZ + GRID_TO_WORLD_SCALE - 1),
    };
  }

  private visualCellsForRail(rail: MazeRailJson): Vec3Dict[] {
    return rail.Occupied_Cells_Rev.length > 0 ? rail.Occupied_Cells_Rev : [rail.Pos_Rev];
  }

  private addArrow(
    idx: number,
    origin: THREE.Vector3,
    length: number,
    connected: boolean,
    dirAbs: string,
    basis: { fwd: THREE.Vector3; up: THREE.Vector3 },
  ): number {
    if (!this.shaftMesh || !this.headMesh) return idx;
    const dummy = new THREE.Object3D();
    const headScale = 1.5;
    const shaftLen = Math.max(0.1, length - headScale);
    const dir = this.getDirVector(dirAbs).normalize();
    let vecZ = basis.up.clone().normalize();
    if (Math.abs(dir.dot(vecZ)) > 0.99) vecZ = basis.fwd.clone().normalize();
    const vecX = new THREE.Vector3().crossVectors(dir, vecZ).normalize();
    vecZ.crossVectors(vecX, dir).normalize();
    const quat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(vecX, dir, vecZ));
    const color = new THREE.Color(connected ? 0x46d483 : 0xf06363);

    dummy.scale.set(1, shaftLen, 1);
    dummy.position.copy(origin);
    dummy.quaternion.copy(quat);
    dummy.updateMatrix();
    this.shaftMesh.setMatrixAt(idx, dummy.matrix);
    this.shaftMesh.setColorAt(idx, color);

    dummy.scale.set(1, headScale, 1);
    dummy.position.copy(origin).add(dir.clone().multiplyScalar(shaftLen));
    dummy.quaternion.copy(quat);
    dummy.updateMatrix();
    this.headMesh.setMatrixAt(idx, dummy.matrix);
    this.headMesh.setColorAt(idx, color);
    return idx + 1;
  }

  private addTextSprite(id: number, pos: THREE.Vector3): void {
    if (!this.root) return;
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.font = "700 58px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillStyle = "white";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.strokeStyle = "#101214";
    ctx.lineWidth = 5;
    ctx.strokeText(String(id), 64, 64);
    ctx.fillText(String(id), 64, 64);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false }));
    sprite.scale.set(8, 8, 1);
    sprite.position.copy(pos);
    sprite.renderOrder = 10;
    sprite.userData = { isText: true, id };
    this.spriteMap.set(id, sprite);
    this.root.add(sprite);
  }

  private handleMouseMove = (event: MouseEvent): void => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);
    let found: RailMeta | null = null;

    for (const hit of intersects) {
      const obj = hit.object as THREE.Object3D & { userData: Record<string, unknown> };
      if (obj.userData.isBlock && hit.instanceId !== undefined) {
        found = (obj.userData.instanceMap as RailMeta[])[hit.instanceId] ?? null;
        break;
      }
      if (obj.userData.isText) {
        found = this.railDataMap.get(Number(obj.userData.id)) ?? null;
        break;
      }
    }

    this.setHover(found?.id ?? null);
    this.onHover?.(found);
  };

  private setHover(id: number | null): void {
    if (this.lastHoveredId === id) return;
    if (this.lastHoveredId !== null) {
      const previous = this.spriteMap.get(this.lastHoveredId);
      if (previous) {
        gsap.to(previous.scale, { x: 8, y: 8, duration: 0.18, ease: "power2.out" });
        (previous.material as THREE.SpriteMaterial).color.set(0xffffff);
      }
      this.resetArrowHover();
    }

    this.lastHoveredId = id;
    if (id === null) return;
    const sprite = this.spriteMap.get(id);
    if (sprite) {
      (sprite.material as THREE.SpriteMaterial).color.set(0xffe873);
      gsap.to(sprite.scale, { x: 12, y: 12, duration: 0.18, ease: "power2.out" });
    }
    this.highlightArrows(id);
  }

  private highlightArrows(id: number): void {
    if (!this.shaftMesh || !this.headMesh) return;
    const ids = this.railArrowMap.get(id) ?? [];
    const tempColor = new THREE.Color();
    const tempMatrix = new THREE.Matrix4();
    const tempPos = new THREE.Vector3();
    const tempQuat = new THREE.Quaternion();
    const tempScale = new THREE.Vector3();

    ids.forEach((idx) => {
      this.shaftMesh!.getColorAt(idx, tempColor);
      this.arrowColorCache.set(idx, tempColor.clone());
      this.shaftMesh!.getMatrixAt(idx, tempMatrix);
      this.arrowScaleCache.set(`s${idx}`, tempMatrix.clone());
      tempMatrix.decompose(tempPos, tempQuat, tempScale);
      tempScale.multiplyScalar(1.7);
      tempMatrix.compose(tempPos, tempQuat, tempScale);
      this.shaftMesh!.setMatrixAt(idx, tempMatrix);

      this.headMesh!.getMatrixAt(idx, tempMatrix);
      this.arrowScaleCache.set(`h${idx}`, tempMatrix.clone());
      tempMatrix.decompose(tempPos, tempQuat, tempScale);
      tempScale.multiplyScalar(1.7);
      tempMatrix.compose(tempPos, tempQuat, tempScale);
      this.headMesh!.setMatrixAt(idx, tempMatrix);
      this.shaftMesh!.setColorAt(idx, new THREE.Color(0xffe873));
      this.headMesh!.setColorAt(idx, new THREE.Color(0xffe873));
    });

    this.shaftMesh.instanceMatrix.needsUpdate = true;
    this.headMesh.instanceMatrix.needsUpdate = true;
    if (this.shaftMesh.instanceColor) this.shaftMesh.instanceColor.needsUpdate = true;
    if (this.headMesh.instanceColor) this.headMesh.instanceColor.needsUpdate = true;
  }

  private resetArrowHover(): void {
    if (!this.shaftMesh || !this.headMesh) return;
    for (const [idx, color] of this.arrowColorCache.entries()) {
      this.shaftMesh.setColorAt(idx, color);
      this.headMesh.setColorAt(idx, color);
      const shaft = this.arrowScaleCache.get(`s${idx}`);
      const head = this.arrowScaleCache.get(`h${idx}`);
      if (shaft) this.shaftMesh.setMatrixAt(idx, shaft);
      if (head) this.headMesh.setMatrixAt(idx, head);
    }
    this.arrowColorCache.clear();
    this.arrowScaleCache.clear();
    this.shaftMesh.instanceMatrix.needsUpdate = true;
    this.headMesh.instanceMatrix.needsUpdate = true;
    if (this.shaftMesh.instanceColor) this.shaftMesh.instanceColor.needsUpdate = true;
    if (this.headMesh.instanceColor) this.headMesh.instanceColor.needsUpdate = true;
  }

  private createArrowGeometries(): { shaft: THREE.BoxGeometry; head: THREE.ExtrudeGeometry } {
    const shaft = new THREE.BoxGeometry(1.5, 1, 0.4);
    shaft.translate(0, 0.5, 0);
    const shape = new THREE.Shape();
    shape.moveTo(-2, 0);
    shape.lineTo(2, 0);
    shape.lineTo(0, 1);
    shape.lineTo(-2, 0);
    const head = new THREE.ExtrudeGeometry(shape, { depth: 0.4, bevelEnabled: false });
    head.translate(0, 0, -0.2);
    return { shaft, head };
  }

  private railColor(railId: string): THREE.Color {
    const lower = railId.toLowerCase();
    if (lower.includes("start")) return new THREE.Color(0x2856ff);
    if (lower.includes("end")) return new THREE.Color(0x303633);
    if (lower.includes("checkpoint")) return new THREE.Color(0x6f7cff);
    return new THREE.Color(0xe9ecff);
  }

  private getRailBasis(rotAbs: { p?: number; y?: number; r?: number }): { fwd: THREE.Vector3; up: THREE.Vector3 } {
    const euler = new THREE.Euler(
      THREE.MathUtils.degToRad(rotAbs.r ?? 0),
      THREE.MathUtils.degToRad(rotAbs.p ?? 0),
      THREE.MathUtils.degToRad(rotAbs.y ?? 0),
      "ZYX",
    );
    return {
      fwd: new THREE.Vector3(1, 0, 0).applyEuler(euler),
      up: new THREE.Vector3(0, 0, 1).applyEuler(euler),
    };
  }

  private getDirVector(dirStr: string): THREE.Vector3 {
    if (dirStr === "+X") return new THREE.Vector3(1, 0, 0);
    if (dirStr === "-X") return new THREE.Vector3(-1, 0, 0);
    if (dirStr === "+Y") return new THREE.Vector3(0, -1, 0);
    if (dirStr === "-Y") return new THREE.Vector3(0, 1, 0);
    if (dirStr === "+Z") return new THREE.Vector3(0, 0, 1);
    if (dirStr === "-Z") return new THREE.Vector3(0, 0, -1);
    return new THREE.Vector3(0, 0, 1);
  }

  private addArrowIndex(railId: number, arrowIdx: number): void {
    const current = this.railArrowMap.get(railId) ?? [];
    current.push(arrowIdx);
    this.railArrowMap.set(railId, current);
  }

  private resize = (): void => {
    const width = this.host.clientWidth;
    const height = this.host.clientHeight;
    this.updateCameraProjection();
    this.renderer.setSize(width, height);
  };

  private animate = (): void => {
    requestAnimationFrame(this.animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };
}
