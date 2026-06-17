import type { ClipJob, CreateClipJobInput } from "../types/clip.type";

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8010";
const CLIENT_API_BASE = "";

export const getJobs = async () => {
  const response = await fetch(`${CLIENT_API_BASE}/api/jobs`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load jobs");
  }
  return (await response.json()) as ClipJob[];
};

export const getJob = async (jobId: string) => {
  const response = await fetch(`${CLIENT_API_BASE}/api/jobs/${jobId}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load job");
  }
  return (await response.json()) as ClipJob;
};

export const createJob = async (input: CreateClipJobInput) => {
  const response = await fetch(`${CLIENT_API_BASE}/api/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || "Failed to create job");
  }

  return (await response.json()) as ClipJob;
};

export const getOutputUrl = (path: string) => `${API_BASE}${path}`;
