export type JobStatus = "queued" | "running" | "completed" | "failed";

export type ClipFile = {
  name: string;
  url: string;
  size_bytes: number;
};

export type ClipJob = {
  id: string;
  status: JobStatus;
  created_at: string;
  updated_at: string;
  logs: string[];
  clips: ClipFile[];
  error: string | null;
  request: {
    url: string;
    top: number;
    min_duration: number;
    max_duration: number;
    model: string;
    language: string;
    analyze_seconds: number | null;
    burn_subtitles: boolean;
    force: boolean;
  };
};

export type CreateClipJobInput = {
  url: string;
  top: number;
  min_duration: number;
  max_duration: number;
  model: string;
  language: string;
  analyze_seconds: number | null;
  burn_subtitles: boolean;
  force: boolean;
};
