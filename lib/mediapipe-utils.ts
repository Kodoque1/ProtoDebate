/**
 * lib/mediapipe-utils.ts
 * Mathematical utilities for posture and gaze analysis using MediaPipe landmarks.
 */

// ---------------------------------------------------------------------------
// Type aliases for MediaPipe landmark structures
// ---------------------------------------------------------------------------

export interface Landmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export interface NormalizedLandmark {
  x: number; // 0-1 normalised to frame width
  y: number; // 0-1 normalised to frame height
  z?: number;
  visibility?: number;
}

// ---------------------------------------------------------------------------
// Gaze (Eye contact) analysis
// ---------------------------------------------------------------------------

/**
 * MediaPipe FaceLandmarker iris indices:
 *  Left iris centre  : 468
 *  Right iris centre : 473
 *  Left eye corners  : 33 (inner), 133 (outer)
 *  Right eye corners : 362 (inner), 263 (outer)
 */
const LEFT_EYE_INNER = 33;
const LEFT_EYE_OUTER = 133;
const RIGHT_EYE_INNER = 362;
const RIGHT_EYE_OUTER = 263;
const LEFT_IRIS = 468;
const RIGHT_IRIS = 473;

/**
 * Returns a value in [-1, 1] representing the horizontal gaze direction.
 *  0   → centred (looking at camera)
 *  > 0 → looking right
 *  < 0 → looking left
 * Returns null when landmarks are unavailable.
 */
export function computeGazeOffset(
  faceLandmarks: NormalizedLandmark[]
): number | null {
  if (!faceLandmarks || faceLandmarks.length < 478) return null;

  const leftInner = faceLandmarks[LEFT_EYE_INNER];
  const leftOuter = faceLandmarks[LEFT_EYE_OUTER];
  const rightInner = faceLandmarks[RIGHT_EYE_INNER];
  const rightOuter = faceLandmarks[RIGHT_EYE_OUTER];
  const leftIris = faceLandmarks[LEFT_IRIS];
  const rightIris = faceLandmarks[RIGHT_IRIS];

  // Left eye: iris position relative to eye width
  const leftEyeWidth = Math.abs(leftOuter.x - leftInner.x);
  const leftGaze =
    leftEyeWidth > 0
      ? (leftIris.x - leftInner.x) / leftEyeWidth - 0.5
      : 0;

  // Right eye: iris position relative to eye width
  const rightEyeWidth = Math.abs(rightOuter.x - rightInner.x);
  const rightGaze =
    rightEyeWidth > 0
      ? (rightIris.x - rightInner.x) / rightEyeWidth - 0.5
      : 0;

  // Average the two eyes
  return (leftGaze + rightGaze) / 2;
}

/**
 * Returns true if the user is looking at the camera (gaze offset within threshold).
 */
export function isLookingAtCamera(
  faceLandmarks: NormalizedLandmark[],
  threshold = 0.15
): boolean {
  const offset = computeGazeOffset(faceLandmarks);
  if (offset === null) return false;
  return Math.abs(offset) <= threshold;
}

// ---------------------------------------------------------------------------
// Posture analysis
// ---------------------------------------------------------------------------

/**
 * MediaPipe PoseLandmarker key indices (33-landmark model)
 */
export const PoseLandmarkIndex = {
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
} as const;

/**
 * Returns the Euclidean distance between two 2-D landmarks (normalised coords).
 */
