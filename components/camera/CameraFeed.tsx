"use client";

/**
 * components/camera/CameraFeed.tsx
 *
 * Webcam capture with real-time MediaPipe overlay.
 *
 * - Initialises the user's webcam
 * - Loads FaceLandmarker + PoseLandmarker from the MediaPipe CDN (or /public fallback)
 * - Renders the raw video feed underneath a <canvas> overlay
 * - Draws face mesh (iris) and pose skeleton on every animation frame
 * - Exposes an optional `onMetrics` callback so the parent can consume analysis data
 */

import {
  useEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import {
  FaceLandmarker,
  PoseLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
  type PoseLandmarkerResult,
} from "@mediapipe/tasks-vision";

import {
  drawFaceLandmarks,
  drawPoseLandmarks,
  isLookingAtCamera,
  computeArmOpenness,
  areHandsJoined,
  type NormalizedLandmark,
} from "@/lib/mediapipe-utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CameraFeedMetrics {
  faceLandmarks: NormalizedLandmark[];
  poseLandmarks: NormalizedLandmark[];
  isLooking: boolean;
  armOpenness: number | null;
  handsJoined: boolean;
}

export interface CameraFeedProps {
  /** Called once per frame with the latest analysis metrics */
  onMetrics?: (metrics: CameraFeedMetrics) => void;
  /** Whether to show the skeleton overlay (default: true) */
  showOverlay?: boolean;
}

export interface CameraFeedHandle {
  /** Returns the HTMLVideoElement reference */
  getVideoElement: () => HTMLVideoElement | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MEDIAPIPE_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm";

const MEDIAPIPE_XNNPACK_INFO =
  "INFO: Created TensorFlow Lite XNNPACK delegate for CPU.";

function isMediapipeXnnpackInfo(args: unknown[]): boolean {
  return args.some((arg) => {
    if (typeof arg === "string") {
      return arg.includes(MEDIAPIPE_XNNPACK_INFO);
    }
    if (arg instanceof Error) {
      return arg.message.includes(MEDIAPIPE_XNNPACK_INFO);
    }
    return false;
  });
}

// ---------------------------------------------------------------------------
// Helper to build the MediaPipe models
// ---------------------------------------------------------------------------

async function buildModels(): Promise<{
  faceLandmarker: FaceLandmarker;
  poseLandmarker: PoseLandmarker;
}> {
  const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_CDN);

