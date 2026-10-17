// Transaction IDs documented in the custody contract's README ("Verified Test Evidence"). Static, sourced from the
// repository; the app has NOT re-verified them against the chain. Shown with the DOCUMENTED label.
export type DocumentedTx = { contract: "RWA Custody"; operation: string; hash: string };
export const CUSTODY_EVIDENCE: DocumentedTx[] = [
  { contract: "RWA Custody", operation: "propose_release (SAFE assessment)", hash: "0xfec7df4b1d198f3c9e47a065154031975a20500490fa459058a07c6d73f949fc" },
  { contract: "RWA Custody", operation: "challenge_release", hash: "0x92b26e80391a1ad21140fa9c1978f9d5b0fb0844812f7303e8784d6c3409ffe7" },
  { contract: "RWA Custody", operation: "finalize_release (blocked after challenge)", hash: "0xecf8b470946eaf106cceaf10fed9b64e4bad13e13256362b0736a9fb437a1d00" },
  { contract: "RWA Custody", operation: "reopen_challenged_proposal", hash: "0x739ddb5bcd7124f835734dafa7c0d7701e232a972e37a72c6f2395d54c60083f" },
  { contract: "RWA Custody", operation: "propose_release (reassessment)", hash: "0xec910cda86f94c1f388dd68ac7988b1521be558d6c2ca157e71cbb680833eda2" },
  { contract: "RWA Custody", operation: "finalize_release", hash: "0xda9f71404407451b34b9e6efddcef70b64141e3b7c8d43f592c3277fa1bdb878" },
  { contract: "RWA Custody", operation: "claim_rwa_custody", hash: "0x721e3b8affe774e37f1128ff1496674a68a8d83cd66da402743107335b78df17" },
];
