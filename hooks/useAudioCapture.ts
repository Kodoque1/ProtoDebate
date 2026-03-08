"use client";

/**
 * hooks/useAudioCapture.ts
 *
 * Manages microphone capture, real-time audio analysis, and speech-to-text.
 * - Captures audio via getUserMedia
 * - Analyzes volume (RMS dB) for silence detection
 * - Uses Web Speech API for French transcription with local faster-whisper fallback
 * - Calculates WPM over a 30-second sliding window
 */

import { useEffect, useRef, useState, useCallback } from "react";

// ---------------------------------------------------------------------------
// Type declarations for Web Speech API
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives?: number;
  start(): void;
  stop(): void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

declare const SpeechRecognition: {
  prototype: SpeechRecognition;
  new (): SpeechRecognition;
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TranscriptionMode = 'webspeech' | 'faster-whisper' | 'idle';

export interface AudioMetrics {
  /** Current volume in dB (approximation) */
  volumeDb: number;
  /** Whether silence has been detected (< -45dB for > 2s) */
  silenceDetected: boolean;
  /** Current transcript (live or confirmed) */
  transcript: string;
  /** Words per minute (calculated over 30s window) */
  wpm: number;
  /** Whether microphone is active and capturing */
  isCapturing: boolean;
  /** Whether speech recognition is available */
  speechAvailable: boolean;
  /** Whether speech recognition is actively listening */
  isListening: boolean;
  /** Error message if capture failed */
  error: string | null;
  /** Current transcription mode being used */
  transcriptionMode: TranscriptionMode;
  /** Whisper model loading progress (0-100) */
  whisperProgress: number;
  /** Whisper status message */
  whisperStatus: string;
}

interface WordTimestamp {
  word: string;
  timestamp: number;
}

function normalizeTranscriptSegment(text: string): string {
  return text
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\*[^*]*\*/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeWhisperText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function isLikelyDuplicateSegment(current: string, previous: string): boolean {
  const cur = normalizeTranscriptSegment(current);
  const prev = normalizeTranscriptSegment(previous);
  if (!cur || !prev) return false;
  if (cur === prev) return true;
  if (cur.length > 8 && prev.includes(cur)) return true;
  if (prev.length > 8 && cur.includes(prev)) return true;
  return false;
}

const LOCAL_STT_URL =
  process.env.NEXT_PUBLIC_LOCAL_STT_URL ?? "http://127.0.0.1:8008/transcribe";
const FORCE_LOCAL_STT =
  process.env.NEXT_PUBLIC_FORCE_LOCAL_STT === "1" ||
  process.env.NEXT_PUBLIC_FORCE_LOCAL_STT === "true";
const LOCAL_STT_RETRY_COOLDOWN_MS = 8000;

function float32ToWavBlob(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample;
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);

  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * bytesPerSample, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const value = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, value < 0 ? value * 0x8000 : value * 0x7fff, true);
  }

  return new Blob([buffer], { type: "audio/wav" });
}

// ---------------------------------------------------------------------------
// Helper: Calculate RMS volume in dB
// ---------------------------------------------------------------------------

function calculateVolumeDb(dataArray: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < dataArray.length; i++) {
    const normalized = (dataArray[i] - 128) / 128;
    sum += normalized * normalized;
  }
  const rms = Math.sqrt(sum / dataArray.length);
  // Convert to dB (approximation)
  return rms > 0 ? 20 * Math.log10(rms) : -100;
}

// ---------------------------------------------------------------------------
// Helper: Calculate WPM from word timestamps
// ---------------------------------------------------------------------------

