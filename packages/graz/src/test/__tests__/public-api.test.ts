/**
 * Tests for graz/test public API exports.
 */
import { describe, it, expect } from "vitest";

import {
  mockSigner,
  testChains,
  createMockKey,
  createMockAccounts,
  TEST_MNEMONIC,
} from "../index";

describe("createMockKey", () => {
  it("returns Key with bech32Address matching chain prefix", () => {
    const key = createMockKey("cosmoshub-4");
    expect(key.bech32Address).toMatch(/^cosmos1/);
    expect(key.name).toContain("cosmoshub-4");
    expect(key.algo).toBe("secp256k1");
  });

  it("returns Key with osmo prefix for osmosis", () => {
    const key = createMockKey("osmosis-1");
    expect(key.bech32Address).toMatch(/^osmo1/);
  });

  it("accepts overrides", () => {
    const key = createMockKey("cosmoshub-4", { name: "Custom" });
    expect(key.name).toBe("Custom");
    expect(key.bech32Address).toMatch(/^cosmos1/);
  });
});

describe("createMockAccounts", () => {
  it("creates accounts for multiple chains", () => {
    const accounts = createMockAccounts(["cosmoshub-4", "osmosis-1"]);
    expect(accounts).toHaveProperty("cosmoshub-4");
    expect(accounts).toHaveProperty("osmosis-1");
    expect(accounts["cosmoshub-4"]!.bech32Address).toMatch(/^cosmos1/);
    expect(accounts["osmosis-1"]!.bech32Address).toMatch(/^osmo1/);
  });
});

describe("testChains", () => {
  it("exports cosmosHub, osmosis, juno", () => {
    expect(testChains.cosmosHub.chainId).toBe("cosmoshub-4");
    expect(testChains.osmosis.chainId).toBe("osmosis-1");
    expect(testChains.juno.chainId).toBe("juno-1");
  });

  it("has bech32Config", () => {
    expect(testChains.cosmosHub.bech32Config!.bech32PrefixAccAddr).toBe("cosmos");
    expect(testChains.osmosis.bech32Config!.bech32PrefixAccAddr).toBe("osmo");
  });

  it("has currencies and feeCurrencies", () => {
    expect(testChains.cosmosHub.currencies).toHaveLength(1);
    expect(testChains.cosmosHub.feeCurrencies).toHaveLength(1);
  });
});

describe("TEST_MNEMONIC", () => {
  it("is a valid 12-word mnemonic", () => {
    expect(TEST_MNEMONIC.split(" ")).toHaveLength(12);
  });
});

describe("mockSigner", () => {
  it("exports as async function", () => {
    expect(typeof mockSigner).toBe("function");
  });
});