export function landmarkDistance(a: NormalizedLandmark, b: NormalizedLandmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Returns true when the wrists are close together (hands joined / hidden).
 * threshold is expressed in normalised units (0-1 scale).
 */
export function areHandsJoined(
  poseLandmarks: NormalizedLandmark[],
  threshold = 0.08
): boolean {
  if (!poseLandmarks || poseLandmarks.length < 25) return false;
  const lw = poseLandmarks[PoseLandmarkIndex.LEFT_WRIST];
  const rw = poseLandmarks[PoseLandmarkIndex.RIGHT_WRIST];
  if (!lw || !rw) return false;
  return landmarkDistance(lw, rw) < threshold;
}

/**
 * Computes the arm openness ratio:
 *  0 → arms fully closed (hands at hips)
 *  1 → arms fully open
 * Returns null when visibility is too low.
 */
export function computeArmOpenness(
  poseLandmarks: NormalizedLandmark[]
): number | null {
  if (!poseLandmarks || poseLandmarks.length < 25) return null;

  const ls = poseLandmarks[PoseLandmarkIndex.LEFT_SHOULDER];
  const rs = poseLandmarks[PoseLandmarkIndex.RIGHT_SHOULDER];
  const lw = poseLandmarks[PoseLandmarkIndex.LEFT_WRIST];
  const rw = poseLandmarks[PoseLandmarkIndex.RIGHT_WRIST];

  if (!ls || !rs || !lw || !rw) return null;

  // Check visibility scores if present
  const minVisibility = 0.5;
  if (
    (ls.visibility !== undefined && ls.visibility < minVisibility) ||
    (rs.visibility !== undefined && rs.visibility < minVisibility) ||
    (lw.visibility !== undefined && lw.visibility < minVisibility) ||
    (rw.visibility !== undefined && rw.visibility < minVisibility)
  ) {
    return null;
  }

  const shoulderWidth = landmarkDistance(ls, rs);
  if (shoulderWidth < 0.01) return null;

  const wristSpan = landmarkDistance(lw, rw);

  // Normalise: wrist span relative to shoulder width
  // A ratio ≥ 1 means hands are at least as far apart as the shoulders → open
  return Math.min(wristSpan / (shoulderWidth * 2), 1);
}

/**
 * Checks that the shoulders are level (not slouching sideways).
 * Returns the absolute shoulder tilt in degrees.
 */
export function computeShoulderTilt(
  poseLandmarks: NormalizedLandmark[]
): number | null {
  if (!poseLandmarks || poseLandmarks.length < 13) return null;
  const ls = poseLandmarks[PoseLandmarkIndex.LEFT_SHOULDER];
  const rs = poseLandmarks[PoseLandmarkIndex.RIGHT_SHOULDER];
  if (!ls || !rs) return null;
  const dx = rs.x - ls.x;
  const dy = rs.y - ls.y;
  return Math.abs((Math.atan2(dy, dx) * 180) / Math.PI);
}

// ---------------------------------------------------------------------------
// Drawing utilities
// ---------------------------------------------------------------------------

/**
 * Draws a set of pose landmarks onto a 2-D canvas context.
 */
export function drawPoseLandmarks(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  canvasWidth: number,
  canvasHeight: number,
  color = "#6366f1"
): void {
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;

  const connections: [number, number][] = [
    [11, 12], // shoulders
    [11, 13], [13, 15], // left arm
    [12, 14], [14, 16], // right arm
    [11, 23], [12, 24], // torso sides
    [23, 24], // hips
  ];

  // Draw skeleton lines
  for (const [a, b] of connections) {
    const lA = landmarks[a];
    const lB = landmarks[b];
    if (!lA || !lB) continue;
    const vis = Math.min(lA.visibility ?? 1, lB.visibility ?? 1);
    if (vis < 0.3) continue;
    ctx.globalAlpha = Math.min(vis, 0.9);
    ctx.beginPath();
    ctx.moveTo(lA.x * canvasWidth, lA.y * canvasHeight);
    ctx.lineTo(lB.x * canvasWidth, lB.y * canvasHeight);
    ctx.stroke();
  }

  // Draw joint dots
  ctx.globalAlpha = 1;
  for (const lm of landmarks) {
    if (!lm) continue;
    if ((lm.visibility ?? 1) < 0.3) continue;
    ctx.beginPath();
    ctx.arc(lm.x * canvasWidth, lm.y * canvasHeight, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Draws face landmarks (iris + key mesh points) onto a canvas.
 */
export function drawFaceLandmarks(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  canvasWidth: number,
  canvasHeight: number,
  color = "#818cf8"
): void {
  if (!landmarks || landmarks.length === 0) return;

  ctx.fillStyle = color;
  ctx.globalAlpha = 0.7;

  // Draw a sparse subset of face mesh points
  const keyIndices = [
    1, 4, 6, 8, 10, 33, 61, 133, 152, 234, 263, 291, 362, 389, 454,
    468, 469, 470, 471, 472, // Left iris
    473, 474, 475, 476, 477, // Right iris
  ];

  for (const idx of keyIndices) {
    const lm = landmarks[idx];
    if (!lm) continue;
    ctx.beginPath();
    // Make iris points slightly larger
    const r = idx >= 468 ? 3 : 1.5;
    ctx.arc(lm.x * canvasWidth, lm.y * canvasHeight, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
}
