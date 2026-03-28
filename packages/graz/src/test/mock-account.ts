import type { Key } from "../types/wallet";

const BECH32_PREFIXES: Record<string, string> = {
  "cosmoshub-4": "cosmos",
  "osmosis-1": "osmo",
  "juno-1": "juno",
};

/**
 * Creates a mock Key object for testing.
 * Generates a deterministic bech32Address based on the chainId.
 */
export function createMockKey(chainId: string, overrides?: Partial<Key>): Key {
  const prefix = BECH32_PREFIXES[chainId] ?? chainId.split("-")[0] ?? "cosmos";
  return {
    name: `Test Account (${chainId})`,
    algo: "secp256k1",
    pubKey: new Uint8Array(33),
    address: new Uint8Array(20),
    bech32Address: `${prefix}1testaddr${chainId.replace(/[^a-z0-9]/g, "")}`,
    isNanoLedger: false,
    isKeystone: false,
    ...overrides,
  };
}

/**
 * Creates mock accounts for multiple chains.
 * Returns a Record<chainId, Key> suitable for session store.
 */
export function createMockAccounts(
  chainIds: string[],
  overrides?: Partial<Key>,
): Record<string, Key> {
  return Object.fromEntries(
    chainIds.map((id) => [id, createMockKey(id, overrides)]),
  );
}
