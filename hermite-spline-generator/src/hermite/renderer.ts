import { ArcSegment, GenerationResult, Vec3, evalHermite, getArcPoints } from "./math";

interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

const colors = ["#c0362c", "#167a44", "#2856ff", "#9b45c4", "#d28716", "#008e9b", "#111111"];

export interface HoverPoint {
  label: string;
  point: Vec3;
  tangent: Vec3;
}

interface Hotspot extends HoverPoint {
  x: number;
  y: number;
  radius: number;
}

export class CurveRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private result: GenerationResult | null = null;
  private hotspots: Hotspot[] = [];
  onHover?: (point: HoverPoint | null, position?: { x: number; y: number }) => void;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context is unavailable");
    this.ctx = ctx;
    this.resize();
    this.canvas.addEventListener("mousemove", (event) => this.handleMouseMove(event));
    this.canvas.addEventListener("mouseleave", () => this.onHover?.(null));
    window.addEventListener("resize", () => {
      this.resize();
      this.draw();
    });
  }

  setResult(result: GenerationResult): void {
    this.result = result;
    this.draw();
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  draw(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.hotspots = [];
    this.ctx.clearRect(0, 0, rect.width, rect.height);
    this.drawGrid(rect.width, rect.height);
    if (!this.result) return;

    const bounds = this.getBounds(this.result);
    const map = this.projector(bounds, rect.width, rect.height);
    this.drawAxes(map, bounds, rect.width, rect.height);

    if (this.result.arcs) {
      for (const arc of this.result.arcs) this.drawArc(arc, map);
    }

    this.drawReference(this.result, map);
    this.result.parallelCurves.forEach((curve, index) => {
      this.ctx.strokeStyle = colors[index % colors.length];
      this.ctx.fillStyle = colors[index % colors.length];
      this.ctx.lineWidth = 2;
      this.drawCurveSegments(curve.map((segment) => ({ p0: segment.p0, p1: segment.p1, t0: segment.t0, t1: segment.t1 })), map);
      for (const [segmentIndex, segment] of curve.entries()) {
        this.drawPoint(segment.p0, map, 3, `Parallel_${index} P${segmentIndex}`, segment.t0);
        this.drawPoint(segment.p1, map, 3, `Parallel_${index} P${segmentIndex + 1}`, segment.t1);
        this.drawTangent(segment.p0, segment.t0, map, 0.28);
        this.drawTangent(segment.p1, segment.t1, map, 0.28);
      }
    });
  }

  private drawGrid(width: number, height: number): void {
    this.ctx.fillStyle = "#fbfbf8";
    this.ctx.fillRect(0, 0, width, height);
    this.ctx.fillStyle = "#d9d9d3";
    for (let x = 0; x < width; x += 20) {
      for (let y = 0; y < height; y += 20) {
        this.ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  private getBounds(result: GenerationResult): Bounds {
    const points: Vec3[] = [...result.controlPoints, ...result.tangents.map((tangent, i) => ({
      x: (result.controlPoints[i]?.x ?? 0) + tangent.x * 0.35,
      y: (result.controlPoints[i]?.y ?? 0) + tangent.y * 0.35,
      z: 0,
    }))];
    for (const arc of result.arcs ?? []) {
      points.push(arc.center, ...getArcPoints(arc, 32));
    }
    for (const curve of result.parallelCurves) {
      for (const segment of curve) {
        points.push(segment.p0, segment.p1);
        for (let i = 0; i <= 16; i += 1) points.push(evalHermite(segment.p0, segment.p1, segment.t0, segment.t1, i / 16));
      }
    }
    for (const segment of this.getReferenceSegments(result)) {
      for (let j = 0; j <= 16; j += 1) points.push(evalHermite(segment.p0, segment.p1, segment.t0, segment.t1, j / 16));
    }
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const padX = Math.max((maxX - minX) * 0.12, 1);
    const padY = Math.max((maxY - minY) * 0.12, 1);
    return { minX: minX - padX, maxX: maxX + padX, minY: minY - padY, maxY: maxY + padY };
  }

  private projector(bounds: Bounds, width: number, height: number): (point: Vec3) => [number, number] {
    const dataWidth = Math.max(bounds.maxX - bounds.minX, 1);
    const dataHeight = Math.max(bounds.maxY - bounds.minY, 1);
    const scale = Math.min((width - 72) / dataWidth, (height - 72) / dataHeight);
    const offsetX = (width - dataWidth * scale) / 2;
    const offsetY = (height - dataHeight * scale) / 2;
    return (point: Vec3) => [
      offsetX + (point.x - bounds.minX) * scale,
      offsetY + (point.y - bounds.minY) * scale,
    ];
  }

  private drawAxes(map: (point: Vec3) => [number, number], bounds: Bounds, width: number, height: number): void {
    this.ctx.save();
    this.ctx.strokeStyle = "#c8c8c0";
    this.ctx.lineWidth = 1;
    if (bounds.minY <= 0 && bounds.maxY >= 0) {
      const [, y] = map({ x: 0, y: 0, z: 0 });
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(width, y);
      this.ctx.stroke();
    }
    if (bounds.minX <= 0 && bounds.maxX >= 0) {
      const [x] = map({ x: 0, y: 0, z: 0 });
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, height);
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  private drawArc(arc: ArcSegment, map: (point: Vec3) => [number, number]): void {
    const points = getArcPoints(arc, 100);
    this.ctx.strokeStyle = "#2c3230";
    this.ctx.lineWidth = 1.5;
    this.ctx.setLineDash([4, 4]);
    this.drawPolyline(points, map);
    this.ctx.setLineDash([]);
    this.ctx.fillStyle = "#68706c";
    this.drawCross(arc.center, map);
  }

  private drawReference(result: GenerationResult, map: (point: Vec3) => [number, number]): void {
    const segments = this.getReferenceSegments(result);
    this.ctx.strokeStyle = "#2856ff";
    this.ctx.fillStyle = "#2856ff";
    this.ctx.lineWidth = 2.5;
    this.drawCurveSegments(segments, map);
    for (const [index, segment] of segments.entries()) {
      this.drawPoint(segment.p0, map, 4, `P${index}`, segment.t0);
      this.drawLabel(`P${index}`, segment.p0, map);
      if (index === segments.length - 1) {
        this.drawPoint(segment.p1, map, 4, `P${index + 1}`, segment.t1);
        this.drawLabel(`P${index + 1}`, segment.p1, map);
      }
      this.drawTangent(segment.p0, segment.t0, map, 0.32);
      this.drawTangent(segment.p1, segment.t1, map, 0.32);
    }
  }

  private getReferenceSegments(result: GenerationResult): Array<{ p0: Vec3; p1: Vec3; t0: Vec3; t1: Vec3 }> {
    return result.referenceSegments ?? result.controlPoints.slice(0, -1).map((p0, i) => ({
      p0,
      p1: result.controlPoints[i + 1],
      t0: result.segmentTangents?.[i]?.[0] ?? result.tangents[i],
      t1: result.segmentTangents?.[i]?.[1] ?? result.tangents[i + 1],
    }));
  }

  private drawCurveSegments(segments: Array<{ p0: Vec3; p1: Vec3; t0: Vec3; t1: Vec3 }>, map: (point: Vec3) => [number, number]): void {
    for (const segment of segments) {
      const points: Vec3[] = [];
      for (let i = 0; i <= 80; i += 1) points.push(evalHermite(segment.p0, segment.p1, segment.t0, segment.t1, i / 80));
      this.drawPolyline(points, map);
    }
  }

  private drawPolyline(points: Vec3[], map: (point: Vec3) => [number, number]): void {
    this.ctx.beginPath();
    points.forEach((point, index) => {
      const [x, y] = map(point);
      if (index === 0) this.ctx.moveTo(x, y);
      else this.ctx.lineTo(x, y);
    });
    this.ctx.stroke();
  }

  private drawPoint(point: Vec3, map: (point: Vec3) => [number, number], radius: number, label?: string, tangent?: Vec3): void {
    const [x, y] = map(point);
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);
    this.ctx.fill();
    if (label && tangent) {
      this.hotspots.push({ label, point, tangent, x, y, radius: Math.max(radius + 7, 10) });
    }
  }

  private drawTangent(point: Vec3, tangent: Vec3, map: (point: Vec3) => [number, number], scale: number): void {
    const start = map(point);
    const end = map({ x: point.x + tangent.x * scale, y: point.y + tangent.y * scale, z: 0 });
    this.ctx.save();
    this.ctx.globalAlpha = 0.72;
    this.ctx.setLineDash([5, 4]);
    this.ctx.beginPath();
    this.ctx.moveTo(start[0], start[1]);
    this.ctx.lineTo(end[0], end[1]);
    this.ctx.stroke();
    this.ctx.setLineDash([]);
    this.ctx.restore();
  }

  private drawCross(point: Vec3, map: (point: Vec3) => [number, number]): void {
    const [x, y] = map(point);
    this.ctx.beginPath();
    this.ctx.moveTo(x - 5, y - 5);
    this.ctx.lineTo(x + 5, y + 5);
    this.ctx.moveTo(x + 5, y - 5);
    this.ctx.lineTo(x - 5, y + 5);
    this.ctx.stroke();
  }

  private drawLabel(label: string, point: Vec3, map: (point: Vec3) => [number, number]): void {
    const [x, y] = map(point);
    this.ctx.fillStyle = "#2c3230";
    this.ctx.font = "10px JetBrains Mono, monospace";
    this.ctx.fillText(label, x + 7, y - 7);
    this.ctx.fillStyle = "#2856ff";
  }

  private handleMouseMove(event: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const hit = this.hotspots.find((spot) => Math.hypot(spot.x - x, spot.y - y) <= spot.radius);
    this.canvas.style.cursor = hit ? "crosshair" : "default";
    this.onHover?.(hit ?? null, hit ? { x: event.clientX, y: event.clientY } : undefined);
  }
}
