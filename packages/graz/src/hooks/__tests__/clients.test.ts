/**
 * Client hook tests using cosmock (real simd instance).
 * No vi.mock for @cosmjs — real StargateClient connected to real chain.
 *
 * Skips if COSMOCK_RPC_URL is not set (simd not available).
 */
import { vi, describe, it, expect, beforeEach } from "vitest";
import { waitFor } from "@testing-library/react";

// Unmock store for real provider flow (setup.ts mocks it globally)
vi.unmock("../../store");

import { testChains } from "../../test/index";
import { configureGraz } from "../../actions/configure";
import { renderHookWithProviders } from "../../__tests__/test-utils";
import { useStargateClient } from "../clients";
import {
  grazInternalDefaultValues,
  grazSessionDefaultValues,
  useGrazInternalStore,
  useGrazSessionStore,
} from "../../store";

const RPC_URL = process.env.COSMOCK_RPC_URL;
const hasCosmock = Boolean(RPC_URL);

const cosmockChain = {
  ...testChains.cosmosHub,
  chainId: process.env.COSMOCK_CHAIN_ID ?? "graz-test-1",
  rpc: RPC_URL ?? "http://localhost:26657",
  rest: "http://localhost:1317",
};

beforeEach(() => {
  useGrazSessionStore.setState(grazSessionDefaultValues);
  useGrazInternalStore.setState(grazInternalDefaultValues);
  configureGraz({ chains: [cosmockChain] as any, autoReconnect: false });
});

describe.runIf(hasCosmock)("useStargateClient", () => {
  it("connects to real chain and returns Record<chainId, StargateClient>", async () => {
    const { result } = renderHookWithProviders(
      () => useStargateClient({ chainId: [cosmockChain.chainId] }),
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    }, { timeout: 10000 });

    expect(result.current.data).toHaveProperty(cosmockChain.chainId);
  });

  it("returned client can query real chain height", async () => {
    const { result } = renderHookWithProviders(
      () => useStargateClient({ chainId: [cosmockChain.chainId] }),
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    }, { timeout: 10000 });

    const client = result.current.data![cosmockChain.chainId]!;
    const height = await (client as any).getHeight();
    expect(height).toBeGreaterThan(0);
  });

  it("respects enabled: false", () => {
    const { result } = renderHookWithProviders(
      () => useStargateClient({ chainId: [cosmockChain.chainId], enabled: false }),
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it("can query genesis balance via returned client", async () => {
    const { DirectSecp256k1HdWallet } = await import("@cosmjs/proto-signing");
    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(
      "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
      { prefix: "cosmos" },
    );
    const [account] = await wallet.getAccounts();

    const { result } = renderHookWithProviders(
      () => useStargateClient({ chainId: [cosmockChain.chainId] }),
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    }, { timeout: 10000 });

    const client = result.current.data![cosmockChain.chainId]!;
    const balance = await (client as any).getBalance(
      account!.address,
      process.env.COSMOCK_DENOM ?? "stake",
    );
    expect(BigInt(balance.amount)).toBeGreaterThan(BigInt(0));
  });
});
