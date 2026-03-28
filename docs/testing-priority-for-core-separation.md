# Core 분리 대비 테스트 구축 우선순위

> `@graz/core` 분리 작업 (`claudedocs/core-layer-separation-plan.md`)의 안전망으로서 테스트를 구축한다.
> Store 전환(`create()` → `createStore()`), action 시그니처 변경, event system 추출 등의 리팩토링에서
> regression을 잡으려면 **반드시 사전에 테스트가 존재해야** 한다.

## 현재 테스트 현황

| 파일 | LOC | 상태 | 실질 동작 |
|------|-----|------|----------|
| `logger.test.ts` | 717 | 동작 | 복제된 TestGrazLogger 클래스를 테스트 (실제 구현체 아님) |
| `createMultiChainAsyncFunction.test.ts` | 149 | **skip** | `describe.skip` + vitest exclude |
| `createMultiChainFunction.test.ts` | 104 | **skip** | `describe.skip` + vitest exclude |
| `multi-chain-consistency.test.ts` | 110 | **skip** | `describe.skip` + vitest exclude |
| Type 테스트 3개 | 196 | 동작 | 타입 레벨 검증만 |
| `cli.test.ts` | 73 | 동작 | CLI 기능만 |
| **합계** | **1,349** | | **실질 동작: logger + type + cli** |

### 테스트가 없는 영역 (core 분리 시 가장 중요한 부분)

- `store/index.ts` — Zustand store 생성, persistence, default values
- `actions/account.ts` — connect, disconnect, reconnect, getOfflineSigners
- `actions/wallet/*` — getWallet factory, checkWallet, 18개 어댑터
- `actions/configure.ts` — configureGraz
- `actions/methods.ts` — sendTokens, executeContract 등
- `actions/chains.ts` — addChain, suggestChain 등
- `hooks/*` — 모든 React hooks
- `provider/events.tsx` — 이벤트 시스템

---

## 우선순위

**P0이 완료되어야 core 분리 작업을 시작할 수 있다.**

### P0: Core 분리의 기반 — Store & Actions (필수 선행)

이 테스트들은 `@graz/core`의 뼈대가 되는 코드를 커버한다.
Store 전환과 action 리팩토링 시 regression 방지의 **유일한 안전망**.

#### P0-1. Store 단위 테스트

**대상**: `store/index.ts` (219 LOC)
**core 분리 관련**: `create()` → `createStore()` 전환의 기준선

테스트 항목:
- `grazInternalDefaultValues` 초기 상태 검증
- `grazSessionDefaultValues` 초기 상태 검증
- `setState()` / `getState()` 동작 (core 전환 후에도 동일해야 함)
- `persist` middleware: localStorage/sessionStorage 직렬화/역직렬화
- `subscribeWithSelector`: selector 기반 구독이 정확히 트리거되는지
- `partialize` 옵션: 영속화 대상 필드만 저장되는지

예상: ~150 LOC, 10-12 test cases

#### P0-2. actions/account.ts 테스트

**대상**: `actions/account.ts` (330 LOC) — 가장 핵심
**core 분리 관련**: store 참조 방식 변경 (`useGrazInternalStore` → `grazInternalStore`)의 기준선

테스트 항목:
- connect: store 상태 전이 (`disconnected` → `connecting` → `connected`)
- connect: accounts, activeChainIds, recentChainIds 업데이트
- connect: wallet.enable(), wallet.getKey() 호출 순서
- connect: WalletConnect 분기 처리
- connect: chainId 미제공 시 recentChainIds fallback
- connect: GrazProvider에 없는 chainId → Error
- disconnect: 전체 disconnect vs 부분 disconnect (chainId 지정)
- disconnect: sessionStorage 정리
- reconnect: _reconnectConnector 기반 재연결
- reconnect: 실패 시 disconnect 호출
- getOfflineSigners: wallet adapter를 통한 signer 생성

mock 대상: `getWallet()`, `checkWallet()`, store
예상: ~300-400 LOC, 15-20 test cases

#### P0-3. actions/wallet/index.ts 테스트

**대상**: `actions/wallet/index.ts` (getWallet factory, checkWallet)
**core 분리 관련**: 그대로 이동하지만 factory 라우팅 동작 검증 필요

테스트 항목:
- `getWallet(WalletType.KEPLR)` → window.keplr 반환
- `getWallet(WalletType.LEAP)` → window.leap 반환
- `checkWallet()` → 지갑 존재 여부 boolean
- `isWalletConnect()`, `isPara()`, `isLeapSnaps()` 헬퍼 검증
- 미지원 WalletType → Error

mock 대상: `window` 객체 (jsdom)
예상: ~150-200 LOC, 10-15 test cases

---

### P1: Skipped 테스트 복구 & Configure

#### P1-1. Vitest `@keplr-wallet/types` SSR 버그 우회

현재 3개 파일이 `describe.skip` + vitest config exclude 상태:
- `createMultiChainAsyncFunction.test.ts` (149 LOC)
- `createMultiChainFunction.test.ts` (104 LOC)
- `multi-chain-consistency.test.ts` (110 LOC)

