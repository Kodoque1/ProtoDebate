from __future__ import annotations

import os
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel

MODEL_SIZE = os.getenv("FASTER_WHISPER_MODEL", "medium")
COMPUTE_TYPE = os.getenv("FASTER_WHISPER_COMPUTE", "int8")
DEVICE = os.getenv("FASTER_WHISPER_DEVICE", "cpu")
BEAM_SIZE = int(os.getenv("FASTER_WHISPER_BEAM_SIZE", "5"))
BEST_OF = int(os.getenv("FASTER_WHISPER_BEST_OF", "5"))
VAD_MIN_SILENCE_MS = int(os.getenv("FASTER_WHISPER_VAD_MIN_SILENCE_MS", "400"))

app = FastAPI(title="ProtoDebate Local STT")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

model = WhisperModel(MODEL_SIZE, device=DEVICE, compute_type=COMPUTE_TYPE)


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "model": MODEL_SIZE,
        "device": DEVICE,
        "compute": COMPUTE_TYPE,
        "beam_size": str(BEAM_SIZE),
        "best_of": str(BEST_OF),
    }


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)) -> dict[str, str]:
    if not file.filename:
        return {"text": ""}

    suffix = Path(file.filename).suffix or ".wav"
    content = await file.read()

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        segments, _info = model.transcribe(
            tmp_path,
            language="fr",
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": VAD_MIN_SILENCE_MS},
            beam_size=BEAM_SIZE,
            best_of=BEST_OF,
            temperature=0.0,
            condition_on_previous_text=False,
            compression_ratio_threshold=2.0,
            no_speech_threshold=0.5,
            word_timestamps=False,
        )
        text = " ".join(segment.text.strip() for segment in segments).strip()
        return {"text": text}
    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("server:app", host="127.0.0.1", port=8008, reload=False)
