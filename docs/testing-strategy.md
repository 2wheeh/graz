# graz 테스트 전략 로드맵

## 현재 상태 (2026-03-28, feat/test-infrastructure)

### 테스트 인프라

| 항목 | 이전 | 현재 |
|------|------|------|
| Framework | Vitest 2.1.9 (SSR 버그) | **Vitest 3.2.4** |
| 테스트 파일 수 | 5 (3 skip) | **13** |
| 테스트 수 | 56 | **143** |
| Hook 테스트 | 없음 | **30개** (clients, account, balance, chains) |
| Signer 모킹 | 없음 | **mockSigner** (real DirectSecp256k1HdWallet) |
| Public test API | 없음 | **graz/test** sub-export |
| 온체인 테스트 | 없음 | **PoC 검증 완료** (simd child process) |

### graz/test Public API

dApp 개발자가 vi.mock 없이 graz hooks를 테스트할 수 있는 공개 API:

```ts
import {
  mockSigner,          // 진짜 signer (DirectSecp256k1HdWallet, UI 없음)
  TestGrazProvider,    // 선언적 상태 설정
  renderHookWithGraz,  // hook 테스트 wrapper
  testChains,          // ChainInfo fixtures
  createMockKey,       // 테스트 계정 생성
  createMockAccounts,  // 멀티체인 계정 생성
  createTestGrazConfig,// 테스트용 config factory
} from "graz/test";
```

### 테스트 레이어

```
Layer 1: Unit (현재 ✅)
  vitest + jsdom + mockSigner + mock clients + vi.mock
  → ~ms, 인프라 불필요, 143 tests passing

Layer 2: On-chain (PoC 검증 ✅, 구현 대기)
  vitest + cosmprool (simd child process) + mockSigner
  → ~5초, Go binary만 필요, mock client 제거 가능

Layer 3: IBC (설계 완료, 구현 대기)
  cosmprool multi-instance + Hermes relayer
  → useSendIbcTokens 등 IBC hook 테스트
```

---

## Phase 1: Unit Test 강화 ✅ 완료

### 수행한 작업

1. **Vitest 2→3 업그레이드**: `__vite_ssr_exportName__` SSR 버그 수정
2. **3개 excluded 테스트 복구**: multi-chain.ts에서 `@keplr-wallet/types` import 제거, generic constraint으로 변경
3. **CosmJS mock infrastructure**: StargateClient, CosmWasmClient, SigningStargateClient, SigningCosmWasmClient mock factories
4. **Hook 테스트 30개**: useStargateClient, useCosmWasmClient, useAccount, useConnect, useDisconnect, useActiveChainIds, useActiveChains, useBalances, useBalance, useBalanceStaked

### 발견한 이슈

- `useBalance`가 zero balance에서 `undefined` 반환 → React Query v5에서 에러 (별도 수정 필요)
- `configureGraz`의 `autoReconnect: false` 로직 버그 수정 (기존 버그)

---

## Phase 2: graz/test Public API ✅ 완료

### 수행한 작업

1. **mockSigner**: `DirectSecp256k1HdWallet` 기반 진짜 서명, 지갑 UI 없음 (wagmi mock connector 대응)
2. **TestGrazProvider**: 선언적 initialState (connected, accounts, activeChainIds)
3. **renderHookWithGraz**: vi.mock 없는 hook 테스트 wrapper
4. **testChains**: cosmosHub, osmosis, juno ChainInfo fixtures
5. **createMockKey/Accounts**: deterministic 테스트 계정
6. **package.json `./test` export** + tsup 빌드 설정

### 설계 결정

- `_walletOverride` 패턴 제거 — production 코드에 테스트 전용 필드 넣지 않음
- `mockSigner`는 독립적으로 동작 (store override 불필요)
- mock client는 unit test 레이어에서만, cosmprool 도입 시 제거 예정

---

## Phase 3: cosmock — On-chain Testing 🔜 다음 단계

### cosmock (`npm: cosmock@0.0.1`)

[cosmock](https://github.com/2wheeh/cosmock) — prool의 Cosmos 버전.
simd/wasmd를 child process로 관리. Docker/K8s 불필요.

```ts
import { Instance } from "cosmock";

const instance = Instance.simd({
  chainId: "test-1",
  accounts: [{ mnemonic: TEST_MNEMONIC, coins: "1000000000stake" }],
});
await instance.start();   // ~3-5초
// instance.port → 26657 (real RPC)
await instance.stop();
```

### PoC 검증 완료

| 검증 항목 | 결과 |
|-----------|------|
| simd child_process spawn | ✅ ~3-5초 startup |
| genesis 계정+잔고 주입 | ✅ |
| StargateClient.connect(localhost) | ✅ |
| mockSigner → sendTokens (real tx) | ✅ code: 0 |
| 수신자 잔고 on-chain 확인 | ✅ |

### graz 적용 계획

cosmock 연동 시 mock client 전부 제거, real on-chain test로 전환.
상세: `docs/cosmprool-integration-plan.md`

| 현재 (mock) | cosmock 후 (real) |
|-------------|-------------------|
| `vi.mock("@cosmjs/stargate")` | **제거** |
| `createMockStargateClient()` | **제거** |
| hook 테스트의 vi.mock (~20줄/파일) | **대폭 축소** |
| `mockSigner` | **유지** (지갑 UI 대체) |
| `TestGrazProvider` | **유지** (상태 선언) |

### graz hooks 인프라 요구사항

| Hook | cosmock 인프라 |
|------|---------------|
| useStargateClient, useCosmWasmClient | `Instance.simd()` 1개 |
| useBalance, useBalances, useSendTokens | `Instance.simd()` 1개 |
| useInstantiateContract, useExecuteContract | `Instance.wasmd()` 1개 |
| **useSendIbcTokens** | **simd 2개 + relayer** (향후) |

**95%의 hooks는 simd 단일 인스턴스로 충분.**

---

## 참고: Starship과의 관계

| | cosmock | Starship |
|---|---|---|
| 포지셔닝 | 개발/테스트 (경량) | 운영 시뮬레이션 (중량) |
| 인프라 | child process | Kubernetes + Docker |
| Startup | 3-5초 | 2-5분 |
| 용도 | unit/integration test | E2E, multi-chain 시뮬레이션 |
| graz 적합성 | **기본 테스트** | 릴리스 전 검증 |

cosmock이 기본, Starship은 필요 시 추가하는 구조.
