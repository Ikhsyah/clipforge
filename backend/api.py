from __future__ import annotations

import subprocess
import sys
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal
from urllib.parse import quote

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field


BASE_DIR = Path(__file__).resolve().parent
OUTPUTS_DIR = BASE_DIR / "outputs"


class ClipJobRequest(BaseModel):
    url: str = Field(min_length=8)
    top: int = Field(default=5, ge=1, le=12)
    min_duration: float = Field(default=35, ge=5, le=600)
    max_duration: float = Field(default=180, ge=10, le=600)
    model: str = "Systran/faster-whisper-base"
    language: str = "id"
    analyze_seconds: float | None = Field(default=None, ge=10, le=7200)
    burn_subtitles: bool = True
    force: bool = False


class ClipFile(BaseModel):
    name: str
    url: str
    size_bytes: int


class ClipJob(BaseModel):
    id: str
    status: Literal["queued", "running", "completed", "failed"]
    request: ClipJobRequest
    created_at: str
    updated_at: str
    logs: list[str] = []
    clips: list[ClipFile] = []
    error: str | None = None


app = FastAPI(title="yt-clip API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/outputs", StaticFiles(directory=OUTPUTS_DIR), name="outputs")

jobs: dict[str, ClipJob] = {}
jobs_lock = threading.Lock()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def clip_url(path: Path) -> str:
    relative = path.resolve().relative_to(OUTPUTS_DIR.resolve()).as_posix()
    return "/outputs/" + quote(relative)


def discover_clips(started_at: float) -> list[ClipFile]:
    clips: list[ClipFile] = []
    for path in OUTPUTS_DIR.rglob("clips/*.mp4"):
        if path.stat().st_mtime + 1 < started_at:
            continue
        clips.append(
            ClipFile(
                name=path.name,
                url=clip_url(path),
                size_bytes=path.stat().st_size,
            )
        )
    clips.sort(key=lambda item: item.name)
    return clips


def set_job(job_id: str, **updates) -> None:
    with jobs_lock:
        job = jobs[job_id]
        data = job.model_dump()
        data.update(updates)
        data["updated_at"] = now_iso()
        jobs[job_id] = ClipJob(**data)


def run_job(job_id: str) -> None:
    with jobs_lock:
        request = jobs[job_id].request

    started_at = time.time()
    set_job(job_id, status="running")

    command = [
        sys.executable,
        "clipper.py",
        request.url,
        "--top",
        str(request.top),
        "--min",
        str(request.min_duration),
        "--max",
        str(request.max_duration),
        "--model",
        request.model,
        "--language",
        request.language,
    ]

    if request.analyze_seconds:
        command.extend(["--analyze-seconds", str(request.analyze_seconds)])
    if not request.burn_subtitles:
        command.append("--no-burn-subtitles")
    if request.force:
        command.append("--force")

    process = subprocess.Popen(
        command,
        cwd=BASE_DIR,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        bufsize=1,
    )

    logs: list[str] = []
    assert process.stdout is not None
    for line in process.stdout:
        cleaned = line.rstrip()
        if cleaned:
            logs.append(cleaned)
            set_job(job_id, logs=logs[-120:])

    code = process.wait()
    clips = discover_clips(started_at)
    if code == 0:
        set_job(job_id, status="completed", clips=clips, logs=logs[-120:])
    else:
        set_job(
            job_id,
            status="failed",
            clips=clips,
            logs=logs[-120:],
            error=f"clipper.py exited with code {code}",
        )


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/jobs", response_model=ClipJob)
def create_job(request: ClipJobRequest) -> ClipJob:
    if request.max_duration <= request.min_duration:
        raise HTTPException(status_code=400, detail="max_duration must be greater than min_duration")

    job_id = uuid.uuid4().hex
    job = ClipJob(
        id=job_id,
        status="queued",
        request=request,
        created_at=now_iso(),
        updated_at=now_iso(),
    )
    with jobs_lock:
        jobs[job_id] = job

    thread = threading.Thread(target=run_job, args=(job_id,), daemon=True)
    thread.start()
    return job


@app.get("/api/jobs", response_model=list[ClipJob])
def list_jobs() -> list[ClipJob]:
    with jobs_lock:
        return sorted(jobs.values(), key=lambda job: job.created_at, reverse=True)


@app.get("/api/jobs/{job_id}", response_model=ClipJob)
def get_job(job_id: str) -> ClipJob:
    with jobs_lock:
        job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job
