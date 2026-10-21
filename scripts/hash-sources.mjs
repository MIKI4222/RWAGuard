// Prints the SHA-256 of every contract source in contracts/ so it can be compared with the code shown by the explorer.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
const dir = "contracts";
for (const f of readdirSync(dir).filter((x) => x.endsWith(".py")).sort()) {
  const h = createHash("sha256").update(readFileSync(`${dir}/${f}`)).digest("hex");
  console.log(`${h}  ${dir}/${f}`);
}
