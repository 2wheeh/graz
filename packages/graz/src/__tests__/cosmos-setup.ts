/**
 * Vitest globalSetup: starts a simd instance via cosmock.
 * Provides a real Cosmos chain for on-chain hook tests.
 *
 * Requires `simd` binary in PATH.
 * Skip gracefully if not available (CI without Go).
 */
import { execSync } from "node:child_process";
import { Instance } from "cosmock";

export const TEST_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

let instance: Instance.Instance | undefined;

function hasSimd(): boolean {
  try {
    execSync("simd version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

export async function setup() {
  if (!hasSimd()) {
    console.log("[cosmock] simd not found, skipping on-chain setup");
    return;
  }

  instance = Instance.simd({
    chainId: "graz-test-1",
    denom: "stake",
    accounts: [
      { mnemonic: TEST_MNEMONIC, coins: "1000000000stake", name: "test" },
    ],
    rpcPort: 26657,
    apiPort: 1317,
    grpcPort: 9090,
  });

  await instance.start();

  // Expose RPC URL to test processes via env
  process.env.COSMOCK_RPC_URL = `http://localhost:${instance.port}`;
  process.env.COSMOCK_CHAIN_ID = "graz-test-1";
  process.env.COSMOCK_DENOM = "stake";
}

export async function teardown() {
  if (instance) {
    await instance.stop();
  }
}
