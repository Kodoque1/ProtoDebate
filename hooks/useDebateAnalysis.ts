"use client";

/**
 * hooks/useDebateAnalysis.ts
 * Orchestrateur des modèles ML pour l'analyse du débat.
 * Agrège les résultats de MediaPipe (gaze, posture) et de l'AudioWorker (WPM, silence).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  isLookingAtCamera,
  computeArmOpenness,
  areHandsJoined,
  computeShoulderTilt,
  type NormalizedLandmark,
} from "@/lib/mediapipe-utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GazeMetrics {
  /** Percentage of time the speaker was looking at the camera (0-100) */
  cameraContactPct: number;
  /** Whether the speaker is currently looking at the camera */
  isLooking: boolean;
}

export interface PostureMetrics {
  /** 0 (closed) – 1 (fully open) */
  armOpenness: number | null;
  /** Whether hands are currently joined / hidden */
  handsJoined: boolean;
  /** Shoulder tilt in degrees (0 = perfectly level) */
  shoulderTilt: number | null;
  /** Whether an alert should be shown (hands joined too long) */
  postureAlert: boolean;
}

export interface AudioMetrics {
  /** Words per minute */
  wpm: number;
  /** Whether silence has been detected (dB < -45 for > 2 s) */
  silenceDetected: boolean;
  /** Partial / confirmed transcript */
  transcript: string;
}

export interface DebateAnalysis {
  gaze: GazeMetrics;
  posture: PostureMetrics;
  audio: AudioMetrics;
  /** Elapsed recording time in seconds */
  elapsed: number;
}

// ---------------------------------------------------------------------------
// Default / initial state
// ---------------------------------------------------------------------------

