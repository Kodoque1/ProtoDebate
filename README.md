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