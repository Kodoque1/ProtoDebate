# ProtoDebate

Application d'entraînement au débat (Coupe de France) avec analyse 100 % locale via WebAssembly — aucune donnée n'est envoyée à un serveur.

## Prérequis

- **Node.js** ≥ 18.x ([télécharger](https://nodejs.org/))
- **npm** ≥ 9.x (fourni avec Node.js)
- Un navigateur moderne supportant **WebAssembly** et **SharedArrayBuffer** (Chrome 92+, Firefox 79+, Edge 92+)

> ⚠️ L'application utilise les en-têtes `Cross-Origin-Opener-Policy: same-origin` et `Cross-Origin-Embedder-Policy: require-corp` pour activer `SharedArrayBuffer`. Ces en-têtes sont configurés automatiquement par le serveur de développement Next.js.

## Installation

Cloner le dépôt puis installer les dépendances :

```bash
git clone https://github.com/Kodoque1/ProtoDebate.git
cd ProtoDebate
npm install
```

## Démarrer en mode développement

```bash
npm run dev
```

L'application est accessible sur [http://localhost:3000](http://localhost:3000).

Le serveur redémarre automatiquement à chaque modification de fichier (hot-reload).

## Construire pour la production

```bash
npm run build
npm run start
```

`npm run build` génère un build optimisé dans le dossier `.next/`.
`npm run start` démarre le serveur Next.js en mode production sur [http://localhost:3000](http://localhost:3000).

## Linting

```bash
npm run lint
```

## Reconnaissance vocale offline fiable (faster-whisper local)

Le frontend utilise `faster-whisper` via un service local (`http://127.0.0.1:8008/transcribe`) pour l'offline.

### Installer le service local

```bash
npm run stt:install
```

### Lancer le service local

```bash
npm run stt:serve
```

Variables optionnelles du service:

- `FASTER_WHISPER_MODEL` (default: `medium`)
- `FASTER_WHISPER_DEVICE` (`cpu` ou `cuda`)
- `FASTER_WHISPER_COMPUTE` (`int8`, `float16`, `float32`)
- `FASTER_WHISPER_BEAM_SIZE` (default: `5`)
- `FASTER_WHISPER_BEST_OF` (default: `5`)
- `FASTER_WHISPER_VAD_MIN_SILENCE_MS` (default: `400`)

Variable optionnelle frontend:

- `NEXT_PUBLIC_LOCAL_STT_URL` (default: `http://127.0.0.1:8008/transcribe`)
- `NEXT_PUBLIC_FORCE_LOCAL_STT` (`1` ou `true`) pour désactiver Web Speech et forcer le mode local

## Structure du projet

```
/app          → Pages et routes (Next.js App Router)
/components   → Composants React (ex. CameraFeed)
/hooks        → Hooks personnalisés (ex. useDebateAnalysis)
/lib          → Utilitaires métier (ex. mediapipe-utils)
/public       → Assets statiques (polices, modèles WASM…)
```

## Stack technique

- **Next.js 16** (App Router) + **TypeScript**
- **Tailwind CSS v4**
- **MediaPipe Tasks Vision** — analyse de posture et du regard via WebAssembly
- **Web Audio API** — analyse vocale dans le navigateur
