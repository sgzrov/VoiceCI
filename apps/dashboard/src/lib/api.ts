const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3000";

export async function fetchRuns(status?: string) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  const res = await fetch(`${API_URL}/runs?${params}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to fetch runs: ${res.status}`);
  return res.json();
}

export async function fetchRun(id: string) {
  const res = await fetch(`${API_URL}/runs/${id}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to fetch run: ${res.status}`);
  return res.json();
}

export async function setBaseline(runId: string) {
  const res = await fetch(`${API_URL}/runs/${runId}/baseline`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`Failed to set baseline: ${res.status}`);
  return res.json();
}
