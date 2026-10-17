export const EXPLORER = "https://explorer-bradbury.genlayer.com";
export const contractUrl = (address: string) => `${EXPLORER}/address/${address}`;
// The explorer is client-rendered and its per-transaction URL format could not be verified, so the app does NOT
// guess one: a transaction link resolves to the verified contract page. The hash is shown for copying/searching.
export const TX_URL_FORMAT_VERIFIED = false;
export const txUrl = (_hash: string, contractAddress: string) => contractUrl(contractAddress);
