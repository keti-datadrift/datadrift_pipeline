/** Read API errors, using the caller's message if decoding fails. */
async function responseJson<T>(
  response: Response,
  fallback?: string,
): Promise<T> {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : (fallback ?? JSON.stringify(data.detail)),
    );
  }
  return data;
}

export const jsonRequest = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export async function requestJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  return responseJson<T>(
    await fetch(path, init),
    "요청을 처리하지 못했습니다.",
  );
}

/** Fetch catalog data from /api without the browser cache. */
export async function api<T>(
  url: string,
  body?: unknown,
  method = "POST",
): Promise<T> {
  return responseJson<T>(
    await fetch(
      "/api" + url,
      body === undefined ? { cache: "no-store" } : jsonRequest(method, body),
    ),
  );
}
