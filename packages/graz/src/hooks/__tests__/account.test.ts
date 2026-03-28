import { vi, describe, it, expect, beforeEach } from "vitest";

// Mock actions
vi.mock("../../actions/account", () => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  reconnect: vi.fn(),
  getOfflineSigners: vi.fn(),
}));
vi.mock("../../actions/wallet", () => ({
  checkWallet: vi.fn().mockResolvedValue(true),
}));

// Mock wallet hook
vi.mock("../wallet", () => ({
  useCheckWallet: vi.fn().mockReturnValue({ data: true }),
}));

// Mock client hooks (avoid nested useQuery)
vi.mock("../clients", () => ({
  useStargateClient: vi.fn().mockReturnValue({ data: undefined }),
  useCosmWasmClient: vi.fn().mockReturnValue({ data: undefined }),
}));

import { useGrazInternalStore, useGrazSessionStore } from "../../store";
import { renderHookWithProviders } from "../../__tests__/test-utils";
import { mockCosmosHub, mockOsmosis, createMockInternalState, createMockSessionState } from "../../__tests__/mocks/chain-fixtures";
import { useAccount, useConnect, useDisconnect } from "../account";
import { useActiveChainIds, useActiveChains } from "../chains";

function setupStoreWithChains(
  sessionOverrides: Parameters<typeof createMockSessionState>[0] = {},
) {
  const internalState = createMockInternalState([mockCosmosHub, mockOsmosis]);
  const sessionState = createMockSessionState(sessionOverrides);

  vi.mocked(useGrazInternalStore).mockImplementation((selector?: any) => {
    if (selector) return selector(internalState);
    return internalState;
  });
  vi.mocked(useGrazInternalStore.getState).mockReturnValue(internalState as any);

  vi.mocked(useGrazSessionStore).mockImplementation((selector?: any) => {
    if (selector) return selector(sessionState);
    return sessionState;
  });
  vi.mocked(useGrazSessionStore.getState).mockReturnValue(sessionState as any);
}

describe("useAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return isDisconnected when not connected", () => {
    setupStoreWithChains({ status: "disconnected" });

    const { result } = renderHookWithProviders(() => useAccount());

    expect(result.current.isDisconnected).toBe(true);
    expect(result.current.isConnected).toBe(false);
    expect(result.current.isConnecting).toBe(false);
    expect(result.current.isReconnecting).toBe(false);
    expect(result.current.status).toBe("disconnected");
  });

  it("should return isConnected when connected", () => {
    setupStoreWithChains({
      status: "connected",
      activeChainIds: ["cosmoshub-4"],
      accounts: {
        "cosmoshub-4": { bech32Address: "cosmos1abc", name: "Test" },
      },
    });

    const { result } = renderHookWithProviders(() => useAccount());

    expect(result.current.isConnected).toBe(true);
    expect(result.current.isDisconnected).toBe(false);
    expect(result.current.status).toBe("connected");
  });

  it("should return multi-chain account data when connected", () => {
    setupStoreWithChains({
      status: "connected",
      activeChainIds: ["cosmoshub-4", "osmosis-1"],
      accounts: {
        "cosmoshub-4": { bech32Address: "cosmos1abc", name: "Cosmos" },
        "osmosis-1": { bech32Address: "osmo1def", name: "Osmosis" },
      },
    });

    const { result } = renderHookWithProviders(() =>
      useAccount({ chainId: ["cosmoshub-4", "osmosis-1"] }),
    );

    expect(result.current.data).toBeDefined();
    expect(result.current.data).toHaveProperty("cosmoshub-4");
    expect(result.current.data).toHaveProperty("osmosis-1");
    expect((result.current.data as any)?.["cosmoshub-4"]?.bech32Address).toBe("cosmos1abc");
    expect((result.current.data as any)?.["osmosis-1"]?.bech32Address).toBe("osmo1def");
  });

  it("should return undefined data when disconnected", () => {
    setupStoreWithChains({ status: "disconnected" });

    const { result } = renderHookWithProviders(() => useAccount());

    expect(result.current.data).toBeUndefined();
  });

  it("should return isLoading during connecting", () => {
    setupStoreWithChains({ status: "connecting" });

    const { result } = renderHookWithProviders(() => useAccount());

    expect(result.current.isConnecting).toBe(true);
    expect(result.current.isLoading).toBe(true);
  });

  it("should return isLoading during reconnecting", () => {
    setupStoreWithChains({ status: "reconnecting" });

    const { result } = renderHookWithProviders(() => useAccount());

    expect(result.current.isReconnecting).toBe(true);
    expect(result.current.isLoading).toBe(true);
  });
});

