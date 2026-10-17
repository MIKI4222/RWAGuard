// Pure request control for read-only RPC calls: limited concurrency, de-duplication of identical in-flight
// reads, a short cache, and retry with backoff when the RPC reports a rate limit. No SDK or browser imports.
export type RawRead = (address: string, fn: string, args: any[]) => Promise<any>;
export type ReaderOptions = { maxConcurrent?: number; ttlMs?: number; retries?: number; baseDelayMs?: number; now?: () => number; sleep?: (ms: number) => Promise<void> };

export const isRateLimit = (e: unknown) => /rate limit|exceeds defined limit|\b429\b|too many requests/i.test(e instanceof Error ? e.message : String(e));

export function createReader(raw: RawRead, o: ReaderOptions = {}) {
  const max = o.maxConcurrent ?? 3, ttl = o.ttlMs ?? 8000, retries = o.retries ?? 4, base = o.baseDelayMs ?? 700;
  const now = o.now ?? (() => Date.now());
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const cache = new Map<string, { t: number; v: any }>();
  const inflight = new Map<string, Promise<any>>();
  const waiters: (() => void)[] = [];
  let active = 0;

  const acquire = async () => { if (active >= max) await new Promise<void>((r) => waiters.push(r)); active++; };
  const release = () => { active--; waiters.shift()?.(); };

  async function run(address: string, fn: string, args: any[]) {
    for (let i = 0; ; i++) {
      await acquire();
      try { return await raw(address, fn, args); }
      catch (e) { if (i < retries && isRateLimit(e)) { /* back off outside the slot */ } else throw e; }
      finally { release(); }
      await sleep(base * 2 ** i);
    }
  }
  function read(address: string, fn: string, args: any[] = []): Promise<any> {
    const key = `${address.toLowerCase()}|${fn}|${JSON.stringify(args)}`;
    const hit = cache.get(key);
    if (hit && now() - hit.t < ttl) return Promise.resolve(hit.v);
    const pending = inflight.get(key);
    if (pending) return pending;
    const p = run(address, fn, args).then((v) => { cache.set(key, { t: now(), v }); return v; }).finally(() => { inflight.delete(key); });
    inflight.set(key, p);
    return p;
  }
  return { read, clear: () => cache.clear() };
}
