/**
 * Unit tests for createMultiChainFunction (sync operations)
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMultiChainFunction } from "../multi-chain-core";

interface MockChainInfo {
  chainId: string;
  chainName: string;
  rpc: string;
  rest: string;
}

describe("createMultiChainFunction", () => {
  const mockChains: MockChainInfo[] = [
    {
      chainId: "cosmoshub-4",
      chainName: "Cosmos Hub",
      rpc: "https://rpc.cosmos.network",
      rest: "https://api.cosmos.network",
    },
    {
      chainId: "osmosis-1",
      chainName: "Osmosis",
      rpc: "https://rpc.osmosis.zone",
      rest: "https://api.osmosis.zone",
    },
    {
      chainId: "juno-1",
      chainName: "Juno",
      rpc: "https://rpc.juno.network",
      rest: "https://api.juno.network",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should always return Record format for single chain", () => {
    const result = createMultiChainFunction([mockChains[0]!], (chain) => {
      return chain.chainName;
    });

    expect(result).toEqual({
      "cosmoshub-4": "Cosmos Hub",
    });
    expect(typeof result).toBe("object");
    expect(Array.isArray(result)).toBe(false);
  });

  it("should return Record format for multiple chains", () => {
    const result = createMultiChainFunction(mockChains, (chain) => {
      return chain.chainName;
    });

    expect(result).toEqual({
      "cosmoshub-4": "Cosmos Hub",
      "osmosis-1": "Osmosis",
      "juno-1": "Juno",
    });
  });

  it("should execute function for each chain", () => {
    const fn = vi.fn((chain: MockChainInfo) => chain.chainId.toUpperCase());

    const result = createMultiChainFunction(mockChains, fn);

    expect(fn).toHaveBeenCalledTimes(3);
    expect(fn).toHaveBeenNthCalledWith(1, mockChains[0], 0, mockChains);
    expect(fn).toHaveBeenNthCalledWith(2, mockChains[1], 1, mockChains);
    expect(fn).toHaveBeenNthCalledWith(3, mockChains[2], 2, mockChains);
    expect(result).toEqual({
      "cosmoshub-4": "COSMOSHUB-4",
      "osmosis-1": "OSMOSIS-1",
      "juno-1": "JUNO-1",
    });
  });

  it("should handle empty array", () => {
    const result = createMultiChainFunction([] as MockChainInfo[], (chain) => chain.chainName);

    expect(result).toEqual({});
  });

  it("should preserve types in returned Record", () => {
    const result = createMultiChainFunction(mockChains, (chain) => ({
      name: chain.chainName,
      id: chain.chainId,
    }));

    expect(result["cosmoshub-4"]).toHaveProperty("name");
    expect(result["cosmoshub-4"]).toHaveProperty("id");
    expect(result["cosmoshub-4"]?.name).toBe("Cosmos Hub");
  });

  it("should handle different return types", () => {
    const numberResult = createMultiChainFunction(mockChains, (chain) => chain.chainId.length);
    expect(numberResult["cosmoshub-4"]).toBe(11);
    expect(typeof numberResult["cosmoshub-4"]).toBe("number");

    const boolResult = createMultiChainFunction(mockChains, (chain) => chain.chainId.startsWith("cosmos"));
    expect(boolResult["cosmoshub-4"]).toBe(true);
    expect(boolResult["osmosis-1"]).toBe(false);
  });
});
