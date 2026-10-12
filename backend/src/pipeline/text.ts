const SPELL: Record<string, string> = { biriyani: 'biryani', briyani: 'biryani', rd: 'road', st: 'street' };

export const norm = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/['.]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

export const tokens = (s: string) => norm(s).split(' ').map(t => SPELL[t] ?? t).filter(Boolean);

export function levSim(a: string, b: string): number {
  if (a === b) return 1;
  const m = a.length, n = b.length;
  if (!m || !n) return 0;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++)
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 1 - prev[n] / Math.max(m, n);
}
const inter = (a: string[], b: string[]) => { const B = new Set(b); return [...new Set(a)].filter(x => B.has(x)).length; };
export const dice = (a: string[], b: string[]) => (!a.length || !b.length) ? 0 : (2 * inter(a, b)) / (new Set(a).size + new Set(b).size);
export const jaccard = (a: string[], b: string[]) => { const u = new Set([...a, ...b]).size; return u ? inter(a, b) / u : 0; };
export const containment = (a: string[], b: string[]) => { const m = Math.min(new Set(a).size, new Set(b).size); return m ? inter(a, b) / m : 0; };

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371, rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export const digits10 = (p?: string | null) => (p ? p.replace(/\D/g, '').slice(-10) : '');
export const round2 = (n: number) => Math.round(n * 100) / 100;
