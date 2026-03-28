/**
 * Tests for mockSigner — real CosmJS signing without wallet UI.
 */
import { describe, it, expect } from "vitest";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";

import { mockSigner, TEST_MNEMONIC } from "../mock-wallet";

describe("mockSigner", () => {
  it("creates a wallet implementing the full Wallet interface", async () => {
    const wallet = await mockSigner();

    expect(typeof wallet.enable).toBe("function");
    expect(typeof wallet.getKey).toBe("function");
    expect(typeof wallet.getKeys).toBe("function");
    expect(typeof wallet.getOfflineSigner).toBe("function");
    expect(typeof wallet.getOfflineSignerAuto).toBe("function");
    expect(typeof wallet.signDirect).toBe("function");
    expect(typeof wallet.signAmino).toBe("function");
  });

  it("produces deterministic addresses from TEST_MNEMONIC", async () => {
    const wallet = await mockSigner();

    const key1 = await wallet.getKey("cosmoshub-4");
    const key2 = await wallet.getKey("cosmoshub-4");

    expect(key1.bech32Address).toBe(key2.bech32Address);
    expect(key1.bech32Address).toMatch(/^cosmos1/);
  });

  it("produces different addresses for different chain prefixes", async () => {
    const wallet = await mockSigner();

    const cosmosKey = await wallet.getKey("cosmoshub-4");
    const osmoKey = await wallet.getKey("osmosis-1");

    expect(cosmosKey.bech32Address).toMatch(/^cosmos1/);
    expect(osmoKey.bech32Address).toMatch(/^osmo1/);
    // Same key, different prefix encoding
    expect(cosmosKey.bech32Address).not.toBe(osmoKey.bech32Address);
  });

  it("matches DirectSecp256k1HdWallet addresses", async () => {
    const wallet = await mockSigner();
    const key = await wallet.getKey("cosmoshub-4");

    // Verify against raw CosmJS wallet
    const raw = await DirectSecp256k1HdWallet.fromMnemonic(TEST_MNEMONIC, { prefix: "cosmos" });
    const [account] = await raw.getAccounts();

    expect(key.bech32Address).toBe(account!.address);
    expect(key.algo).toBe(account!.algo);
  });

  it("getOfflineSigner returns a real signer with getAccounts", async () => {
    const wallet = await mockSigner();
    const signer = wallet.getOfflineSigner("cosmoshub-4");

    const accounts = await signer.getAccounts();
    expect(accounts).toHaveLength(1);
    expect(accounts[0]!.address).toMatch(/^cosmos1/);
    expect(accounts[0]!.algo).toBe("secp256k1");
    expect(accounts[0]!.pubkey).toBeInstanceOf(Uint8Array);
    expect(accounts[0]!.pubkey.length).toBeGreaterThan(0);
  });

  it("getOfflineSignerAuto returns a real signer", async () => {
    const wallet = await mockSigner();
    const signer = await wallet.getOfflineSignerAuto("cosmoshub-4");

    const accounts = await signer.getAccounts();
    expect(accounts).toHaveLength(1);
    expect(accounts[0]!.address).toMatch(/^cosmos1/);
  });

  it("getKeys returns keys for multiple chains", async () => {
    const wallet = await mockSigner();
    const keys = await wallet.getKeys!(["cosmoshub-4", "osmosis-1", "juno-1"]);

    expect(keys).toHaveLength(3);
    expect(keys[0]!.bech32Address).toMatch(/^cosmos1/);
    expect(keys[1]!.bech32Address).toMatch(/^osmo1/);
    expect(keys[2]!.bech32Address).toMatch(/^juno1/);
  });

  it("supports custom mnemonic", async () => {
    const customMnemonic = "test test test test test test test test test test test junk";
    const wallet = await mockSigner({ mnemonic: customMnemonic });

    const key = await wallet.getKey("cosmoshub-4");
    expect(key.bech32Address).toMatch(/^cosmos1/);

    // Should differ from default mnemonic
    const defaultWallet = await mockSigner();
    const defaultKey = await defaultWallet.getKey("cosmoshub-4");
    expect(key.bech32Address).not.toBe(defaultKey.bech32Address);
  });

  it("supports custom prefixes for unknown chains", async () => {
    const wallet = await mockSigner({
      prefixes: { "mychain-1": "myc" },
    });

    const key = await wallet.getKey("mychain-1");
    expect(key.bech32Address).toMatch(/^myc1/);
  });

  it("connectError causes enable and getKey to reject", async () => {
    const wallet = await mockSigner({
      features: { connectError: new Error("User rejected") },
    });

    await expect(wallet.enable("cosmoshub-4")).rejects.toThrow("User rejected");
    await expect(wallet.getKey("cosmoshub-4")).rejects.toThrow("User rejected");
  });

  it("signError causes signDirect to reject", async () => {
    const wallet = await mockSigner({
      features: { signError: true },
    });

    await expect(
      wallet.signDirect("cosmoshub-4", "cosmos1...", {} as any),
    ).rejects.toThrow("signing rejected");
  });

  it("signError causes getOfflineSigner().signDirect to reject", async () => {
    const wallet = await mockSigner({
      features: { signError: true },
    });

    const signer = wallet.getOfflineSigner("cosmoshub-4");
    await expect(
      (signer as any).signDirect("cosmos1...", {} as any),
    ).rejects.toThrow("signing rejected");
  });

  it("enable resolves without error by default", async () => {
    const wallet = await mockSigner();
    await expect(wallet.enable("cosmoshub-4")).resolves.toBeUndefined();
  });
});
