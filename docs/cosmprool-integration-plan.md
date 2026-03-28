# cosmock — graz on-chain testing 연동 계획

## 개요

[cosmock](https://github.com/2wheeh/cosmock) (`npm: cosmock@0.0.1`)은
prool의 Cosmos 버전. simd/wasmd를 child process로 관리하여
Docker/Kubernetes 없이 real on-chain test를 가능하게 한다.

## cosmock API

```ts
import { Instance } from "cosmock";

const instance = Instance.simd({
  chainId: "test-1",
  denom: "stake",
  accounts: [
    { mnemonic: TEST_MNEMONIC, coins: "1000000000stake", name: "alice" },
  ],
  rpcPort: 26657,
});

await instance.start();    // init → genesis → gentx → spawn → health check
// instance.port → 26657
// instance.status → "started"

await instance.restart();  // stop → clean → start (state reset)
await instance.stop();     // SIGTERM + data dir cleanup
```

### 지원 인스턴스

| 인스턴스 | 바이너리 | 용도 |
|----------|---------|------|
| `Instance.simd()` | simd | 표준 Cosmos SDK 모듈 (bank, staking, gov) |
| `Instance.wasmd()` | wasmd | CosmWasm 컨트랙트 테스트 |

### 아키텍처 (prool 패턴)

```
Instance.define(fn) → Instance (lifecycle: start/stop/restart, mitt events)
  └── simd(params?) → cosmosBase({ binary: "simd", ... })
  └── wasmd(params?) → cosmosBase({ binary: "wasmd", patchGenesis })

cosmosBase 흐름:
  mkdtemp → init → genesis patch (denom, accounts) →
  keys add → gentx → collect-gentxs →
  config patch (ports) → spawn (tinyexec) → health check (height > 0)
```

### prool과의 대응

| prool | cosmock |
|-------|---------|
| `Instance.anvil()` | `Instance.simd()` |
| `Instance.define(fn)` | `Instance.define(fn)` |
| mitt events | mitt events (동일 라이브러리) |
| tinyexec child process | tinyexec child process |
| `server.restart()` | `instance.restart()` |

## graz 연동 방법

### 1. 설치

```bash
pnpm add -D cosmock
# simd binary 필요: go install cosmossdk.io/simapp/simd@v0.47
# wasmd binary (CosmWasm 테스트 시): go install github.com/CosmWasm/wasmd@latest
```

### 2. vitest globalSetup

```ts
// test/cosmos-setup.ts
import { Instance } from "cosmock";

const TEST_MNEMONIC = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

let instance: Instance.Instance;

export async function setup() {
  instance = Instance.simd({
    chainId: "graz-test-1",
    denom: "stake",
    accounts: [
      { mnemonic: TEST_MNEMONIC, coins: "1000000000stake", name: "test" },
    ],
  });

  await instance.start();
  process.env.COSMOS_RPC_URL = `http://localhost:${instance.port}`;
}

export async function teardown() {
  await instance?.stop();
}
```

```ts
// vitest.config.mts
export default defineConfig({
  test: {
    globalSetup: ["./test/cosmos-setup.ts"],
  },
});
```

### 3. 테스트 코드 (mock client 제거)

```ts
// 현재 (mock)
vi.mock("@cosmjs/stargate", () => ({
  StargateClient: { connect: vi.fn().mockResolvedValue(mockClient) },
}));

// cosmock 후 (real)
import { StargateClient } from "@cosmjs/stargate";
const client = await StargateClient.connect(process.env.COSMOS_RPC_URL!);
const balance = await client.getBalance(address, "stake");
// → 진짜 on-chain 잔고
```

### 4. mockSigner 연동

```ts
import { mockSigner } from "graz/test";
import { SigningStargateClient } from "@cosmjs/stargate";

const wallet = await mockSigner();
const signer = wallet.getOfflineSigner("graz-test-1");
const client = await SigningStargateClient.connectWithSigner(
  process.env.COSMOS_RPC_URL!,
  signer,
);

const result = await client.sendTokens(from, to, coins, fee);
expect(result.code).toBe(0);  // real tx
```

## 제거 가능한 것 (cosmock 연동 후)

| 현재 (mock) | cosmock 후 |
|-------------|-----------|
| `vi.mock("@cosmjs/stargate")` | **제거** |
| `vi.mock("@cosmjs/cosmwasm-stargate")` | **제거** |
| `createMockStargateClient()` | **제거** |
| `createMockCosmWasmClient()` | **제거** |
| `createMockSigningStargateClient()` | **제거** |
| `createMockSigningCosmWasmClient()` | **제거** |
| `setupCosmJSMocks()` | **제거** |
| hook 테스트의 vi.mock 셋업 (~20줄/파일) | **대폭 축소** |

## 유지하는 것

| 유틸 | 이유 |
|------|------|
| `mockSigner` | 지갑 UI 대체 (DirectSecp256k1HdWallet) |
| `TestGrazProvider` | 선언적 상태 설정 (connected, accounts) |
| `renderHookWithGraz` | hook 테스트 wrapper |
| `testChains` | chain fixture (cosmock에 전달) |

## graz hooks 인프라 요구사항

| Hook | cosmock 인프라 |
|------|---------------|
| useStargateClient, useCosmWasmClient | `Instance.simd()` 1개 |
| useBalance, useBalances, useBalanceStaked | `Instance.simd()` 1개 |
| useSendTokens | `Instance.simd()` 1개 |
| useAccount, useConnect, useDisconnect | `Instance.simd()` 1개 |
| useInstantiateContract, useExecuteContract | `Instance.wasmd()` 1개 |
| useQuerySmart, useQueryRaw | `Instance.wasmd()` 1개 |
| **useSendIbcTokens** | **simd 2개 + relayer** (향후) |

**95%의 hooks는 simd 단일 인스턴스로 충분.**

## 작업 순서

### Phase 1: 기본 연동
1. `pnpm add -D cosmock`
2. globalSetup 추가 (simd instance)
3. client hook 테스트에서 mock client → real client
4. balance hook 테스트에서 mock → real query

### Phase 2: 전면 전환
1. 모든 hook 테스트를 on-chain으로 전환
2. mock client 파일 제거 (`src/__tests__/mocks/cosmjs-clients.ts`)
3. vi.mock 셋업 최소화

### Phase 3: CosmWasm + IBC (선택)
1. `Instance.wasmd()` 추가 → contract 테스트
2. multi-instance + relayer → IBC 테스트
