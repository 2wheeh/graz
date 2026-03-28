import { vi } from "vitest";

/**
 * Minimal chain info interface for testing.
 * Compatible with @keplr-wallet/types ChainInfo via structural typing.
 */
export interface MockChainInfo {
  chainId: string;
  chainName: string;
  rpc: string;
  rest: string;
  bech32Config?: {
    bech32PrefixAccAddr: string;
  };
}

export const mockCosmosHub: MockChainInfo = {
  chainId: "cosmoshub-4",
  chainName: "Cosmos Hub",
  rpc: "https://rpc.cosmos.network",
  rest: "https://api.cosmos.network",
  bech32Config: { bech32PrefixAccAddr: "cosmos" },
};

export const mockOsmosis: MockChainInfo = {
  chainId: "osmosis-1",
  chainName: "Osmosis",
  rpc: "https://rpc.osmosis.zone",
  rest: "https://api.osmosis.zone",
  bech32Config: { bech32PrefixAccAddr: "osmo" },
};

export const mockJuno: MockChainInfo = {
  chainId: "juno-1",
  chainName: "Juno",
  rpc: "https://rpc.juno.network",
  rest: "https://api.juno.network",
  bech32Config: { bech32PrefixAccAddr: "juno" },
};

export const allMockChains = [mockCosmosHub, mockOsmosis, mockJuno];

/**
 * Creates a mock Zustand internal store state with chains configured.
 */
export function createMockInternalState(chains: MockChainInfo[] = allMockChains) {
  return {
    chains,
    multiChainFetchConcurrency: 3,
    chainsConfig: Object.fromEntries(
      chains.map((c) => [c.chainId, { rpcHeaders: {} }]),
    ),
    walletType: undefined,
    recentChainIds: [],
    walletConnect: undefined,
    paraConfig: undefined,
    iframeOptions: undefined,
    pingInterval: 3600000,
    loggerConfig: null,
    _reconnect: false,
    _reconnectConnector: undefined,
    _notFoundFn: vi.fn(),
    _onReconnectFailed: vi.fn(),
  };
}

/**
 * Creates a mock Zustand session store state.
 */
export function createMockSessionState(
  overrides: {
    status?: "connected" | "connecting" | "reconnecting" | "disconnected";
    activeChainIds?: string[];
    accounts?: Record<string, unknown>;
  } = {},
) {
  return {
    accounts: overrides.accounts ?? null,
    activeChainIds: overrides.activeChainIds ?? null,
    status: overrides.status ?? ("disconnected" as const),
    lastPing: null,
    wcSignClients: undefined,
    paraConnector: undefined,
  };
}
