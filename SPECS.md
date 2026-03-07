# SPECS : DebateCoach-V1 (Local-First Desktop)

## 🎯 Vision du Produit
Application d'entraînement au débat (Coupe de France). Analyse 100% locale (Navigateur) via WebAssembly. Pas de stockage vidéo (flux jetable).

## 🛠️ Stack Technique Imposée
- Framework : Next.js 14+ (App Router), Tailwind CSS.
- Vision : MediaPipe (@mediapipe/tasks-vision) pour FaceLandmarker et PoseLandmarker.
- Audio : Web Audio API + Transformers.js (@xenova/transformers) avec modèle Whisper-tiny.
- Graphiques : Recharts.

## 🧠 Logique métier (Features à implémenter)
1. **Analyse du Regard (Gaze) :** Calculer si les iris sont centrés. Seuil : > 70% de temps face caméra.
2. **Analyse Posturale :** Détecter l'ouverture des bras. Alerte si les mains sont jointes ou cachées trop longtemps.
3. **Analyse Vocale :** - Calcul du WPM (Words Per Minute). Cible : 140-160.
   - Détection des silences (dB < -45dB pendant > 2s).
4. **Fiche de Score Finale :** Dashboard avec radar chart (Posture, Regard, Débit, Vocabulaire, Émotion).

## 🏗️ Structure de fichiers souhaitée
- /components/camera/CameraFeed.tsx (Vidéo + Canvas Overlay)
- /hooks/useDebateAnalysis.ts (Orchestrateur des modèles ML)
- /lib/mediapipe-utils.ts (Calculs mathématiques de posture/regard)
- /app/dashboard/page.tsx (Résultats finaux)

## ⚡ Architecture de Performance (Multi-threading)

### 1. Off-main-thread Processing (Web Workers)
- **AudioWorker.ts :** Toute l'instance de `@xenova/transformers` (Whisper) doit vivre ici. 
- **Communication :** Le thread principal envoie les `AudioBuffer` via `postMessage`. Le Worker renvoie les segments de texte transcrits et les timestamps.
- **Chargement :** Utiliser un pattern de singleton pour ne charger le modèle de 75MB qu'une seule fois au démarrage.

### 2. Synchronization
- L'UI doit rester à 60 FPS. 
- La vidéo (MediaPipe) tourne sur le thread principal (ou OffscreenCanvas si possible), tandis que la transcription tourne en arrière-plan.