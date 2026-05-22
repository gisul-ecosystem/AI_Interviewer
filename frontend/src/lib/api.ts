import type {
  ChatResponse,
  InterviewConfig,
  ScoresResponse,
  SetupResponse,
} from "@/types/interview";

const API_BASE = `${process.env.NEXT_PUBLIC_API_URL}/api/interview`;

async function handleResponse<T>(response: Response): Promise<T> {
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message =
      (data as { detail?: string } | null)?.detail || "Request failed";
    throw new Error(message);
  }

  return data as T;
}

export async function setupInterview(
  config: InterviewConfig
): Promise<SetupResponse> {
  const response = await fetch(`${API_BASE}/setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  return handleResponse<SetupResponse>(response);
}

export async function sendMessage(
  session_id: string,
  message: string
): Promise<ChatResponse> {
  const response = await fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id, message }),
  });
  return handleResponse<ChatResponse>(response);
}

export async function scoreInterview(
  session_id: string
): Promise<ScoresResponse> {
  const response = await fetch(`${API_BASE}/score`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id }),
  });
  return handleResponse<ScoresResponse>(response);
}
