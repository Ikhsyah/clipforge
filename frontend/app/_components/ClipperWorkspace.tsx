"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  Download,
  ExternalLink,
  Loader2,
  Play,
  RefreshCw,
  Scissors,
  Settings2,
  XCircle,
} from "lucide-react";
import { createJob, getJob, getJobs, getOutputUrl } from "../../lib/apiClient";
import type { ClipJob, JobStatus } from "../../types/clip.type";

const statusCopy: Record<JobStatus, string> = {
  queued: "Queued",
  running: "Processing",
  completed: "Completed",
  failed: "Failed",
};

const statusIcon = {
  queued: Clock3,
  running: Loader2,
  completed: CheckCircle2,
  failed: XCircle,
};

function formatBytes(value: number) {
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function clipTitle(name: string) {
  return name.replace(/\.mp4$/i, "").replace(/^clip_\d+_/, "").replace(/-/g, " ");
}

export const ClipperWorkspace = () => {
  const [url, setUrl] = useState("");
  const [top, setTop] = useState(5);
  const [minDuration, setMinDuration] = useState(35);
  const [maxDuration, setMaxDuration] = useState(180);
  const [analyzeSeconds, setAnalyzeSeconds] = useState("");
  const [force, setForce] = useState(false);
  const [job, setJob] = useState<ClipJob | null>(null);
  const [jobs, setJobs] = useState<ClipJob[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const activeJobId = job?.id;
  const isBusy = job?.status === "queued" || job?.status === "running";

  async function loadJobs() {
    setJobs(await getJobs());
  }

  useEffect(() => {
    loadJobs().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!activeJobId) return;

    const interval = window.setInterval(async () => {
      const nextJob = await getJob(activeJobId);
      setJob(nextJob);
      if (nextJob.status === "completed" || nextJob.status === "failed") {
        loadJobs().catch(() => undefined);
      }
    }, 2200);

    return () => window.clearInterval(interval);
  }, [activeJobId]);

  const latestLogs = useMemo(() => job?.logs.slice(-10) ?? [], [job]);

  async function handleStartJob() {
    setError("");
    if (!url.trim()) {
      setError("YouTube URL is required");
      return;
    }
    setIsSubmitting(true);

    try {
      const nextJob = await createJob({
        url,
        top,
        min_duration: minDuration,
        max_duration: maxDuration,
        model: "Systran/faster-whisper-base",
        language: "id",
        analyze_seconds: analyzeSeconds ? Number(analyzeSeconds) : null,
        burn_subtitles: true,
        force,
      });
      setJob(nextJob);
      await loadJobs();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to create job");
    } finally {
      setIsSubmitting(false);
    }
  }

  const StatusIcon = job ? statusIcon[job.status] : Clock3;

  return (
    <main className="shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">Local clip workstation</p>
          <h1>yt-clip</h1>
        </div>
        <button className="iconButton" type="button" onClick={() => loadJobs()} title="Refresh jobs">
          <RefreshCw size={18} />
        </button>
      </section>

      <section className="workspace">
        <section className="panel controlPanel">
          <div className="panelHeader">
            <Scissors size={19} />
            <h2>Create clips</h2>
          </div>

          <label className="field wide">
            <span>YouTube URL</span>
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://youtu.be/..."
              required
            />
          </label>

          <div className="gridFields">
            <label className="field">
              <span>Clip count</span>
              <input min={1} max={12} type="number" value={top} onChange={(event) => setTop(Number(event.target.value))} />
            </label>
            <label className="field">
              <span>Min seconds</span>
              <input
                min={5}
                max={600}
                type="number"
                value={minDuration}
                onChange={(event) => setMinDuration(Number(event.target.value))}
              />
            </label>
            <label className="field">
              <span>Max seconds</span>
              <input
                min={10}
                max={600}
                type="number"
                value={maxDuration}
                onChange={(event) => setMaxDuration(Number(event.target.value))}
              />
            </label>
            <label className="field">
              <span>Test seconds</span>
              <input
                min={10}
                max={7200}
                type="number"
                value={analyzeSeconds}
                onChange={(event) => setAnalyzeSeconds(event.target.value)}
                placeholder="Full"
              />
            </label>
          </div>

          <div className="optionRow">
            <Settings2 size={17} />
            <label className="check">
              <input type="checkbox" checked={force} onChange={(event) => setForce(event.target.checked)} />
              Regenerate cached files
            </label>
          </div>

          {error ? <p className="error">{error}</p> : null}

          <button className="primary" type="button" disabled={isSubmitting || isBusy} onClick={handleStartJob}>
            {isSubmitting || isBusy ? <Loader2 className="spin" size={18} /> : <Play size={18} />}
            {isSubmitting || isBusy ? "Processing" : "Start job"}
          </button>
        </section>

        <section className="panel statusPanel">
          <div className="panelHeader">
            <StatusIcon className={job?.status === "running" ? "spin" : ""} size={19} />
            <h2>{job ? statusCopy[job.status] : "No active job"}</h2>
          </div>

          {job ? (
            <>
              <div className="jobMeta">
                <span>{job.request.top} clips</span>
                <span>{job.request.min_duration}-{job.request.max_duration}s</span>
                <span>{job.request.analyze_seconds ? `${job.request.analyze_seconds}s test` : "full video"}</span>
              </div>

              <div className="logBox">
                {latestLogs.length ? latestLogs.map((line, index) => <p key={`${line}-${index}`}>{line}</p>) : <p>Waiting for logs...</p>}
              </div>

              {job.error ? <p className="error">{job.error}</p> : null}
            </>
          ) : (
            <p className="muted">Submit a YouTube link to start clipping. Results will appear here when the backend finishes.</p>
          )}
        </section>
      </section>

      <section className="results">
        <div className="sectionHeader">
          <h2>Generated clips</h2>
          <span>{job?.clips.length ?? 0} current</span>
        </div>

        {job?.clips.length ? (
          <div className="clipGrid">
            {job.clips.map((clip) => (
              <article className="clipCard" key={clip.url}>
                <video controls preload="metadata" src={getOutputUrl(clip.url)} />
                <div className="clipInfo">
                  <h3>{clipTitle(clip.name)}</h3>
                  <span>{formatBytes(clip.size_bytes)}</span>
                </div>
                <div className="clipActions">
                  <a href={getOutputUrl(clip.url)} target="_blank" rel="noreferrer">
                    <ExternalLink size={16} />
                    Open
                  </a>
                  <a href={getOutputUrl(clip.url)} download>
                    <Download size={16} />
                    Download
                  </a>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="emptyState">Completed clips will show as playable 9:16 videos.</div>
        )}
      </section>

      <section className="history">
        <div className="sectionHeader">
          <h2>Recent jobs</h2>
          <span>{jobs.length}</span>
        </div>
        <div className="jobList">
          {jobs.map((item) => {
            const Icon = statusIcon[item.status];
            return (
              <button className="jobRow" type="button" key={item.id} onClick={() => setJob(item)}>
                <Icon className={item.status === "running" ? "spin" : ""} size={17} />
                <span>{statusCopy[item.status]}</span>
                <strong>{item.clips.length} clips</strong>
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
};
