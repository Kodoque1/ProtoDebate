"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect } from "react";
import { useDebateAnalysis } from "@/hooks/useDebateAnalysis";
import { useAudioCapture } from "@/hooks/useAudioCapture";

// Dynamically import CameraFeed to avoid SSR issues with browser APIs
const CameraFeed = dynamic(() => import("@/components/camera/CameraFeed"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-slate-900 rounded-xl">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-400 text-sm">Chargement de la caméra…</p>
      </div>
    </div>
  ),
});

export default function HomePage() {
  const {
    analysis,
    isRunning,
    start: startSession,
    stop: stopSession,
    reset: resetSession,
    updateFaceLandmarks,
    updatePoseLandmarks,
    updateAudioMetrics,
  } = useDebateAnalysis();

  const {
    metrics: audioMetrics,
    start: startAudio,
    stop: stopAudio,
    reset: resetAudio,
  } = useAudioCapture();

  // Sync audio metrics with debate analysis
  useEffect(() => {
    if (audioMetrics.isCapturing) {
      updateAudioMetrics({
        wpm: audioMetrics.wpm,
        silenceDetected: audioMetrics.silenceDetected,
        transcript: audioMetrics.transcript,
      });
    }
  }, [
    audioMetrics.isCapturing,
    audioMetrics.wpm,
    audioMetrics.silenceDetected,
    audioMetrics.transcript,
    updateAudioMetrics,
  ]);

  // Session control handlers
  const start = useCallback(async () => {
    await startAudio();
    startSession();
  }, [startAudio, startSession]);

  const stop = useCallback(() => {
    stopAudio();
    stopSession();
  }, [stopAudio, stopSession]);

  const reset = useCallback(() => {
    stopAudio();
    resetAudio();
    resetSession();
  }, [stopAudio, resetAudio, resetSession]);

  const handleMetrics = useCallback(
    ({ faceLandmarks, poseLandmarks }: { faceLandmarks: { x: number; y: number; z?: number; visibility?: number }[]; poseLandmarks: { x: number; y: number; z?: number; visibility?: number }[] }) => {
      updateFaceLandmarks(faceLandmarks);
      updatePoseLandmarks(poseLandmarks);
    },
    [updateFaceLandmarks, updatePoseLandmarks]
  );

  const postureValue =
    analysis.posture.armOpenness === null
      ? "—"
      : `${Math.round(analysis.posture.armOpenness * 100)}%`;

  const speechValue =
    analysis.audio.wpm > 0 ? `${analysis.audio.wpm} WPM` : "— WPM";

  const gazeValue = isRunning
    ? analysis.gaze.isLooking
      ? `✅ ${analysis.gaze.cameraContactPct}%`
      : `⚠️ ${analysis.gaze.cameraContactPct}%`
    : "—";

  return (
    <div className="flex flex-col min-h-screen bg-slate-950">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="w-5 h-5 text-white"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
              />
            </svg>
          </div>
          <span className="font-semibold text-lg text-white tracking-tight">
            DebateCoach
          </span>
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-900/50 text-indigo-300 border border-indigo-800">
            Local AI
          </span>
        </div>
        <div className="flex items-center gap-4">
          {/* Microphone status badge */}
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${
                audioMetrics.error
                  ? "bg-red-500"
                  : audioMetrics.isListening
                  ? "bg-emerald-500 animate-pulse"
                  : audioMetrics.isCapturing
                  ? "bg-amber-500"
                  : "bg-slate-500"
              }`}
            />
            <span className="text-xs text-slate-400">
              {audioMetrics.error
                ? "Micro erreur"
                : audioMetrics.isListening
                ? "Micro en écoute"
                : audioMetrics.isCapturing && !audioMetrics.speechAvailable
                ? "Micro sans STT"
                : audioMetrics.isCapturing
                ? "Micro démarrage..."
                : "Micro prêt"}
            </span>
          </div>
          <div className="w-px h-4 bg-slate-700" />
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs text-slate-400">Analyse 100% locale</span>
          </div>
        </div>
      </header>

      {/* Main Dashboard */}
      <main className="flex flex-1 gap-4 p-4 overflow-hidden">
        {/* Video Zone */}
        <section className="flex-1 flex flex-col gap-4 min-w-0">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider">
              Flux Vidéo en Direct
            </h2>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>MediaPipe</span>
              <span className="text-slate-700">•</span>
              <span>FaceLandmarker</span>
              <span className="text-slate-700">•</span>
              <span>PoseLandmarker</span>
            </div>
          </div>

          {/* Camera Feed container */}
          <div className="relative flex-1 min-h-0 rounded-xl overflow-hidden border border-slate-800 bg-slate-900">
            <CameraFeed onMetrics={handleMetrics} />
          </div>

          <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-slate-900 border border-slate-800">
            <div className="text-xs text-slate-400">
              {isRunning
                ? `Session en cours · ${analysis.elapsed}s`
                : "Prêt à démarrer une session"}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={reset}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-slate-700 hover:bg-slate-600 text-white"
              >
                Réinitialiser
              </button>
              <button
                type="button"
                onClick={isRunning ? stop : start}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isRunning
                    ? "bg-red-600 hover:bg-red-500 text-white"
                    : "bg-indigo-600 hover:bg-indigo-500 text-white"
                }`}
              >
                {isRunning ? "Arrêter la session" : "Démarrer la session"}
              </button>
            </div>
          </div>

          {/* Status bar */}
          <div className="flex items-center gap-4 px-4 py-2 rounded-lg bg-slate-900 border border-slate-800">
            <StatusItem
              label="Regard"
              value={gazeValue}
              color={!isRunning ? "slate" : analysis.gaze.isLooking ? "emerald" : "amber"}
            />
            <div className="w-px h-4 bg-slate-700" />
            <StatusItem
              label="Posture"
              value={postureValue}
              color={!isRunning ? "slate" : analysis.posture.postureAlert ? "red" : "emerald"}
            />
            <div className="w-px h-4 bg-slate-700" />
            <StatusItem label="Débit vocal" value={speechValue} color="slate" />
            <div className="w-px h-4 bg-slate-700" />
            <StatusItem label="Émotion" value="—" color="slate" />
          </div>
        </section>

        {/* Sidebar */}
        <aside className="w-72 flex flex-col gap-4 shrink-0">
          <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider">
            Statistiques en Direct
          </h2>

          {/* Gaze Card */}
          <StatCard
            title="Regard (Gaze)"
            icon="👁"
            description="% du temps face caméra"
            value={isRunning ? `${analysis.gaze.cameraContactPct}%` : undefined}
          />

          {/* Posture Card */}
          <StatCard
            title="Posture"
            icon="🧍"
            description="Ouverture des bras & position"
            value={
              isRunning
                ? `${postureValue}${analysis.posture.handsJoined ? " · Mains jointes" : ""}`
                : undefined
            }
          />

          {/* Speech Card */}
          <StatCard
            title="Débit Vocal"
            icon="🎙"
            description="Mots par minute (cible : 140-160)"
            value={speechValue}
            placeholder={!isRunning}
          />

          {/* Audio Volume Meter */}
          {isRunning && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">🔊</span>
                <h3 className="text-sm font-semibold text-slate-200">
                  Volume Audio
                </h3>
              </div>
              <p className="text-xs text-slate-500 mb-3">
                Niveau actuel: {Math.round(audioMetrics.volumeDb)} dB
                {audioMetrics.volumeDb < -50 && (
                  <span className="text-amber-400 ml-2">⚠️ Trop faible - parlez plus fort</span>
                )}
                {audioMetrics.volumeDb >= -50 && audioMetrics.volumeDb < -30 && (
                  <span className="text-emerald-400 ml-2">✓ Volume OK</span>
                )}
              </p>
              <p className="text-xs text-slate-600 mb-2 italic">
                Note: Les dB négatifs sont normaux (0 dB = max, -30 dB = normal)
              </p>
              <div className="h-3 rounded-full bg-slate-800/50 border border-slate-700/50 overflow-hidden">
                <div
                  className={`h-full transition-all duration-150 ${
                    audioMetrics.volumeDb < -45
                      ? "bg-slate-600"
                      : audioMetrics.volumeDb < -30
                      ? "bg-emerald-500"
                      : audioMetrics.volumeDb < -15
                      ? "bg-amber-500"
                      : "bg-red-500"
                  }`}
                  style={{
                    width: `${Math.max(
                      0,
                      Math.min(100, ((audioMetrics.volumeDb + 60) / 60) * 100)
                    )}%`,
                  }}
                />
              </div>
              {audioMetrics.silenceDetected && (
                <p className="text-xs text-amber-400 mt-2">
                  ⚠️ Silence détecté (&gt; 2s)
                </p>
              )}
              {!audioMetrics.speechAvailable && audioMetrics.transcriptionMode === 'webspeech' && (
                <p className="text-xs text-red-400 mt-2">
                  ⚠️ Reconnaissance vocale non disponible
                </p>
              )}
              {audioMetrics.error && (
                <div className="p-3 bg-red-900/30 border border-red-500/50 rounded-lg text-xs mt-2">
                  {audioMetrics.error === 'network' ? (
                    <div>
                      <p className="text-red-400 font-semibold mb-2">❌ ERREUR RÉSEAU</p>
                      <p className="text-red-200 mb-2">
                        Web Speech API nécessite une connexion internet active.
                      </p>
                      <div className="bg-red-950/50 p-2 rounded mb-2">
                        <p className="text-amber-300 font-medium mb-1">Solutions :</p>
                        <ul className="list-disc list-inside space-y-0.5 text-red-100 text-xs">
                          <li>Vérifiez votre connexion internet</li>
                          <li>Désactivez votre VPN si actif</li>
                          <li>Vérifiez les paramètres pare-feu</li>
                          <li>Essayez Chrome/Edge (meilleur support)</li>
                        </ul>
                      </div>
                      <p className="text-cyan-300 text-xs italic">
                        💡 Alternative : implémentation Whisper local pour mode offline (à venir)
                      </p>
                    </div>
                  ) : audioMetrics.error === 'permission' ? (
                    <div>
                      <p className="text-red-400 font-semibold mb-1">❌ PERMISSION REFUSÉE</p>
                      <p className="text-red-200">
                        Autorisez l&apos;accès au microphone dans les paramètres du navigateur.
                      </p>
                    </div>
                  ) : (
                    <p className="text-red-400">❌ {audioMetrics.error}</p>
                  )}
                </div>
              )}
              {/* Debug info */}
              <div className="mt-3 pt-3 border-t border-slate-700/50 text-xs text-slate-600 space-y-1">
                <div className="flex justify-between">
                  <span>Mode de transcription:</span>
                  <span className={
                    audioMetrics.transcriptionMode === 'faster-whisper' ? "text-emerald-400 font-medium" :
                    audioMetrics.transcriptionMode === 'webspeech' ? "text-blue-400" :
                    "text-slate-500"
                  }>
                    {audioMetrics.transcriptionMode === 'faster-whisper' ? '🖥️ faster-whisper (local)' :
                     audioMetrics.transcriptionMode === 'webspeech' ? '☁️ Web Speech' :
                     '○ Inactif'}
                  </span>
                </div>
                {audioMetrics.transcriptionMode === 'faster-whisper' && (
                  <>
                    {audioMetrics.whisperProgress < 100 && (
                      <div className="col-span-2">
                        <div className="flex justify-between mb-1">
                          <span className="text-purple-400">Statut STT offline:</span>
                          <span className="text-purple-300">{audioMetrics.whisperProgress}%</span>
                        </div>
                        <div className="w-full bg-slate-800 rounded-full h-1.5">
                          <div
                            className="bg-purple-500 h-1.5 rounded-full transition-all duration-300"
                            style={{ width: `${audioMetrics.whisperProgress}%` }}
                          />
                        </div>
                        {audioMetrics.whisperStatus && (
                          <p className="text-xs text-purple-300 mt-1">{audioMetrics.whisperStatus}</p>
                        )}
                      </div>
                    )}
                    {audioMetrics.whisperProgress === 100 && (
                      <div className="flex justify-between">
                        <span>Statut offline:</span>
                        <span className="text-emerald-400">✓ {audioMetrics.whisperStatus}</span>
                      </div>
                    )}
                  </>
                )}
                <div className="flex justify-between">
                  <span>Volume capté:</span>
                  <span className={audioMetrics.volumeDb > -50 ? "text-emerald-400" : "text-amber-400"}>
                    {audioMetrics.volumeDb > -50 ? "✓ OK" : "⚠ Faible"}
                  </span>
                </div>
                {audioMetrics.transcriptionMode === 'webspeech' && (
                  <div className="flex justify-between">
                    <span>Web Speech API:</span>
                    <span className={audioMetrics.speechAvailable ? "text-emerald-400" : "text-red-400"}>
                      {audioMetrics.speechAvailable ? "✓ Disponible" : "✗ Non disponible"}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Reconnaissance:</span>
                  <span className={audioMetrics.isListening ? "text-emerald-400" : "text-slate-500"}>
                    {audioMetrics.isListening ? "✓ En écoute" : "○ En attente"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Micro actif:</span>
                  <span className={audioMetrics.isCapturing ? "text-emerald-400" : "text-slate-500"}>
                    {audioMetrics.isCapturing ? "✓ Oui" : "○ Non"}
                  </span>
                </div>
                {audioMetrics.transcriptionMode === 'webspeech' && (
                  <div className="flex justify-between">
                    <span>Connexion internet:</span>
                    <span className={navigator.onLine ? "text-emerald-400" : "text-red-400"}>
                      {navigator.onLine ? "✓ OK" : "✗ Hors ligne"}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Transcript Display */}
          {isRunning && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">📝</span>
                <h3 className="text-sm font-semibold text-slate-200">
                  Transcription Live
                </h3>
                {audioMetrics.isListening && (
                  <span className="ml-auto flex items-center gap-1 text-xs text-emerald-400">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    En écoute
                  </span>
                )}
              </div>

              {audioMetrics.transcript ? (
                <div className="max-h-32 overflow-y-auto text-xs text-slate-300 leading-relaxed">
                  {audioMetrics.transcript}
                </div>
              ) : (!audioMetrics.speechAvailable && audioMetrics.transcriptionMode === 'idle') ? (
                <div className="text-xs text-slate-400 leading-relaxed p-3 bg-slate-800/50 rounded-lg">
                  <p className="text-amber-400 font-medium mb-2">
                    ⚠️ Reconnaissance vocale non supportée
                  </p>
                  <p>
                    Utilisez <strong>Chrome</strong> ou <strong>Edge</strong> pour activer la transcription en temps réel.
                  </p>
                </div>
              ) : (
                <div className="text-xs text-slate-500 leading-relaxed p-3 bg-slate-800/50 rounded-lg">
                  {!audioMetrics.isListening && audioMetrics.transcriptionMode === 'webspeech' ? (
                    <>
                      <p className="text-amber-400 font-medium mb-2">
                        ⚠️ Reconnaissance vocale pas encore démarrée
                      </p>
                      <p className="text-xs text-slate-600 mb-2">
                        Ouvre la console (F12) et cherche les logs [Audio] pour voir l&apos;erreur exacte.
                      </p>
                      <p className="text-xs text-slate-600">
                        Causes fréquentes : navigateur incompatible (utilise Chrome/Edge) ou pas de connexion internet.
                      </p>
                    </>
                  ) : audioMetrics.volumeDb < -50 ? (
                    <>
                      <p className="text-amber-400 font-medium mb-2">
                        🎙️ Capture active mais volume trop faible
                      </p>
                      <ul className="list-disc list-inside space-y-1 text-slate-600">
                        <li>Le micro capte le son (vu-mètre bouge) ✓</li>
                        <li>Le moteur de transcription est actif ✓</li>
                        <li>Parle plus fort ou rapproche-toi du micro</li>
                        <li>Volume optimal: entre -40 et -20 dB</li>
                      </ul>
                    </>
                  ) : (
                    <>
                      <p className="mb-2">
                        🎙️ <strong>Tout fonctionne - Parle maintenant !</strong>
                      </p>
                      <ul className="list-disc list-inside space-y-1 text-slate-600">
                        <li>✓ Micro capte le son ({Math.round(audioMetrics.volumeDb)} dB)</li>
                        <li>✓ Mode actuel: {audioMetrics.transcriptionMode === 'faster-whisper' ? 'faster-whisper local' : audioMetrics.transcriptionMode === 'whisper' ? 'Whisper navigateur' : 'Web Speech'}</li>
                        <li>✓ Parle clairement en français</li>
                        <li>Le transcript apparaîtra après 2-4 secondes</li>
                      </ul>
                      <p className="text-xs text-slate-600 mt-2">
                        Si rien n&apos;apparaît après 5 secondes, vérifie la console (F12) pour les logs [Audio].
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Score Card */}
          <StatCard
            title="Score Global"
            icon="🏆"
            description="Radar chart — disponible après session"
            placeholder
          />

          {/* Info */}
          <div className="mt-auto p-3 rounded-lg bg-slate-900/50 border border-slate-800">
            <p className="text-xs text-slate-500 leading-relaxed">
              <span className="text-indigo-400 font-medium">
                Traitement 100% local.
              </span>{" "}
              Aucune donnée n&apos;est transmise à un serveur externe. Les
              modèles IA tournent directement dans votre navigateur via
              WebAssembly.
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
}

function StatusItem({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: "slate" | "emerald" | "amber" | "red";
}) {
  const colors = {
    slate: "text-slate-500",
    emerald: "text-emerald-400",
    amber: "text-amber-400",
    red: "text-red-400",
  };
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={`text-xs font-semibold ${colors[color]}`}>{value}</span>
    </div>
  );
}

function StatCard({
  title,
  icon,
  description,
  value,
  placeholder,
}: {
  title: string;
  icon: string;
  description: string;
  value?: string;
  placeholder?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{icon}</span>
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
      </div>
      <p className="text-xs text-slate-500 mb-3">{description}</p>
      {value ? (
        <div className="h-16 rounded-lg bg-slate-800/50 border border-slate-700/50 flex items-center justify-center">
          <span className="text-sm text-slate-200 font-semibold">{value}</span>
        </div>
      ) : placeholder && (
        <div className="h-16 rounded-lg bg-slate-800/50 border border-slate-700/50 flex items-center justify-center">
          <span className="text-xs text-slate-600">En attente de la session…</span>
        </div>
      )}
    </div>
  );
}
