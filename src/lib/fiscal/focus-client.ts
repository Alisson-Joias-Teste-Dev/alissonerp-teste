const FOCUS_BASE = "https://api.focusnfe.com.br";

export interface FocusResponse<T = unknown> {
  ok: boolean;
  status: number;
  data: T;
}

export async function focusRequest<T = unknown>(
  method: "GET" | "POST" | "DELETE" | "PATCH",
  path: string,
  token: string,
  body?: unknown
): Promise<FocusResponse<T>> {
  const auth = Buffer.from(`${token}:`).toString("base64");
  const res = await fetch(`${FOCUS_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data: T;
  try {
    data = await res.json();
  } catch {
    data = {} as T;
  }
  return { ok: res.ok, status: res.status, data };
}
