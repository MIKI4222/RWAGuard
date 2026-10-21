// Reproducible live run against the DEPLOYED Bradbury contracts (no browser, no mocks).
//   Read-only:   npm run evidence
//   With writes: EVIDENCE_PRIVATE_KEY=0x… npm run evidence -- breaker:health_check custody:propose_release
// Operations: breaker:health_check | breaker:guarded_action[=data] | breaker:unpause | custody:start_cycle[=label]
//             custody:propose_release | custody:challenge=<evidence-url> | custody:finalize | custody:claim[=label]
// The private key is read from the environment, used only to sign, and never printed or written. Use a TESTNET key.
import { createClient, createAccount } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { mkdirSync, writeFileSync } from "node:fs";
import { BREAKER_ADDRESS, CUSTODY_ADDRESS, RPC_URL } from "../src/lib/config";
import { parse, getBreaker, getCustody } from "../src/lib/api";
import { waitForVerdict } from "../src/lib/txverify";
import { runOp, renderEvidence, type OpName, type EvidenceStep } from "../src/lib/evidence-runner";

const key = process.env.EVIDENCE_PRIVATE_KEY;
const base = { chain: testnetBradbury, ...(RPC_URL ? { endpoint: RPC_URL } : {}) } as any;
const readClient: any = createClient(base);
const account: any = key ? createAccount(key as `0x${string}`) : null;
const writeClient: any = account ? createClient({ ...base, account }) : null;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const read = async (address: string, fn: string, args: any[] = []) => {
  const v = await readClient.readContract({ address: address as `0x${string}`, functionName: fn, args });
  return Array.isArray(v) ? v : parse(v);
};
const write = async (address: string, fn: string, args: any[], value = 0n) => {
  if (!writeClient) throw new Error("EVIDENCE_PRIVATE_KEY is required for write operations");
  console.log(`→ ${fn}: submitting…`);
  const hash = (await writeClient.writeContract({ address: address as `0x${string}`, functionName: fn, args, value })) as string;
  console.log(`  hash ${hash}`);
  const r = await waitForVerdict({ getTx: () => readClient.getTransaction({ hash }), sleep, onUpdate: (v) => console.log(`  ${v.status} · ${v.execution}`) });
  if (r.verdict.state === "failed") throw new Error(r.verdict.detail);
  if (r.verdict.state !== "success" && r.verdict.state !== "accepted") throw new Error(`Outcome unknown after waiting (${r.verdict.status}); check the explorer`);
  return { hash, verdict: r.verdict, finalized: r.verdict.state === "success" };
};

async function main() {
  const startedAt = new Date().toISOString();
  const snapshots = { breaker: await getBreaker(read, BREAKER_ADDRESS), custody: await getCustody(read, CUSTODY_ADDRESS) };
  console.log("Read-only snapshot OK (both contracts answered).");
  const steps: EvidenceStep[] = [];
  for (const raw of process.argv.slice(2)) {
    const [op, ...rest] = raw.split("=");
    steps.push(await runOp({ read, write, breaker: BREAKER_ADDRESS, custody: CUSTODY_ADDRESS }, op as OpName, rest.join("=")));
    const s = steps[steps.length - 1];
    console.log(`  ${s.error ? `✗ ${s.error}` : s.check === null ? "✓ state change confirmed" : `⚠ ${s.check}`}`);
  }
  const md = renderEvidence(steps, snapshots, { network: "GenLayer Bradbury Testnet", account: account ? String(account.address) : null, startedAt, explorer: "https://explorer-bradbury.genlayer.com", breaker: BREAKER_ADDRESS, custody: CUSTODY_ADDRESS });
  mkdirSync("docs/evidence", { recursive: true });
  const file = `docs/evidence/live-${startedAt.replace(/[:.]/g, "-")}.md`;
  writeFileSync(file, md);
  console.log(`Evidence written to ${file}`);
  if (steps.some((s) => s.error || s.check !== null)) process.exitCode = 1;
}
main().catch((e) => { console.error(String(e?.message || e)); process.exit(1); });