function calculateWPM(words: WordTimestamp[], windowMs = 30000): number {
  if (words.length === 0) return 0;

  const now = Date.now();
  const windowWords = words.filter(w => now - w.timestamp < windowMs);

  if (windowWords.length === 0) return 0;

  const oldestTimestamp = windowWords[0].timestamp;
  const durationMinutes = (now - oldestTimestamp) / 60000;

  return durationMinutes > 0 ? Math.round(windowWords.length / durationMinutes) : 0;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAudioCapture(): {
  metrics: AudioMetrics;
  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
} {
  const [metrics, setMetrics] = useState<AudioMetrics>({
    volumeDb: -100,
    silenceDetected: false,
    transcript: "",
    wpm: 0,
    isCapturing: false,
    speechAvailable: false,
    isListening: false,
    error: null,
    transcriptionMode: 'idle',
    whisperProgress: 0,
    whisperStatus: '',
  });

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Offline STT refs
  const audioBufferRef = useRef<Float32Array[]>([]);
  const lastWhisperTranscriptionRef = useRef<number>(0);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const silentGainRef = useRef<GainNode | null>(null);
  const transcriptionModeRef = useRef<TranscriptionMode>('idle');
  const isSwitchingToWhisperRef = useRef<boolean>(false);
  const whisperInFlightRef = useRef<boolean>(false);
  const lastWhisperSegmentRef = useRef<string>("");
  const localSttStateRef = useRef<'unknown' | 'available' | 'unavailable'>('unknown');
  const localSttUnavailableSinceRef = useRef<number | null>(null);

  const wordsRef = useRef<WordTimestamp[]>([]);
  const silenceStartRef = useRef<number | null>(null);
  const transcriptRef = useRef<string>("");

  const appendTranscriptSegment = useCallback((rawText: string) => {
    const sanitizedText = sanitizeWhisperText(rawText || '');
    if (!sanitizedText) return false;

    if (isLikelyDuplicateSegment(sanitizedText, lastWhisperSegmentRef.current)) {
      return false;
    }

    lastWhisperSegmentRef.current = sanitizedText;

    const words = sanitizedText.trim().split(/\s+/).filter(w => w.length > 0);
    const now = Date.now();
    words.forEach(word => {
      wordsRef.current.push({ word, timestamp: now });
    });

    wordsRef.current = wordsRef.current.filter(w => now - w.timestamp < 30000);
    transcriptRef.current += (transcriptRef.current ? ' ' : '') + sanitizedText;

    setMetrics((prev) => ({
      ...prev,
      transcript: transcriptRef.current,
      wpm: calculateWPM(wordsRef.current, 30000),
    }));

    return true;
  }, []);

  const transcribeViaLocalService = useCallback(async (audio: Float32Array, sampleRate: number) => {
    const wavBlob = float32ToWavBlob(audio, sampleRate);
    const formData = new FormData();
    formData.append('file', wavBlob, 'chunk.wav');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(LOCAL_STT_URL, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json() as { text?: string };
      localSttStateRef.current = 'available';
      localSttUnavailableSinceRef.current = null;
      transcriptionModeRef.current = 'faster-whisper';
      setMetrics((prev) => ({
        ...prev,
        error: null,
        transcriptionMode: 'faster-whisper',
        whisperStatus: 'faster-whisper local actif',
        whisperProgress: 100,
      }));

      return data.text ?? '';
    } finally {
      clearTimeout(timeout);
    }
  }, []);

  // -------------------------------------------------------------------------
  // Audio analysis loop
  // -------------------------------------------------------------------------

  const analyzeAudio = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(dataArray);

    const volumeDb = calculateVolumeDb(dataArray);
    const now = Date.now();

    // Log volume every 2 seconds for debugging
    if (now % 2000 < 20) {
      console.log("[Audio] Current volume:", Math.round(volumeDb), "dB");
    }

    // Silence detection
    let silenceDetected = false;
    if (volumeDb < -45) {
      if (silenceStartRef.current === null) {
        silenceStartRef.current = now;
      } else if (now - silenceStartRef.current > 2000) {
        silenceDetected = true;
      }
    } else {
      silenceStartRef.current = null;
    }

    // Calculate WPM
    const wpm = calculateWPM(wordsRef.current, 30000);

    setMetrics((prev) => ({
      ...prev,
      volumeDb,
      silenceDetected,
      wpm,
    }));

    animFrameRef.current = requestAnimationFrame(analyzeAudio);
  }, []);

  const setupWhisperAudioCapture = useCallback(() => {
    const audioContext = audioContextRef.current;
    const stream = streamRef.current;

    if (!audioContext || !stream) {
      console.error('[Audio] Cannot setup Whisper capture without audio context');
      return;
    }

    try {
      if (processorRef.current) {
        console.log('[Audio] Whisper audio capture already configured');
        return;
      }

      // Create a script processor to capture audio data
      const bufferSize = 4096;
      const processor = audioContext.createScriptProcessor(bufferSize, 1, 1);

      const source = audioContext.createMediaStreamSource(stream);
      const silentGain = audioContext.createGain();
      silentGain.gain.value = 0;
      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(audioContext.destination);
      silentGainRef.current = silentGain;

      processor.onaudioprocess = (event) => {
        const inputData = event.inputBuffer.getChannelData(0);
        const audioChunk = new Float32Array(inputData);
        audioBufferRef.current.push(audioChunk);

        // Send to offline STT every ~3 seconds
        const now = Date.now();
        if (!whisperInFlightRef.current && now - lastWhisperTranscriptionRef.current > 3000) {
          lastWhisperTranscriptionRef.current = now;

          // Concatenate all buffered audio
          const totalLength = audioBufferRef.current.reduce((sum, chunk) => sum + chunk.length, 0);
          const concatenated = new Float32Array(totalLength);
          let offset = 0;
          for (const chunk of audioBufferRef.current) {
            concatenated.set(chunk, offset);
            offset += chunk.length;
          }

          const windowSamples = Math.floor(audioContext.sampleRate * 4);
          const clippedAudio =
            concatenated.length > windowSamples
              ? concatenated.slice(concatenated.length - windowSamples)
              : concatenated;

          if (clippedAudio.length > audioContext.sampleRate) {
            whisperInFlightRef.current = true;

            void (async () => {
              const nowTs = Date.now();
              const canRetryLocal =
                localSttStateRef.current !== 'unavailable' ||
                (localSttUnavailableSinceRef.current !== null &&
                  nowTs - localSttUnavailableSinceRef.current > LOCAL_STT_RETRY_COOLDOWN_MS);

              if (!canRetryLocal) {
                whisperInFlightRef.current = false;
                return;
              }

              if (localSttStateRef.current === 'unavailable') {
                localSttStateRef.current = 'unknown';
                setMetrics((prev) => ({
                  ...prev,
                  whisperStatus: 'Nouvelle tentative de connexion au service local...'
                }));
              }

              try {
                const localText = await transcribeViaLocalService(clippedAudio, audioContext.sampleRate);
                appendTranscriptSegment(localText);
                whisperInFlightRef.current = false;
                return;
              } catch (error) {
                console.warn('[Audio] Local faster-whisper indisponible', error);
                localSttStateRef.current = 'unavailable';
                localSttUnavailableSinceRef.current = Date.now();
                setMetrics((prev) => ({
                  ...prev,
                  error: 'Service local faster-whisper indisponible (retry automatique)',
                  whisperStatus: 'Service local indisponible - nouvelle tentative dans quelques secondes',
                  transcriptionMode: 'faster-whisper',
                }));
                whisperInFlightRef.current = false;
                return;
              }
            })();
          }

          // Clear buffer but keep last 1 second for overlap
          const keepSamples = Math.floor(audioContext.sampleRate * 1);
          if (concatenated.length > keepSamples) {
            audioBufferRef.current = [concatenated.slice(-keepSamples)];
          }
        }
      };

      processorRef.current = processor;
      console.log('[Audio] Whisper audio capture setup complete');
    } catch (error) {
      console.error('[Audio] Failed to setup Whisper audio capture:', error);
    }
  }, [appendTranscriptSegment, transcribeViaLocalService]);

  const switchToOfflineTranscription = useCallback((reason: string) => {
    const alreadyActive =
      transcriptionModeRef.current === 'faster-whisper' &&
      processorRef.current !== null;

    if (alreadyActive || isSwitchingToWhisperRef.current) {
      console.log(`[Audio] Offline switch skipped (${reason}) - already in progress/active`);
      return;
    }

    console.log(`[Audio] 🔄 Switching to faster-whisper local (${reason})...`);
    isSwitchingToWhisperRef.current = true;
    transcriptionModeRef.current = 'faster-whisper';

    // Stop Web Speech cleanly and avoid onend restart loop
    if (recognitionRef.current) {
      const recognition = recognitionRef.current;
      recognition.onend = null;
      recognition.onerror = null;
      recognition.onresult = null;
      try {
        recognition.stop();
      } catch (e) {
        console.warn("[Audio] Error stopping recognition during switch:", e);
      }
      recognitionRef.current = null;
    }

    setMetrics((prev) => ({
      ...prev,
      error: null,
      isListening: false,
      transcriptionMode: 'faster-whisper',
      whisperStatus: 'Connexion au service faster-whisper local...',
    }));

    setupWhisperAudioCapture();

    isSwitchingToWhisperRef.current = false;
  }, [setupWhisperAudioCapture]);

  // -------------------------------------------------------------------------
  // Start capture
  // -------------------------------------------------------------------------

  const start = useCallback(async () => {
    try {
      // Reset error state
      setMetrics((prev) => ({
        ...prev,
        error: null,
      }));

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;

      // Set up Web Audio API for volume analysis
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      // Set up Web Speech API for transcription
      const SpeechRecognition =
        window.SpeechRecognition ||
        window.webkitSpeechRecognition;

      console.log("[Audio] SpeechRecognition available:", !!SpeechRecognition);
      console.log("[Audio] Navigator online:", navigator.onLine);
      console.log("[Audio] User agent:", navigator.userAgent);
      console.log("[Audio] Force local STT:", FORCE_LOCAL_STT);

      const shouldUseWebSpeech = !!SpeechRecognition && !FORCE_LOCAL_STT;

      if (shouldUseWebSpeech) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "fr-FR";
        recognition.maxAlternatives = 1;

        console.log("[Audio] Recognition configured:", {
          continuous: recognition.continuous,
          interimResults: recognition.interimResults,
          lang: recognition.lang,
        });

        recognition.onstart = () => {
          console.log("[Audio] Speech recognition STARTED");
          setMetrics((prev) => ({
            ...prev,
            speechAvailable: true,
            isListening: true,
          }));
        };

        recognition.onend = () => {
          console.log("[Audio] Speech recognition ENDED");
          setMetrics((prev) => ({
            ...prev,
            isListening: false,
          }));
          // Auto-restart only when WebSpeech is still the active mode
          if (
            streamRef.current &&
            recognitionRef.current === recognition &&
            transcriptionModeRef.current === 'webspeech' &&
            !isSwitchingToWhisperRef.current
          ) {
            console.log("[Audio] Auto-restarting speech recognition");
            try {
              recognition.start();
            } catch (e) {
              console.warn("[Audio] Could not restart:", e);
            }
          }
        };

        recognition.onresult = (event: SpeechRecognitionEvent) => {
          console.log("[Audio] Speech recognition result received", event);
          let interimTranscript = "";
          let finalTranscript = "";

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            const transcript = result[0].transcript;

            if (result.isFinal) {
              finalTranscript += transcript + " ";

              // Add words with timestamps for WPM calculation
              const words = transcript.trim().split(/\s+/);
              const now = Date.now();
              words.forEach((word: string) => {
                if (word) {
                  wordsRef.current.push({ word, timestamp: now });
                }
              });

              // Keep only last 60 seconds of words
              const cutoff = now - 60000;
              wordsRef.current = wordsRef.current.filter(
                (w) => w.timestamp > cutoff
              );
            } else {
              interimTranscript += transcript;
            }
          }

          if (finalTranscript) {
            transcriptRef.current += finalTranscript;
            console.log("[Audio] Final transcript:", finalTranscript);
            console.log("[Audio] Total transcript:", transcriptRef.current);
            console.log("[Audio] Word count:", wordsRef.current.length);
          }

          setMetrics((prev) => ({
            ...prev,
            transcript: transcriptRef.current + interimTranscript,
          }));
        };

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
          console.warn("[Audio] Speech recognition ERROR:", event.error, event);
          if (event.error === 'no-speech') {
            console.log("[Audio] No speech detected, will auto-restart");
            // Auto-restart after no-speech error
            setTimeout(() => {
              if (
                recognitionRef.current &&
                streamRef.current &&
                transcriptionModeRef.current === 'webspeech' &&
                !isSwitchingToWhisperRef.current
              ) {
                try {
                  recognitionRef.current.start();
                  console.log("[Audio] Restarted after no-speech");
                } catch (e) {
                  console.warn("[Audio] Could not restart:", e);
                }
              }
            }, 100);
          } else if (event.error === 'not-allowed') {
            console.error("[Audio] PERMISSION REFUSÉE - Autorisez le micro dans les paramètres");
            setMetrics((prev) => ({
              ...prev,
              error: "permission",
              isListening: false,
            }));
          } else if (event.error === 'network') {
            console.warn("[Audio] ERREUR RÉSEAU - Web Speech API nécessite internet");
            switchToOfflineTranscription('network-error');
          }
        };

        try {
          console.log("[Audio] Starting speech recognition...");
          recognitionRef.current = recognition;
          recognition.start();
          console.log("[Audio] Speech recognition start() called successfully");

          transcriptionModeRef.current = 'webspeech';
          setMetrics((prev) => ({
            ...prev,
            transcriptionMode: 'webspeech',
            isListening: true,
          }));
        } catch (err) {
          console.error("[Audio] Could not start speech recognition:", err);
          switchToOfflineTranscription('webspeech-start-failed');
        }
      } else {
        console.warn("[Audio] Web Speech unavailable or disabled - using offline STT");

        setMetrics((prev) => ({
          ...prev,
          speechAvailable: false,
          transcriptionMode: 'faster-whisper',
          whisperStatus: FORCE_LOCAL_STT
            ? 'Mode local forcé, connexion au service faster-whisper...'
            : 'Web Speech indisponible, tentative faster-whisper local...',
        }));

        switchToOfflineTranscription('webspeech-not-available');
      }

      setMetrics((prev) => ({
        ...prev,
        isCapturing: true,
        speechAvailable: shouldUseWebSpeech,
        error: prev.error,
      }));

      // Start analysis loop
      animFrameRef.current = requestAnimationFrame(analyzeAudio);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Microphone access denied";
      setMetrics((prev) => ({
        ...prev,
        error: message,
        isCapturing: false,
      }));
    }
  }, [analyzeAudio, switchToOfflineTranscription]);

  // -------------------------------------------------------------------------
  // Stop capture
  // -------------------------------------------------------------------------

  const stop = useCallback(() => {
    transcriptionModeRef.current = 'idle';
    isSwitchingToWhisperRef.current = false;

    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }

    // Stop Whisper processor
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    if (silentGainRef.current) {
      silentGainRef.current.disconnect();
      silentGainRef.current = null;
    }

    // Clear local STT buffers/state
    audioBufferRef.current = [];
    whisperInFlightRef.current = false;
    lastWhisperSegmentRef.current = "";

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    analyserRef.current = null;

    setMetrics((prev) => ({
      ...prev,
      isCapturing: false,
      isListening: false,
    }));
  }, []);

  // -------------------------------------------------------------------------
  // Reset metrics
  // -------------------------------------------------------------------------

  const reset = useCallback(() => {
    wordsRef.current = [];
    transcriptRef.current = "";
    silenceStartRef.current = null;
    audioBufferRef.current = [];
    whisperInFlightRef.current = false;
    lastWhisperSegmentRef.current = "";
    transcriptionModeRef.current = 'idle';
    isSwitchingToWhisperRef.current = false;
    localSttStateRef.current = 'unknown';
    localSttUnavailableSinceRef.current = null;

    setMetrics({
      volumeDb: -100,
      silenceDetected: false,
      transcript: "",
      wpm: 0,
      isCapturing: false,
      speechAvailable: false,
      isListening: false,
      error: null,
      transcriptionMode: 'idle',
      whisperProgress: 0,
      whisperStatus: '',
    });
  }, []);

  // -------------------------------------------------------------------------
  // Cleanup on unmount
  // -------------------------------------------------------------------------

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    metrics,
    start,
    stop,
    reset,
  };
}
