import type { OfflineAminoSigner } from "@cosmjs/amino";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import type { OfflineDirectSigner } from "@cosmjs/proto-signing";

import type { Key, Wallet } from "../types/wallet";

/**
 * Default test mnemonic (BIP39). DO NOT use in production.
 * Generates deterministic addresses for reproducible tests.
 */
export const TEST_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

/**
 * Known bech32 prefixes for common Cosmos chains.
 */
const BECH32_PREFIXES: Record<string, string> = {
  "cosmoshub-4": "cosmos",
  "osmosis-1": "osmo",
  "juno-1": "juno",
};

export interface MockSignerOptions {
  /**
   * BIP39 mnemonic for key derivation. Defaults to TEST_MNEMONIC.
   * All chains share the same mnemonic (different prefixes produce different addresses).
   */
  mnemonic?: string;
  /**
   * Map of chainId → bech32 prefix. Auto-detected for known chains.
   * For unknown chains, falls back to the chain name portion before the first '-'.
   */
  prefixes?: Record<string, string>;
  /**
   * Feature flags to simulate wallet behavior.
   */
  features?: {
    /** If true or Error, enable()/getKey() will reject */
    connectError?: boolean | Error;
    /** If true or Error, signDirect/signAmino will reject */
    signError?: boolean | Error;
  };
}

interface ChainWallet {
  signer: OfflineDirectSigner & OfflineAminoSigner;
  key: Key;
}

function resolvePrefix(chainId: string, prefixes?: Record<string, string>): string {
  return prefixes?.[chainId] ?? BECH32_PREFIXES[chainId] ?? chainId.split("-")[0] ?? "cosmos";
}

/**
 * Creates a mock wallet with **real signing capability** using CosmJS
 * DirectSecp256k1HdWallet. No wallet UI is shown — transactions are
 * signed automatically, just like wagmi's mock connector.
 *
 * The returned wallet implements graz's `Wallet` interface with real
 * OfflineDirectSigner/OfflineAminoSigner backed by actual private keys.
 * Signatures are cryptographically valid — usable with real chain endpoints
 * (e.g., Starship) for full integration tests.
 *
 * @example
 * ```ts
 * import { mockSigner, testChains, createTestGrazConfig } from "graz/test";
 *
 * // Create a real signer (async — needs key derivation)
 * const wallet = await mockSigner();
 *
 * // Use with graz config
 * const config = createTestGrazConfig({
 *   chains: [testChains.cosmosHub],
 *   wallet,
 * });
 *
 * // Signatures are real — works with Starship or any chain endpoint
 * ```
 */
export async function mockSigner(options: MockSignerOptions = {}): Promise<Wallet> {
  const { mnemonic = TEST_MNEMONIC, prefixes, features = {} } = options;

  // Pre-create wallets for each known chain prefix
  const walletCache = new Map<string, ChainWallet>();

  async function getOrCreateWallet(chainId: string): Promise<ChainWallet> {
    const cached = walletCache.get(chainId);
    if (cached) return cached;

    const prefix = resolvePrefix(chainId, prefixes);
    const hdWallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix });
    const [account] = await hdWallet.getAccounts();

    const key: Key = {
      name: `Test (${chainId})`,
      algo: account!.algo,
      pubKey: account!.pubkey,
      address: new Uint8Array(20),
      bech32Address: account!.address,
      isNanoLedger: false,
      isKeystone: false,
    };

    // Combined signer that supports both Direct and Amino
    const signer = hdWallet as unknown as OfflineDirectSigner & OfflineAminoSigner;

    const entry = { signer, key };
    walletCache.set(chainId, entry);
    return entry;
  }

  function makeConnectError(): Error {
    if (features.connectError instanceof Error) return features.connectError;
    return new Error("Mock wallet: connection rejected by user");
  }

  function makeSignError(): Error {
    if (features.signError instanceof Error) return features.signError;
    return new Error("Mock wallet: signing rejected by user");
  }

  // Pre-warm common chains
  const commonChains = Object.keys(BECH32_PREFIXES);
  await Promise.all(commonChains.map((id) => getOrCreateWallet(id)));

  return {
    enable: async (_chainIds: string | string[]) => {
      if (features.connectError) throw makeConnectError();
    },

    getKey: async (chainId: string) => {
      if (features.connectError) throw makeConnectError();
      const { key } = await getOrCreateWallet(chainId);
      return key;
    },

    getKeys: async (chainIds: string[]) => {
      return Promise.all(chainIds.map(async (id) => {
        const { key } = await getOrCreateWallet(id);
        return key;
      }));
    },

    getOfflineSigner: (chainId: string) => {
      // Sync access — relies on pre-warmed cache
      const cached = walletCache.get(chainId);
      if (!cached) {
        throw new Error(
          `mockSigner: chain "${chainId}" not pre-warmed. ` +
          `Call await wallet.getKey("${chainId}") first, or add it to the prefixes option.`,
        );
      }
      if (features.signError) {
        return {
          getAccounts: cached.signer.getAccounts.bind(cached.signer),
          signDirect: async () => { throw makeSignError(); },
          signAmino: async () => { throw makeSignError(); },
        } as unknown as OfflineAminoSigner & OfflineDirectSigner;
      }
      return cached.signer;
    },

    getOfflineSignerAuto: async (chainId: string) => {
      const { signer } = await getOrCreateWallet(chainId);
      if (features.signError) {
        return {
          getAccounts: signer.getAccounts.bind(signer),
          signDirect: async () => { throw makeSignError(); },
          signAmino: async () => { throw makeSignError(); },
        } as unknown as OfflineAminoSigner | OfflineDirectSigner;
      }
      return signer;
    },

    getOfflineSignerOnlyAmino: (chainId: string) => {
      const cached = walletCache.get(chainId);
      if (!cached) {
        throw new Error(`mockSigner: chain "${chainId}" not pre-warmed.`);
      }
      return cached.signer as unknown as OfflineAminoSigner;
    },

    signDirect: async (chainId, signer, signDoc) => {
      if (features.signError) throw makeSignError();
      const { signer: realSigner } = await getOrCreateWallet(chainId);
      return (realSigner as OfflineDirectSigner).signDirect(signer, signDoc as any);
    },

    signAmino: async (chainId, signer, signDoc) => {
      if (features.signError) throw makeSignError();
      const { signer: realSigner } = await getOrCreateWallet(chainId);
      return (realSigner as unknown as OfflineAminoSigner).signAmino(signer, signDoc);
    },

    experimentalSuggestChain: async () => {},
    subscription: () => () => {},
    init: async () => {},
    disable: async () => {},
  };
}

