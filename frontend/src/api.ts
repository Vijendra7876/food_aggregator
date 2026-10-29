const configuredApiBase = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/, '') || undefined;

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body != null && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const res = await fetch(`${configuredApiBase ?? '/api'}${path}`, {
    ...init,
    headers,
  });
  const body: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const message =
      typeof body === 'object' && body !== null && 'error' in body &&
      typeof body.error === 'object' && body.error !== null && 'message' in body.error &&
      typeof body.error.message === 'string'
        ? body.error.message
        : `Request failed (${res.status})`;
    throw new Error(message);
  }

  return body as T;
}

export const inr = (n: number | null | undefined) =>
  n == null ? 'unknown' : `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