우회 방안 탐색:
- `vi.mock('@keplr-wallet/types')` 또는 타입만 import하도록 분리
- vitest config에서 `deps.inline` 옵션 활용
- ChainInfo를 자체 테스트용 타입으로 정의

**core 분리 관련**: `createMultiChainAsyncFunction`에 store 파라미터가 추가되므로, 먼저 복구해야 변경 검증 가능

#### P1-2. actions/configure.ts 테스트

**대상**: `actions/configure.ts` (`configureGraz`)
**core 분리 관련**: `createConfig()`로 전환되는 진입점

테스트 항목:
- chains, chainsConfig, walletConnect 등 옵션이 store에 반영되는지
- loggerConfig 초기화
- 중복 호출 시 동작 (idempotent 여부)

---

### P2: 나머지 Actions & Mock 인프라

#### P2-1. CosmJS client mock 유틸리티 작성

```typescript
// __tests__/mocks/cosmjs.ts
export function createMockStargateClient(overrides?) {
  return {
    getBalance: vi.fn().mockResolvedValue({ amount: '1000000', denom: 'uatom' }),
    getAllBalances: vi.fn().mockResolvedValue([]),
    getHeight: vi.fn().mockResolvedValue(12345),
    getBalanceStaked: vi.fn().mockResolvedValue({ amount: '500000', denom: 'uatom' }),
    ...overrides,
  } as unknown as StargateClient;
}

export function createMockSigningClient(overrides?) {
  return {
    ...createMockStargateClient(),
    sendTokens: vi.fn().mockResolvedValue({ code: 0, transactionHash: '0xabc' }),
    signAndBroadcast: vi.fn().mockResolvedValue({ code: 0 }),
    ...overrides,
  } as unknown as SigningStargateClient;
}

export function createMockOfflineSigner(address = 'cosmos1test') {
  return {
    getAccounts: vi.fn().mockResolvedValue([
      { address, algo: 'secp256k1', pubkey: new Uint8Array(33) }
    ]),
    signDirect: vi.fn().mockResolvedValue({ signed: {}, signature: { signature: 'mock' } }),
  } as unknown as OfflineDirectSigner;
}
```

P2 이후 모든 hook/action 테스트에서 재사용.

#### P2-2. actions/methods.ts 테스트

- `sendTokens`, `sendIbcTokens`, `executeContract`, `instantiateContract`
- mock signing client를 주입하여 올바른 파라미터로 호출되는지 검증

#### P2-3. actions/chains.ts 테스트

- `addChain`, `suggestChain`, `suggestChainAndConnect`
- store 업데이트 및 wallet adapter 호출 검증

---

### P3: React Layer 테스트

> P3는 core 분리 후 `@graz/react` 패키지의 안전망.
> Core 분리 자체에는 P0-P2가 충분하지만, React 바인딩 재작성 시 필요.

#### P3-1. Hook 테스트

- `useAccount`, `useConnect`, `useDisconnect` — 상태 머신 검증
- `useStargateClient`, `useCosmWasmClient` — query 동작
- `useBalance`, `useBalances` — query + enabled 조건
- React Testing Library + mocked providers (QueryClientProvider + GrazProvider)
- 예상: ~500-700 LOC

#### P3-2. Provider & Events 테스트

- `GrazProvider`: configureGraz 호출 검증
- `useGrazEvents`: window focus, reconnect, wallet subscription
- React Testing Library + window event simulation
- core 분리 시 EventManager 클래스로 전환할 때의 기준선

---

## 요약

| 우선순위 | 대상 | 예상 LOC | Core 분리 관련성 | 예상 기간 |
|----------|------|---------|-----------------|----------|
| **P0** | Store, actions/account, actions/wallet | 600-750 | **필수 선행** — 분리의 기준선 | 3-4일 |
| **P1** | Skipped 테스트 복구, configure | 100-150 | **강력 권장** — multi-chain 변경 검증 | 1-2일 |
| **P2** | Mock 인프라, actions/methods, actions/chains | 400-500 | 권장 — actions 완전 커버리지 | 2-3일 |
| **P3** | Hooks, Provider, Events | 700-900 | React 바인딩 재작성 시 필요 | 3-4일 |

```
커버리지 추정:
  현재         → ~5% (실질 동작 테스트 기준)
  P0 완료      → ~35%
  P0-P2 완료   → ~60%
  P0-P3 완료   → ~80%
```

### 실행 흐름

```
P0 (Store + Account + Wallet)
  ↓
P1 (Skipped 복구 + Configure)
  ↓
  ══════════════════════════════
  ▶ Core 분리 작업 시작 가능 ◀
  ══════════════════════════════
  ↓
P2 (Mock 인프라 + Methods + Chains)  ← core 분리와 병렬 가능
  ↓
P3 (React Hooks + Provider)          ← @graz/react 재작성 시점에
```

---

*관련 문서:*
- `claudedocs/core-layer-separation-plan.md` — Core 분리 작업 계획
- `docs/testing-strategy.md` — 전체 테스트 전략 (3-Tier: Unit / Simulated / Starship)
