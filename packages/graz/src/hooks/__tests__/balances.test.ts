/**
 * Balance and transfer tests using cosmock (real simd instance).
 * No mock clients — real StargateClient, real balances, real tx.
 *
 * Skips if COSMOCK_RPC_URL is not set.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { StargateClient, SigningStargateClient } from "@cosmjs/stargate";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";

const RPC_URL = process.env.COSMOCK_RPC_URL;
const DENOM = process.env.COSMOCK_DENOM ?? "stake";
const hasCosmock = Boolean(RPC_URL);

const TEST_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

let senderAddress: string;
let recipientAddress: string;
let senderWallet: DirectSecp256k1HdWallet;

beforeAll(async () => {
  if (!hasCosmock) return;

  senderWallet = await DirectSecp256k1HdWallet.fromMnemonic(TEST_MNEMONIC, { prefix: "cosmos" });
  const [sender] = await senderWallet.getAccounts();
  senderAddress = sender!.address;

  const recipientWallet = await DirectSecp256k1HdWallet.fromMnemonic(
    "test test test test test test test test test test test junk",
    { prefix: "cosmos" },
  );
  const [recipient] = await recipientWallet.getAccounts();
  recipientAddress = recipient!.address;
});

describe.runIf(hasCosmock)("balance queries (on-chain)", () => {
  it("getBalance returns genesis balance", async () => {
    const client = await StargateClient.connect(RPC_URL!);
    const balance = await client.getBalance(senderAddress, DENOM);

    expect(balance.denom).toBe(DENOM);
    expect(BigInt(balance.amount)).toBeGreaterThan(BigInt(0));
    client.disconnect();
  });

  it("getAllBalances returns array of Coin", async () => {
    const client = await StargateClient.connect(RPC_URL!);
    const balances = await client.getAllBalances(senderAddress);

    expect(Array.isArray(balances)).toBe(true);
    expect(balances.length).toBeGreaterThan(0);
    expect(balances[0]).toHaveProperty("denom");
    expect(balances[0]).toHaveProperty("amount");
    client.disconnect();
  });

  it("getBalance returns zero for unknown denom", async () => {
    const client = await StargateClient.connect(RPC_URL!);
    const balance = await client.getBalance(senderAddress, "unonexistent");

    expect(balance.amount).toBe("0");
    client.disconnect();
  });
});

describe.runIf(hasCosmock)("sendTokens (on-chain)", () => {
  it("sends real tokens and verifies recipient balance", async () => {
    const client = await SigningStargateClient.connectWithSigner(RPC_URL!, senderWallet);

    // Sign and broadcast — may throw on result parsing due to CosmJS/CometBFT
    // event encoding mismatch, but the tx still lands on-chain.
    try {
      const result = await client.sendTokens(
        senderAddress,
        recipientAddress,
        [{ denom: DENOM, amount: "1000000" }],
        { amount: [{ denom: DENOM, amount: "0" }], gas: "200000" },
      );
      expect(result.code).toBe(0);
    } catch {
      // CosmJS 0.36 vs CometBFT 0.37 base64 event parsing mismatch —
      // tx succeeded, result parsing failed. Wait for block inclusion.
      await new Promise((r) => setTimeout(r, 1000));
    }

    // Verify on-chain (source of truth)
    const queryClient = await StargateClient.connect(RPC_URL!);
    const balance = await queryClient.getBalance(recipientAddress, DENOM);
    expect(BigInt(balance.amount)).toBe(BigInt(1000000));

    client.disconnect();
    queryClient.disconnect();
  });

  it("sender balance decreased after transfer", async () => {
    const client = await StargateClient.connect(RPC_URL!);
    const balance = await client.getBalance(senderAddress, DENOM);

    // Genesis was 1000000000, sent 1000000
    expect(BigInt(balance.amount)).toBeLessThan(BigInt(1000000000));
    client.disconnect();
  });
});
