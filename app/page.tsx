"use client";

import dynamic from "next/dynamic";

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
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs text-slate-400">Analyse 100% locale</span>
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
            <CameraFeed />
          </div>

          {/* Status bar */}
          <div className="flex items-center gap-4 px-4 py-2 rounded-lg bg-slate-900 border border-slate-800">
            <StatusItem label="Regard" value="—" color="slate" />
            <div className="w-px h-4 bg-slate-700" />
            <StatusItem label="Posture" value="—" color="slate" />
            <div className="w-px h-4 bg-slate-700" />
            <StatusItem label="Débit vocal" value="— WPM" color="slate" />
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
            placeholder
          />

          {/* Posture Card */}
          <StatCard
            title="Posture"
            icon="🧍"
            description="Ouverture des bras & position"
            placeholder
          />

          {/* Speech Card */}
          <StatCard
            title="Débit Vocal"
            icon="🎙"
            description="Mots par minute (cible : 140-160)"
            placeholder
          />

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
  placeholder,
}: {
  title: string;
  icon: string;
  description: string;
  placeholder?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{icon}</span>
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
      </div>
      <p className="text-xs text-slate-500 mb-3">{description}</p>
      {placeholder && (
        <div className="h-16 rounded-lg bg-slate-800/50 border border-slate-700/50 flex items-center justify-center">
          <span className="text-xs text-slate-600">En attente de la session…</span>
        </div>
      )}
    </div>
  );
}
