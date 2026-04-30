export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface ArcInput {
  radius: number;
  angleDeg: number;
  direction: 1 | -1;
}

export interface ArcSegment {
  radius: number;
  angleRad: number;
  direction: 1 | -1;
  startPoint: Vec3;
  endPoint: Vec3;
  center: Vec3;
  startTangentDirection: Vec3;
  endTangentDirection: Vec3;
  tangentStart: Vec3;
  tangentEnd: Vec3;
  startAngle: number;
  actualAngleDiff: number;
  tangentLength: number;
}

export interface SegmentResult {
  p0: Vec3;
  p1: Vec3;
  t0: Vec3;
  t1: Vec3;
  err: number;
}

export interface ReferenceSegment {
  p0: Vec3;
  p1: Vec3;
  t0: Vec3;
  t1: Vec3;
}

export interface ArcGroupInput {
  startPoint?: Vec3;
  startTangentDirection?: Vec3;
  arcs: ArcInput[];
}

export interface GenerationResult {
  controlPoints: Vec3[];
  tangents: Vec3[];
  referenceSegments?: ReferenceSegment[];
  segmentTangents?: Array<[Vec3, Vec3]>;
  arcs?: ArcSegment[];
  parallelCurves: SegmentResult[][];
}

export const vec = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });

export function add(a: Vec3, b: Vec3): Vec3 {
  return vec(a.x + b.x, a.y + b.y, a.z + b.z);
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return vec(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function mul(a: Vec3, n: number): Vec3 {
  return vec(a.x * n, a.y * n, a.z * n);
}

export function norm(a: Vec3): number {
  return Math.hypot(a.x, a.y, a.z);
}

export function normalize(a: Vec3): Vec3 {
  const length = norm(a);
  return length === 0 ? vec(a.x, a.y, a.z) : mul(a, 1 / length);
}

export function evalHermite(p0: Vec3, p1: Vec3, t0: Vec3, t1: Vec3, a: number): Vec3 {
  const a2 = a ** 2;
  const a3 = a ** 3;
  const h00 = 2 * a3 - 3 * a2 + 1;
  const h01 = -2 * a3 + 3 * a2;
  const h10 = a3 - 2 * a2 + a;
  const h11 = a3 - a2;
  return vec(
    h00 * p0.x + h01 * p1.x + h10 * t0.x + h11 * t1.x,
    h00 * p0.y + h01 * p1.y + h10 * t0.y + h11 * t1.y,
    h00 * p0.z + h01 * p1.z + h10 * t0.z + h11 * t1.z,
  );
}

export function calculateExactTangentLength(radius: number, angleRad: number): number {
  const safeRadius = Math.max(Math.abs(radius), 0.000001);
  const angle = Math.abs(angleRad);
  const error = (k: number): number => {
    let total = 0;
    for (let i = 0; i < 100; i += 1) {
      const t = i / 99;
      const curve = evalHermite(
        vec(0, 0, 0),
        vec(radius * Math.sin(angle), radius * (1 - Math.cos(angle)), 0),
        vec(k, 0, 0),
        vec(k * Math.cos(angle), k * Math.sin(angle), 0),
        t,
      );
      const theta = t * angle;
      const arc = vec(radius * Math.sin(theta), radius * (1 - Math.cos(theta)), 0);
      total += norm(sub(curve, arc));
    }
    return total;
  };

  let lo = 0;
  let hi = Math.max(safeRadius * 8, 1);
  const phi = (Math.sqrt(5) - 1) / 2;
  let x1 = hi - (hi - lo) * phi;
  let x2 = lo + (hi - lo) * phi;
  let f1 = error(x1);
  let f2 = error(x2);
  for (let i = 0; i < 90; i += 1) {
    if (f1 > f2) {
      lo = x1;
      x1 = x2;
      f1 = f2;
      x2 = lo + (hi - lo) * phi;
      f2 = error(x2);
    } else {
      hi = x2;
      x2 = x1;
      f2 = f1;
      x1 = hi - (hi - lo) * phi;
      f1 = error(x1);
    }
  }
  return (lo + hi) / 2;
}

export function buildArcSegments(startPoint: Vec3, arcInputs: ArcInput[], initialTangentDirection: Vec3 = vec(1, 0, 0)): ArcSegment[] {
  const segments: ArcSegment[] = [];
  for (const input of arcInputs) {
    const prev = segments.length > 0 ? segments[segments.length - 1] : undefined;
    const radius = Number(input.radius);
    const angleRad = (Number(input.angleDeg) * Math.PI) / 180;
    const direction = input.direction;
    const segmentStart = prev ? prev.endPoint : startPoint;
    const startTangentDirection = prev ? prev.endTangentDirection : normalize(initialTangentDirection);
    const cosTheta = startTangentDirection.x;
    const sinTheta = startTangentDirection.y;

    const rotate = (local: Vec3): Vec3 =>
      vec(
        cosTheta * local.x - sinTheta * local.y,
        sinTheta * local.x + cosTheta * local.y,
        local.z,
      );

    const center = add(segmentStart, rotate(vec(0, direction * radius, 0)));
    const endOffset = vec(radius * Math.sin(angleRad), direction * radius * (1 - Math.cos(angleRad)), 0);
    const endPoint = add(segmentStart, rotate(endOffset));
    const endTangentDirection = rotate(vec(Math.cos(direction * angleRad), Math.sin(direction * angleRad), 0));
    const tangentLength = calculateExactTangentLength(radius, angleRad);
    const tangentStart = mul(startTangentDirection, tangentLength);
    const tangentEnd = mul(endTangentDirection, tangentLength);
    const startVector = sub(segmentStart, center);
    const endVector = sub(endPoint, center);
    const startAngle = Math.atan2(startVector.y, startVector.x);
    const endAngle = Math.atan2(endVector.y, endVector.x);
    let actualAngleDiff = endAngle - startAngle;
    if (direction === 1 && actualAngleDiff < 0) actualAngleDiff += 2 * Math.PI;
    if (direction === -1 && actualAngleDiff > 0) actualAngleDiff -= 2 * Math.PI;

    segments.push({
      radius,
      angleRad,
      direction,
      startPoint: segmentStart,
      endPoint,
      center,
      startTangentDirection,
      endTangentDirection,
      tangentStart,
      tangentEnd,
      startAngle,
      actualAngleDiff,
      tangentLength,
    });
  }
  return segments;
}

export function getArcPoints(segment: ArcSegment, count = 120): Vec3[] {
  const points: Vec3[] = [];
  for (let i = 0; i < count; i += 1) {
    const angle = segment.startAngle + segment.actualAngleDiff * (i / Math.max(count - 1, 1));
    points.push(vec(
      segment.center.x + segment.radius * Math.cos(angle),
      segment.center.y + segment.radius * Math.sin(angle),
      0,
    ));
  }
  return points;
}

export function getErr(
  pa0: Vec3,
  pa1: Vec3,
  ta0: Vec3,
  ta1: Vec3,
  pb0: Vec3,
  pb1: Vec3,
  tb0: Vec3,
  tb1: Vec3,
  target: number,
  step: number,
): [number, number] {
  let sum = 0;
  let max = 0;
  let count = 0;
  for (let a = 0; a <= 1 + step * 0.5; a += step) {
    const clamped = Math.min(a, 1);
    const distSqr = (norm(sub(evalHermite(pa0, pa1, ta0, ta1, clamped), evalHermite(pb0, pb1, tb0, tb1, clamped))) - target) ** 2;
    sum += distSqr;
    max = Math.max(max, distSqr);
    count += 1;
  }
  return [sum / Math.max(count, 1), max];
}

export function fit(
  pa0: Vec3,
  pa1: Vec3,
  ta0: Vec3,
  ta1: Vec3,
  pb0: Vec3,
  pb1: Vec3,
  step: number,
): [Vec3, Vec3, number] {
  const target = norm(sub(pa0, pb0));
  const delta = 0.001;
  let minA = delta;
  let minErr = Number.POSITIVE_INFINITY;
  for (let a = delta; a < 3; a += delta) {
    const err = getErr(pa0, pa1, ta0, ta1, pb0, pb1, mul(ta0, a), mul(ta1, a), target, step)[0];
    if (err < minErr) {
      minErr = err;
      minA = a;
    }
  }

  const fineStart = minA - delta * 0.5;
  const fineEnd = minA + delta * 0.5;
  for (let a = fineStart; a < fineEnd; a += delta * delta) {
    const err = getErr(pa0, pa1, ta0, ta1, pb0, pb1, mul(ta0, a), mul(ta1, a), target, step)[0];
    if (err < minErr) {
      minErr = err;
      minA = a;
    }
  }
  return [mul(ta0, minA), mul(ta1, minA), minErr];
}

export function calculateNormal(tangent: Vec3): Vec3 {
  return normalize(vec(-tangent.y, tangent.x, 0));
}

export function generateParallelCurve(pa0: Vec3, pa1: Vec3, ta0: Vec3, ta1: Vec3, gap: number, step: number): SegmentResult {
  const pb0 = add(pa0, mul(calculateNormal(ta0), gap));
  const pb1 = add(pa1, mul(calculateNormal(ta1), gap));
  const [tb0, tb1, err] = fit(pa0, pa1, ta0, ta1, pb0, pb1, step);
  return { p0: pb0, p1: pb1, t0: tb0, t1: tb1, err };
}

export function generateMultipleParallelCurves(
  controlPoints: Vec3[],
  tangents: Vec3[],
  gap: number,
  numCurves: number,
  step: number,
  segmentTangents?: Array<[Vec3, Vec3]>,
): SegmentResult[][] {
  const nSegments = Math.max(controlPoints.length - 1, 0);
  const baseSegments = Array.from({ length: nSegments }, (_, i) => ({
    p0: controlPoints[i],
    p1: controlPoints[i + 1],
    t0: segmentTangents?.[i]?.[0] ?? tangents[i],
    t1: segmentTangents?.[i]?.[1] ?? tangents[i + 1],
  }));
  let positiveSegments = baseSegments;
  let negativeSegments = baseSegments;
  const allCurves: Array<{ segments: SegmentResult[]; avgY: number }> = [];

  for (let i = 0; i < numCurves; i += 1) {
    const currentGap = (i < 2 ? gap / 2 : gap) * (i % 2 === 1 ? -1 : 1);
    const source = i % 2 === 0 ? positiveSegments : negativeSegments;
    const segments = source.map((segment) => generateParallelCurve(segment.p0, segment.p1, segment.t0, segment.t1, currentGap, step));
    const avgY = segments.reduce((sum, segment) => sum + (segment.p0.y + segment.p1.y) / 2, 0) / Math.max(segments.length, 1);
    allCurves.push({ segments, avgY });
    const nextBase = segments.map((segment) => ({ p0: segment.p0, p1: segment.p1, t0: segment.t0, t1: segment.t1 }));
    if (i % 2 === 0) positiveSegments = nextBase;
    else negativeSegments = nextBase;
  }

  return allCurves.sort((a, b) => a.avgY - b.avgY).map((curve) => curve.segments);
}

export function generateMultipleParallelCurvesFromSegments(
  referenceSegments: ReferenceSegment[],
  gap: number,
  numCurves: number,
  step: number,
): SegmentResult[][] {
  let positiveSegments = referenceSegments;
  let negativeSegments = referenceSegments;
  const allCurves: Array<{ segments: SegmentResult[]; avgY: number }> = [];

  for (let i = 0; i < numCurves; i += 1) {
    const currentGap = (i < 2 ? gap / 2 : gap) * (i % 2 === 1 ? -1 : 1);
    const source = i % 2 === 0 ? positiveSegments : negativeSegments;
    const segments = source.map((segment) => generateParallelCurve(segment.p0, segment.p1, segment.t0, segment.t1, currentGap, step));
    const avgY = segments.reduce((sum, segment) => sum + (segment.p0.y + segment.p1.y) / 2, 0) / Math.max(segments.length, 1);
    allCurves.push({ segments, avgY });
    const nextBase = segments.map((segment) => ({ p0: segment.p0, p1: segment.p1, t0: segment.t0, t1: segment.t1 }));
    if (i % 2 === 0) positiveSegments = nextBase;
    else negativeSegments = nextBase;
  }

  return allCurves.sort((a, b) => a.avgY - b.avgY).map((curve) => curve.segments);
}

function referenceSegmentsFromArcs(arcSegments: ArcSegment[]): ReferenceSegment[] {
  return arcSegments.map((segment) => ({
    p0: segment.startPoint,
    p1: segment.endPoint,
    t0: segment.tangentStart,
    t1: segment.tangentEnd,
  }));
}

function pointsAndTangentsFromReferenceSegments(referenceSegments: ReferenceSegment[]): { controlPoints: Vec3[]; tangents: Vec3[] } {
  if (referenceSegments.length === 0) return { controlPoints: [], tangents: [] };
  const controlPoints: Vec3[] = [];
  const tangents: Vec3[] = [];
  for (const segment of referenceSegments) {
    controlPoints.push(segment.p0);
    tangents.push(segment.t0);
  }
  const last = referenceSegments[referenceSegments.length - 1];
  controlPoints.push(last.p1);
  tangents.push(last.t1);
  return { controlPoints, tangents };
}

export function generateFromArcs(startPoint: Vec3, arcs: ArcInput[], gap: number, numCurves: number, step: number): GenerationResult {
  const arcSegments = buildArcSegments(startPoint, arcs);
  const referenceSegments = referenceSegmentsFromArcs(arcSegments);
  const { controlPoints, tangents } = pointsAndTangentsFromReferenceSegments(referenceSegments);
  const segmentTangents = arcSegments.map((segment) => [segment.tangentStart, segment.tangentEnd] as [Vec3, Vec3]);
  return {
    controlPoints,
    tangents,
    referenceSegments,
    segmentTangents,
    arcs: arcSegments,
    parallelCurves: generateMultipleParallelCurvesFromSegments(referenceSegments, gap, numCurves, step),
  };
}

export function generateFromArcGroups(groups: ArcGroupInput[], gap: number, numCurves: number, step: number): GenerationResult {
  const arcSegments: ArcSegment[] = [];
  let nextStart: Vec3 | undefined;
  let nextTangentDirection: Vec3 | undefined;
  for (const group of groups) {
    const groupStart = group.startPoint ?? nextStart ?? vec(0, 0, 0);
    const groupTangentDirection = group.startTangentDirection ?? nextTangentDirection ?? vec(1, 0, 0);
    const segments = buildArcSegments(groupStart, group.arcs, groupTangentDirection);
    arcSegments.push(...segments);
    const last = segments.length > 0 ? segments[segments.length - 1] : undefined;
    if (last) {
      nextStart = last.endPoint;
      nextTangentDirection = last.endTangentDirection;
    }
  }
  const referenceSegments = referenceSegmentsFromArcs(arcSegments);
  const { controlPoints, tangents } = pointsAndTangentsFromReferenceSegments(referenceSegments);
  return {
    controlPoints,
    tangents,
    referenceSegments,
    segmentTangents: referenceSegments.map((segment) => [segment.t0, segment.t1] as [Vec3, Vec3]),
    arcs: arcSegments,
    parallelCurves: generateMultipleParallelCurvesFromSegments(referenceSegments, gap, numCurves, step),
  };
}

export function generateFromVectors(controlPoints: Vec3[], tangents: Vec3[], gap: number, numCurves: number, step: number): GenerationResult {
  const referenceSegments = Array.from({ length: Math.max(controlPoints.length - 1, 0) }, (_, i) => ({
    p0: controlPoints[i],
    p1: controlPoints[i + 1],
    t0: tangents[i],
    t1: tangents[i + 1],
  }));
  return {
    controlPoints,
    tangents,
    referenceSegments,
    parallelCurves: generateMultipleParallelCurvesFromSegments(referenceSegments, gap, numCurves, step),
  };
}