  const [faceLandmarker, poseLandmarker] = await Promise.all([
    FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
        delegate: "GPU",
      },
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
      runningMode: "VIDEO",
      numFaces: 1,
    }),
    PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numPoses: 1,
    }),
  ]);

  return { faceLandmarker, poseLandmarker };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const CameraFeed = forwardRef<CameraFeedHandle, CameraFeedProps>(
  function CameraFeed({ onMetrics, showOverlay = true }, ref) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const modelsRef = useRef<{
      faceLandmarker: FaceLandmarker;
      poseLandmarker: PoseLandmarker;
    } | null>(null);
    const onMetricsRef = useRef(onMetrics);
    const showOverlayRef = useRef(showOverlay);

    const [status, setStatus] = useState<
      "idle" | "requesting" | "loading" | "ready" | "error"
    >("idle");
    const [errorMessage, setErrorMessage] = useState<string>("");

    // Expose imperative handle
    useImperativeHandle(
      ref,
      () => ({
        getVideoElement: () => videoRef.current,
      }),
      []
    );

    // Keep prop refs in sync (allows effect to read latest values without deps)
    useEffect(() => {
      onMetricsRef.current = onMetrics;
    });
    useEffect(() => {
      showOverlayRef.current = showOverlay;
    });

    // -------------------------------------------------------------------------
    // Initialise webcam + models + detection loop (all inside one effect)
    // -------------------------------------------------------------------------

    useEffect(() => {
      let stream: MediaStream | null = null;
      let cancelled = false;
      let animFrameId: number | null = null;
      let lastTimestamp = -1;

      // Install global console filter for MediaPipe XNNPACK noise
      const originalConsoleError = console.error;
      const originalConsoleLog = console.log;
      const originalConsoleInfo = console.info;

      console.error = (...args: unknown[]) => {
        if (isMediapipeXnnpackInfo(args)) return;
        originalConsoleError(...args);
      };

      console.log = (...args: unknown[]) => {
        if (isMediapipeXnnpackInfo(args)) return;
        originalConsoleLog(...args);
      };

      console.info = (...args: unknown[]) => {
        if (isMediapipeXnnpackInfo(args)) return;
        originalConsoleInfo(...args);
      };

      function runFrame() {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const models = modelsRef.current;

        if (cancelled) return;

        if (!video || !canvas || !models || video.readyState < 2) {
          animFrameId = requestAnimationFrame(runFrame);
          return;
        }

        // Sync canvas size to video
        if (
          canvas.width !== video.videoWidth ||
          canvas.height !== video.videoHeight
        ) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }

        const timestamp = performance.now();
        if (timestamp === lastTimestamp) {
          animFrameId = requestAnimationFrame(runFrame);
          return;
        }
        lastTimestamp = timestamp;

        // Run MediaPipe detectors
        let faceResult: FaceLandmarkerResult | null = null;
        let poseResult: PoseLandmarkerResult | null = null;

        try {
          faceResult = models.faceLandmarker.detectForVideo(video, timestamp);
          poseResult = models.poseLandmarker.detectForVideo(video, timestamp);
        } catch (err) {
          // Skip frames where detection fails (e.g. model still warming up)
          if (process.env.NODE_ENV === "development") {
            console.warn("MediaPipe detection frame skipped:", err);
          }
        }

        // Draw overlays on canvas
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          if (showOverlayRef.current) {
            if (faceResult?.faceLandmarks?.[0]) {
              drawFaceLandmarks(
                ctx,
                faceResult.faceLandmarks[0] as NormalizedLandmark[],
                canvas.width,
                canvas.height
              );
            }
            if (poseResult?.landmarks?.[0]) {
              drawPoseLandmarks(
                ctx,
                poseResult.landmarks[0] as NormalizedLandmark[],
                canvas.width,
                canvas.height
              );
            }
          }
        }

        // Emit metrics to parent
        if (onMetricsRef.current) {
          const faceLandmarks =
            (faceResult?.faceLandmarks?.[0] as NormalizedLandmark[]) ?? [];
          const poseLandmarks =
            (poseResult?.landmarks?.[0] as NormalizedLandmark[]) ?? [];

          onMetricsRef.current({
            faceLandmarks,
            poseLandmarks,
            isLooking: isLookingAtCamera(faceLandmarks),
            armOpenness: computeArmOpenness(poseLandmarks),
            handsJoined: areHandsJoined(poseLandmarks),
          });
        }

        animFrameId = requestAnimationFrame(runFrame);
      }

      async function init() {
        try {
          setStatus("requesting");

          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 1280 },
              height: { ideal: 720 },
              facingMode: "user",
            },
            audio: false,
          });

          if (cancelled) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }

          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            await videoRef.current.play();
          }

          setStatus("loading");
          modelsRef.current = await buildModels();

          if (cancelled) return;

          setStatus("ready");
          animFrameId = requestAnimationFrame(runFrame);
        } catch (err) {
          if (cancelled) return;
          const msg = err instanceof Error ? err.message : "Erreur inconnue";
          setErrorMessage(msg);
          setStatus("error");
        }
      }

      init();

      return () => {
        cancelled = true;
        if (animFrameId !== null) {
          cancelAnimationFrame(animFrameId);
        }
        if (stream) {
          stream.getTracks().forEach((t) => t.stop());
        }
        if (modelsRef.current) {
          modelsRef.current.faceLandmarker.close();
          modelsRef.current.poseLandmarker.close();
          modelsRef.current = null;
        }
        // Restore original console functions
        console.error = originalConsoleError;
        console.log = originalConsoleLog;
        console.info = originalConsoleInfo;
      };
    }, []);

    // -------------------------------------------------------------------------
    // Render
    // -------------------------------------------------------------------------

    return (
      <div className="relative w-full h-full flex items-center justify-center bg-slate-900 rounded-xl overflow-hidden">
        {/* Raw video feed (mirrored for natural UX) */}
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          style={{ transform: "scaleX(-1)" }}
          muted
          playsInline
          aria-label="Flux vidéo de la webcam"
        />

        {/* Canvas overlay for landmark drawings (also mirrored) */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ transform: "scaleX(-1)" }}
          aria-hidden="true"
        />

        {/* Status overlays */}
        {status === "requesting" && (
          <StatusOverlay
            icon="📷"
            title="Accès à la caméra"
            description="Veuillez autoriser l'accès à votre webcam dans votre navigateur."
          />
        )}

        {status === "loading" && (
          <StatusOverlay
            icon={
              <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            }
            title="Chargement des modèles IA"
            description="FaceLandmarker et PoseLandmarker se chargent via WebAssembly…"
          />
        )}

        {status === "error" && (
          <StatusOverlay
            icon="⚠️"
            title="Erreur d'initialisation"
            description={errorMessage || "Impossible d'accéder à la caméra."}
            isError
          />
        )}

        {/* Ready indicator */}
        {status === "ready" && (
          <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2 py-1 rounded-full bg-slate-900/80 backdrop-blur-sm border border-emerald-800/50">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs text-emerald-400 font-medium">Live</span>
          </div>
        )}
      </div>
    );
  }
);

export default CameraFeed;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusOverlay({
  icon,
  title,
  description,
  isError = false,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  isError?: boolean;
}) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-slate-900/90 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3 max-w-xs text-center px-6">
        <div className="text-4xl">{icon}</div>
        <p
          className={`text-sm font-semibold ${isError ? "text-red-400" : "text-slate-200"}`}
        >
          {title}
        </p>
        <p className="text-xs text-slate-500 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}