const DEFAULT_ANALYSIS: DebateAnalysis = {
  gaze: { cameraContactPct: 0, isLooking: false },
  posture: {
    armOpenness: null,
    handsJoined: false,
    shoulderTilt: null,
    postureAlert: false,
  },
  audio: { wpm: 0, silenceDetected: false, transcript: "" },
  elapsed: 0,
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseDebateAnalysisOptions {
  /** How long (ms) hands must be joined before triggering postureAlert */
  handsJoinedAlertMs?: number;
}

export function useDebateAnalysis(
  options: UseDebateAnalysisOptions = {}
): {
  analysis: DebateAnalysis;
  isRunning: boolean;
  start: () => void;
  stop: () => void;
  reset: () => void;
  updateFaceLandmarks: (landmarks: NormalizedLandmark[]) => void;
  updatePoseLandmarks: (landmarks: NormalizedLandmark[]) => void;
  updateAudioMetrics: (metrics: Partial<AudioMetrics>) => void;
} {
  const { handsJoinedAlertMs = 3000 } = options;

  const [analysis, setAnalysis] = useState<DebateAnalysis>(DEFAULT_ANALYSIS);
  const [isRunning, setIsRunning] = useState(false);

  // Internal counters kept in refs to avoid re-renders on every frame
  const frameCount = useRef(0);
  const lookingFrames = useRef(0);
  const lastGazeRef = useRef<GazeMetrics>({ cameraContactPct: 0, isLooking: false });
  const lastPostureRef = useRef<PostureMetrics>({
    armOpenness: null,
    handsJoined: false,
    shoulderTilt: null,
    postureAlert: false,
  });
  const handsJoinedSince = useRef<number | null>(null);
  const startTime = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // -------------------------------------------------------------------------
  // Session control
  // -------------------------------------------------------------------------

  const start = useCallback(() => {
    frameCount.current = 0;
    lookingFrames.current = 0;
    lastGazeRef.current = { cameraContactPct: 0, isLooking: false };
    lastPostureRef.current = {
      armOpenness: null,
      handsJoined: false,
      shoulderTilt: null,
      postureAlert: false,
    };
    handsJoinedSince.current = null;
    startTime.current = Date.now();
    setAnalysis(DEFAULT_ANALYSIS);
    setIsRunning(true);

    timerRef.current = setInterval(() => {
      setAnalysis((prev) => ({
        ...prev,
        elapsed: Math.floor((Date.now() - (startTime.current ?? Date.now())) / 1000),
      }));
    }, 1000);
  }, []);

  const stop = useCallback(() => {
    setIsRunning(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    setIsRunning(false);
    frameCount.current = 0;
    lookingFrames.current = 0;
    lastGazeRef.current = { cameraContactPct: 0, isLooking: false };
    lastPostureRef.current = {
      armOpenness: null,
      handsJoined: false,
      shoulderTilt: null,
      postureAlert: false,
    };
    handsJoinedSince.current = null;
    startTime.current = null;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setAnalysis(DEFAULT_ANALYSIS);
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // -------------------------------------------------------------------------
  // Face landmarks → Gaze
  // -------------------------------------------------------------------------

  const updateFaceLandmarks = useCallback(
    (landmarks: NormalizedLandmark[]) => {
      if (!isRunning) return;

      frameCount.current += 1;
      const looking = isLookingAtCamera(landmarks);
      if (looking) lookingFrames.current += 1;

      const cameraContactPct =
        frameCount.current > 0
          ? Math.round((lookingFrames.current / frameCount.current) * 100)
          : 0;

      // Throttle React updates and skip unchanged gaze state
      if (frameCount.current % 3 !== 0) return;
      const prevGaze = lastGazeRef.current;
      if (
        prevGaze.isLooking === looking &&
        prevGaze.cameraContactPct === cameraContactPct
      ) {
        return;
      }
      lastGazeRef.current = { isLooking: looking, cameraContactPct };

      setAnalysis((prev) => ({
        ...prev,
        gaze: { isLooking: looking, cameraContactPct },
      }));
    },
    [isRunning]
  );

  // -------------------------------------------------------------------------
  // Pose landmarks → Posture
  // -------------------------------------------------------------------------

  const updatePoseLandmarks = useCallback(
    (landmarks: NormalizedLandmark[]) => {
      if (!isRunning) return;

      const armOpenness = computeArmOpenness(landmarks);
      const handsJoined = areHandsJoined(landmarks);
      const shoulderTilt = computeShoulderTilt(landmarks);

      // Track how long hands have been joined
      if (handsJoined) {
        if (handsJoinedSince.current === null) {
          handsJoinedSince.current = Date.now();
        }
      } else {
        handsJoinedSince.current = null;
      }

      const postureAlert =
        handsJoined &&
        handsJoinedSince.current !== null &&
        Date.now() - handsJoinedSince.current > handsJoinedAlertMs;

      const prevPosture = lastPostureRef.current;
      if (
        prevPosture.armOpenness === armOpenness &&
        prevPosture.handsJoined === handsJoined &&
        prevPosture.shoulderTilt === shoulderTilt &&
        prevPosture.postureAlert === postureAlert
      ) {
        return;
      }
      lastPostureRef.current = { armOpenness, handsJoined, shoulderTilt, postureAlert };

      setAnalysis((prev) => ({
        ...prev,
        posture: { armOpenness, handsJoined, shoulderTilt, postureAlert },
      }));
    },
    [isRunning, handsJoinedAlertMs]
  );

  // -------------------------------------------------------------------------
  // Audio metrics (fed from AudioWorker via the CameraFeed)
  // -------------------------------------------------------------------------

  const updateAudioMetrics = useCallback(
    (metrics: Partial<AudioMetrics>) => {
      if (!isRunning) return;
      setAnalysis((prev) => ({
        ...prev,
        audio: { ...prev.audio, ...metrics },
      }));
    },
    [isRunning]
  );

  return {
    analysis,
    isRunning,
    start,
    stop,
    reset,
    updateFaceLandmarks,
    updatePoseLandmarks,
    updateAudioMetrics,
  };
}
