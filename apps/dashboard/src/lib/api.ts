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

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  created_at: string;
  revoked_at: string | null;
  active: boolean;
}

export interface CreateKeyResponse {
  id: string;
  api_key: string;
  name: string;
  prefix: string;
  created_at: string;
  warning: string;
}

export async function fetchApiKeys(): Promise<ApiKey[]> {
  const res = await fetch(`${API_URL}/keys`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch API keys: ${res.status}`);
  return res.json();
}

export async function createApiKey(name: string): Promise<CreateKeyResponse> {
  const res = await fetch(`${API_URL}/keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`Failed to create API key: ${res.status}`);
  return res.json();
}

export async function revokeApiKey(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/keys/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Failed to revoke API key: ${res.status}`);
}