describe("useConnect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupStoreWithChains();
  });

  it("should expose connect and connectAsync functions", () => {
    const { result } = renderHookWithProviders(() => useConnect());

    expect(result.current.connect).toBeDefined();
    expect(result.current.connectAsync).toBeDefined();
    expect(typeof result.current.connect).toBe("function");
    expect(typeof result.current.connectAsync).toBe("function");
  });

  it("should expose mutation state", () => {
    const { result } = renderHookWithProviders(() => useConnect());

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isSuccess).toBe(false);
    expect(result.current.error).toBeNull();
  });
});

describe("useDisconnect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupStoreWithChains({ status: "connected" });
  });

  it("should expose disconnect and disconnectAsync functions", () => {
    const { result } = renderHookWithProviders(() => useDisconnect());

    expect(result.current.disconnect).toBeDefined();
    expect(result.current.disconnectAsync).toBeDefined();
    expect(typeof result.current.disconnect).toBe("function");
    expect(typeof result.current.disconnectAsync).toBe("function");
  });
});

describe("useActiveChainIds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return null when no active chains", () => {
    setupStoreWithChains({ status: "disconnected", activeChainIds: undefined as any });
    // Force null for activeChainIds
    vi.mocked(useGrazSessionStore).mockImplementation((selector?: any) => {
      const state = { ...createMockSessionState(), activeChainIds: null };
      if (selector) return selector(state);
      return state;
    });

    const { result } = renderHookWithProviders(() => useActiveChainIds());
    expect(result.current).toBeNull();
  });

  it("should return active chain IDs when connected", () => {
    setupStoreWithChains({
      status: "connected",
      activeChainIds: ["cosmoshub-4", "osmosis-1"],
    });

    const { result } = renderHookWithProviders(() => useActiveChainIds());
    expect(result.current).toEqual(["cosmoshub-4", "osmosis-1"]);
  });
});

describe("useActiveChains", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return undefined when no active chains", () => {
    vi.mocked(useGrazSessionStore).mockImplementation((selector?: any) => {
      const state = { ...createMockSessionState(), activeChainIds: null };
      if (selector) return selector(state);
      return state;
    });
    const internalState = createMockInternalState([mockCosmosHub, mockOsmosis]);
    vi.mocked(useGrazInternalStore).mockImplementation((selector?: any) => {
      if (selector) return selector(internalState);
      return internalState;
    });

    const { result } = renderHookWithProviders(() => useActiveChains());
    expect(result.current).toBeUndefined();
  });

  it("should return active ChainInfo objects when connected", () => {
    setupStoreWithChains({
      status: "connected",
      activeChainIds: ["cosmoshub-4"],
    });

    const { result } = renderHookWithProviders(() => useActiveChains());
    expect(result.current).toBeDefined();
    expect(result.current).toHaveLength(1);
    expect(result.current![0]!.chainId).toBe("cosmoshub-4");
  });

  it("should return multiple active chains", () => {
    setupStoreWithChains({
      status: "connected",
      activeChainIds: ["cosmoshub-4", "osmosis-1"],
    });

    const { result } = renderHookWithProviders(() => useActiveChains());
    expect(result.current).toHaveLength(2);
    expect(result.current!.map((c: any) => c.chainId)).toEqual(["cosmoshub-4", "osmosis-1"]);
  });
});
