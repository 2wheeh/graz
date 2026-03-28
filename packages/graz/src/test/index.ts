/**
 * graz/test — Test utilities for Cosmos dApps
 *
 * @example
 * ```ts
 * import { mockSigner, testChains, createMockAccounts, TEST_MNEMONIC } from "graz/test";
 *
 * const wallet = await mockSigner();
 * const key = await wallet.getKey("cosmoshub-4");
 * const signer = wallet.getOfflineSigner("cosmoshub-4");
 * // → real DirectSecp256k1HdWallet, real signatures, no wallet UI
 * ```
 *
 * @packageDocumentation
 */

export { mockSigner, TEST_MNEMONIC } from "./mock-wallet";
export type { MockSignerOptions } from "./mock-wallet";

export { createMockKey, createMockAccounts } from "./mock-account";

export { testChains } from "./chains";
