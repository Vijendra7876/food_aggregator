export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch('/api' + path, { headers: { 'content-type': 'application/json' }, ...init });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error?.message ?? `Request failed (${res.status})`);
  return body as T;
}
export const inr = (n: number | null | undefined) => (n == null ? 'unknown' : '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 2 }));
