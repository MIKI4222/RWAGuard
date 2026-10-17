// Off-chain weather helpers (Open-Meteo). Pure and fetch-injectable. Everything here is LIVE EXTERNAL data:
// it is never written to a contract by the app. The custody contract fetches its own configured URL.
export const POLICY = { tempMin: -10, tempMax: 35, windMax: 60, precipMax: 10 } as const;

// Same query shape as DEFAULT_WEATHER_URL in the custody contract.
export function buildOpenMeteoUrl(lat: number, lon: number): string {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new Error("Latitude must be between -90 and 90");
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) throw new Error("Longitude must be between -180 and 180");
  return "https://api.open-meteo.com/v1/forecast" + `?latitude=${lat}&longitude=${lon}` + "&current=temperature_2m,wind_speed_10m,precipitation" +
    "&temperature_unit=celsius&wind_speed_unit=kmh" + "&precipitation_unit=mm&timezone=UTC";
}
export function coordsFromUrl(url: string): { lat: number; lon: number } | null {
  try { const u = new URL(url); const lat = Number(u.searchParams.get("latitude")), lon = Number(u.searchParams.get("longitude"));
    return u.searchParams.get("latitude") && u.searchParams.get("longitude") && Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null; } catch { return null; }
}
export type CurrentWeather = { time: string; temperature: number; wind: number; precipitation: number };
export function parseCurrentWeather(j: any): CurrentWeather {
  const c = j?.current;
  const num = (v: any, n: string) => { if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`Weather response is missing ${n}`); return v; };
  if (!c || typeof c !== "object") throw new Error("Weather response has no current observation");
  return { time: String(c.time ?? ""), temperature: num(c.temperature_2m, "temperature_2m"), wind: num(c.wind_speed_10m, "wind_speed_10m"), precipitation: num(c.precipitation, "precipitation") };
}
export type PolicyCheck = { name: string; ok: boolean; value: number; limit: string };
// LOCAL pre-check of the contract's documented policy; the authoritative decision is the validators' consensus.
export function evaluatePolicy(w: CurrentWeather): { safe: boolean; checks: PolicyCheck[] } {
  const checks: PolicyCheck[] = [
    { name: "Temperature °C", ok: w.temperature >= POLICY.tempMin && w.temperature <= POLICY.tempMax, value: w.temperature, limit: `${POLICY.tempMin}…${POLICY.tempMax}` },
    { name: "Wind km/h", ok: w.wind <= POLICY.windMax, value: w.wind, limit: `≤ ${POLICY.windMax}` },
    { name: "Precipitation mm", ok: w.precipitation <= POLICY.precipMax, value: w.precipitation, limit: `≤ ${POLICY.precipMax}` },
  ];
  return { safe: checks.every((c) => c.ok), checks };
}
export type GeoResult = { name: string; country: string; region: string; lat: number; lon: number };
export function parseGeocoding(j: any): GeoResult[] {
  if (!j || j.results === undefined) return [];
  if (!Array.isArray(j.results)) throw new Error("Unexpected geocoding response");
  return j.results.filter((r: any) => Number.isFinite(r?.latitude) && Number.isFinite(r?.longitude)).map((r: any) => ({ name: String(r.name), country: String(r.country ?? ""), region: String(r.admin1 ?? ""), lat: r.latitude, lon: r.longitude }));
}
type F = typeof fetch;
async function getJson(url: string, f: F, ms = 8000): Promise<any> {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try { const r = await f(url, { signal: ctl.signal }); if (r.status === 429) throw new Error("Rate limited by the weather provider"); if (!r.ok) throw new Error(`Weather provider returned HTTP ${r.status}`); return await r.json(); }
  catch (e: any) { throw new Error(e?.name === "AbortError" ? "Weather request timed out" : e?.message || "Weather request failed"); }
  finally { clearTimeout(t); }
}
export async function geocode(q: string, f: F = fetch): Promise<GeoResult[]> {
  if (q.trim().length < 2) throw new Error("Enter at least 2 characters");
  return parseGeocoding(await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q.trim())}&count=5&language=en&format=json`, f));
}
export async function fetchCurrent(url: string, f: F = fetch): Promise<{ weather: CurrentWeather; raw: any }> {
  const raw = await getJson(url, f); return { weather: parseCurrentWeather(raw), raw };
}
export type HourlyPoint = { time: string; temperature: number; wind: number; precipitation: number };
export async function fetchHourly(lat: number, lon: number, f: F = fetch): Promise<HourlyPoint[]> {
  buildOpenMeteoUrl(lat, lon);
  const j = await getJson(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,wind_speed_10m,precipitation&forecast_days=2&timezone=UTC`, f);
  const h = j?.hourly; if (!h || !Array.isArray(h.time)) throw new Error("Hourly forecast unavailable");
  return h.time.map((t: string, i: number) => ({ time: t, temperature: h.temperature_2m?.[i], wind: h.wind_speed_10m?.[i], precipitation: h.precipitation?.[i] })).filter((p: HourlyPoint) => [p.temperature, p.wind, p.precipitation].every((v) => typeof v === "number"));
}
