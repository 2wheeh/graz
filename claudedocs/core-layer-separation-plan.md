# graz Core Layer Separation Plan

Framework-agnostic core 분리를 위한 기술 분석 및 작업 계획서

---

## 1. Executive Summary

graz를 wagmi처럼 framework-agnostic한 core 레이어(`@graz/core`)와 framework-specific 바인딩(`@graz/react`)으로 분리하는 작업에 대한 분석 문서.

**결론**: 전체 코드의 ~60%가 이미 framework-agnostic하게 작성되어 있어, 구조적 분리는 가능하며 예상 작업량은 **3~4주 (15~19일)**.

---

## 2. 현재 아키텍처 분석

### 2.1 코드베이스 규모

| 디렉토리 | 라인 수 | 비율 | React 의존도 |
|-----------|---------|------|-------------|
| `actions/` | 3,241 | 40.8% | **낮음** - store를 `.getState()`/`.setState()`로 직접 접근 |
| `hooks/` | 1,825 | 23.0% | **높음** - useQuery, useMutation, useEffect, useMemo |
| `utils/` | 1,581 | 19.9% | **부분** - `useChainsFromArgs`만 React hook |
| `types/` | 546 | 6.9% | **없음** |
| `provider/` | 260 | 3.3% | **높음** - React FC, useEffect |
| `store/` | 219 | 2.8% | **중간** - `create()` vs `createStore()` |
| **합계** | **7,945** | 100% | |

### 2.2 패키지 구조

```
packages/graz/          # 단일 패키지 (v0.4.2)
├── src/
│   ├── index.ts        # 메인 barrel export
│   ├── constant.ts
│   ├── store/          # Zustand stores (2개)
│   │   └── index.ts    # useGrazInternalStore, useGrazSessionStore
│   ├── provider/       # React Provider
│   │   ├── index.tsx   # GrazProvider
│   │   ├── events.tsx  # useGrazEvents (reconnect, ping, subscription)
│   │   └── client-only.tsx
│   ├── actions/        # Core 로직 (framework-agnostic)
│   │   ├── account.ts  # connect, disconnect, reconnect, getOfflineSigners
│   │   ├── chains.ts   # addChain, suggestChain, suggestChainAndConnect
│   │   ├── configure.ts # configureGraz
│   │   ├── methods.ts  # sendTokens, executeContract, instantiateContract 등
│   │   └── wallet/     # 18개 지갑 어댑터
│   │       ├── index.ts        # getWallet factory, checkWallet
│   │       ├── keplr.ts
│   │       ├── leap.ts
│   │       ├── cosmostation.ts
│   │       ├── para.ts
│   │       ├── wallet-connect/  # WC 4종
│   │       ├── leap-metamask-snap/
│   │       ├── cosmos-metamask-snap/
│   │       └── ... (10+ 어댑터)
│   ├── hooks/          # React Hooks
│   │   ├── account.ts  # useAccount, useConnect, useDisconnect, useBalances 등
│   │   ├── clients.ts  # useStargateClient, useCosmWasmClient
│   │   ├── signingClients.ts  # useStargateSigningClient, useCosmWasmSigningClient
│   │   ├── methods.ts  # useSendTokens, useExecuteContract 등
│   │   ├── chains.ts   # useActiveChains, useChainInfo, useSuggestChain 등
│   │   └── wallet.ts   # useActiveWalletType, useCheckWallet
│   ├── types/
│   │   ├── wallet.ts   # WalletType enum, Wallet interface, Key
│   │   ├── core.ts     # Dictionary, Maybe 등
│   │   ├── hooks.ts    # ChainIdToRecord, MutationEventArgs, QueryConfig
│   │   ├── logger.ts
│   │   ├── para.ts
│   │   └── tendermint.ts
│   ├── utils/
│   │   ├── multi-chain.ts  # createMultiChainAsyncFunction, useChainsFromArgs
│   │   ├── logger.ts
│   │   ├── conversion.ts
│   │   ├── isEmpty.ts
│   │   ├── os.ts
│   │   └── timeout.ts
│   └── chains/         # Chain definitions
└── package.json
```

### 2.3 의존성 맵

```
React-specific:
  - react >=17 (peer)
  - @tanstack/react-query >=5.0.0 (peer)
  - zustand 5.0.4 (create() = React hook 형태)

Framework-agnostic:
  - @cosmjs/proto-signing >=0.32.4
  - @cosmjs/stargate >=0.32.4
  - @cosmjs/cosmwasm-stargate >=0.32.4
  - @cosmjs/amino >=0.32.4
  - @cosmjs/encoding >=0.32.4
  - @keplr-wallet/types 0.12.156
  - @walletconnect/sign-client 2.20.2
  - @walletconnect/modal 2.7.0
  - p-map (concurrency control)
  - long (64-bit integer)
```

### 2.4 State Management 상세 분석

#### Internal Store (localStorage 영속화)
```typescript
// store/index.ts - create() 사용 (React hook 형태)
useGrazInternalStore = create(
  subscribeWithSelector(persist(() => ({
    chains: ChainInfo[] | null,
    chainsConfig: Record<string, ChainConfig> | null,
    walletType: WalletType,
    walletConnect: WalletConnectStore | null,
    multiChainFetchConcurrency: number,  // default: 3
    pingInterval: number,                // default: 3600000 (1hr)
    loggerConfig: { enabled, level, categories } | null,
    recentChainIds: string[] | null,
    _reconnect: boolean,
    _reconnectConnector: WalletType | null,
    _notFoundFn: () => void,
    _onReconnectFailed: () => void,
  }), persistOptions))
);
```

#### Session Store (sessionStorage 영속화)
```typescript
useGrazSessionStore = create(
  subscribeWithSelector(persist(() => ({
    accounts: Record<string, Key> | null,
    activeChainIds: string[] | null,
    status: "connected" | "connecting" | "reconnecting" | "disconnected",
    lastPing: number | null,
    wcSignClients: Map<WalletType, ISignClient>,  // 비영속
    paraConnector: ParaGrazConnector | null,       // 비영속
  }), sessionOptions))
);
```

**핵심 관찰**: Actions 레이어에서 이미 `useGrazInternalStore.getState()`와 `useGrazSessionStore.setState()`를 직접 호출하여 store에 접근. 이는 React 외부에서도 동작하는 패턴이지만, `create()` 대신 `createStore()`를 사용하면 더 명확한 vanilla 패턴이 됨.

---

## 3. React 커플링 상세 분석

### 3.1 이미 Framework-Agnostic한 코드 (~60%)

#### actions/account.ts (330 lines) - 그대로 이동 가능
```typescript
// connect(), disconnect(), reconnect(), getOfflineSigners()
// 모두 plain async 함수. store는 .getState()/.setState()로 접근
export const connect = async (args?: ConnectArgs): Promise<ConnectResult> => {
  const { chains, walletType } = useGrazInternalStore.getState();
  // ... wallet.enable(), wallet.getKey() 등
  useGrazSessionStore.setState({ accounts, status: "connected" });
  return { accounts, walletType, chains };
};
```

#### actions/wallet/* (18개 어댑터) - 완전 framework-agnostic
```typescript
// 각 어댑터는 window 객체에서 지갑 인스턴스를 가져오는 순수 함수
export const getKeplr = (): Wallet => window.keplr;
export const getLeap = (): Wallet => window.leap;
// getWallet(type) factory도 순수 switch문
```

#### actions/methods.ts - 완전 framework-agnostic
```typescript
// sendTokens, sendIbcTokens, executeContract, instantiateContract 등
// 모두 CosmJS 클라이언트를 인자로 받는 순수 함수
```

#### actions/chains.ts, actions/configure.ts - 거의 그대로

#### utils/ (logger, conversion, isEmpty, os, timeout) - 완전 framework-agnostic

#### types/ 전체 - 완전 framework-agnostic

#### chains/ - 완전 framework-agnostic

### 3.2 분리가 필요한 React 커플링 지점

#### 지점 1: Store 생성 방식
```typescript
// 현재: create() = React hook 겸 store
export const useGrazInternalStore = create(subscribeWithSelector(persist(...)));

// 변경 필요: createStore() = vanilla store
import { createStore } from 'zustand/vanilla';
export const grazInternalStore = createStore(subscribeWithSelector(persist(...)));

// React 바인딩에서:
import { useStore } from 'zustand';
export const useGrazInternalStore = (selector) => useStore(grazInternalStore, selector);
```

**영향 범위**: actions에서 `.getState()`/`.setState()` 호출은 그대로 동작. hooks에서 `useGrazInternalStore((x) => x.walletType)` 형태는 `useStore(store, selector)`로 변경 필요.

#### 지점 2: `useChainsFromArgs` (utils/multi-chain.ts:27-38)
```typescript
// 현재: React hook (store를 hook으로 읽음)
export const useChainsFromArgs = ({ chainId }) => {
  const chains = useGrazInternalStore((x) => x.chains);  // ← React hook 호출
  if (!chains) throw new Error("No chains found");
  // ...
};

// 필요: core용 순수 함수 버전 추가
export const getChainsFromArgs = ({ chainId }, store) => {
  const chains = store.getState().chains;
  // ...
};
```

**영향 범위**: 모든 hooks에서 `useChainsFromArgs` 사용 중 (6개 hooks 파일 전부).

#### 지점 3: Event System (provider/events.tsx, 197 lines)
```typescript
// 현재: React useEffect 기반
useEffect(() => {
  window.addEventListener("focus", handleFocus);      // 윈도우 포커스 → ping
  return () => window.removeEventListener("focus", handleFocus);
}, [...]);

useEffect(() => {
  getKeplr().subscription?.(() => reconnect());        // 지갑 이벤트 구독
  // ... 10개 지갑 각각의 subscription
}, [_reconnectConnector, ...]);

useEffect(() => {
  // reconnect on refresh (session 복원)
  if (isSessionActive && _reconnectConnector) reconnect();
}, [isReconnectConnectorReady]);

useEffect(() => {
  // iframe auto-connect
  cosmiframe.isReady().then(ready => connect(...));
}, [iframeOptions]);
```

**변환 방향**: Framework-agnostic event manager 클래스로 추출
```typescript
// @graz/core
class GrazEventManager {
  private listeners: (() => void)[] = [];

  start(store, config) {
    this.setupFocusPing(store, config);
    this.setupWalletSubscription(store, config);
    this.setupAutoReconnect(store, config);
  }

  destroy() {
    this.listeners.forEach(unsub => unsub());
  }
}
```

#### 지점 4: Hooks → Core Query/Mutation Options 패턴
```typescript
// 현재: hooks/clients.ts
export function useStargateClient(args) {
  const chains = useChainsFromArgs({ chainId: args?.chainId });
  return useQuery({
    queryKey: ["USE_STARGATE_CLIENT", chains],
    queryFn: async () => { /* StargateClient.connect() */ },
    enabled: Boolean(chains) && chains.length > 0,
  });
}

// wagmi 패턴으로 변환:
// @graz/core
export function stargateClientQueryOptions(config, args) {
  const chains = getChainsFromStore(config.store, args?.chainId);
  return {
    queryKey: ["USE_STARGATE_CLIENT", chains],
    queryFn: async () => { /* StargateClient.connect() */ },
    enabled: Boolean(chains) && chains.length > 0,
  };
}

// @graz/react
export function useStargateClient(args) {
  const config = useGrazConfig();  // React context에서 config 가져옴
  return useQuery(stargateClientQueryOptions(config, args));
}
```

#### 지점 5: Provider → createConfig 패턴
```typescript
// 현재: provider/index.tsx
export const GrazProvider: FC<GrazProviderProps> = ({ children, grazOptions }) => {
  useEffect(() => { configureGraz(grazOptions); }, [grazOptions]);
  return <ClientOnly>{children}<GrazEvents /></ClientOnly>;
};

// wagmi 패턴으로 변환:
// @graz/core
export function createConfig(options: GrazConfig) {
  const internalStore = createStore(...);
  const sessionStore = createStore(...);
  configureGraz(options, internalStore);
  const eventManager = new GrazEventManager();
  return { internalStore, sessionStore, eventManager, ...options };
}

// @graz/react
const GrazContext = createContext<GrazConfig | null>(null);

export const GrazProvider: FC = ({ config, children }) => {
  useEffect(() => { config.eventManager.start(); }, []);
  return (
    <GrazContext.Provider value={config}>
      <QueryClientProvider client={config.queryClient}>
        {children}
      </QueryClientProvider>
    </GrazContext.Provider>
  );
};
```

---

## 4. 목표 아키텍처

### 4.1 패키지 구조

```
packages/
├── core/                          # @graz/core (NEW)
│   ├── src/
│   │   ├── index.ts               # barrel export
│   │   ├── config.ts              # createConfig()
│   │   ├── store.ts               # vanilla Zustand stores
│   │   ├── events.ts              # GrazEventManager (NEW)
│   │   ├── constant.ts            # 기존 그대로
│   │   ├── actions/               # 기존 그대로 (store 참조만 변경)
│   │   │   ├── account.ts
│   │   │   ├── chains.ts
│   │   │   ├── configure.ts
│   │   │   ├── methods.ts
│   │   │   └── wallet/            # 18개 어댑터 그대로
│   │   ├── query/                 # queryOptions 패턴 (NEW)
│   │   │   ├── stargateClient.ts
│   │   │   ├── cosmwasmClient.ts
│   │   │   ├── signingClients.ts
│   │   │   ├── balance.ts
│   │   │   └── offlineSigners.ts
│   │   ├── types/                 # 기존 그대로 (hooks.ts 타입 분리)
│   │   ├── utils/                 # useChainsFromArgs → getChainsFromStore
│   │   └── chains/                # 기존 그대로
│   ├── package.json
│   └── tsup.config.ts
│
├── react/                         # @graz/react (NEW)
│   ├── src/
│   │   ├── index.ts               # barrel export
│   │   ├── context.ts             # GrazContext, useGrazConfig
│   │   ├── provider.tsx           # GrazProvider (간소화)
│   │   ├── hooks/
│   │   │   ├── account.ts         # useAccount, useConnect 등
│   │   │   ├── clients.ts         # useStargateClient 등
│   │   │   ├── signingClients.ts
│   │   │   ├── methods.ts
│   │   │   ├── chains.ts
│   │   │   └── wallet.ts
│   │   └── types/                 # React-specific 타입
│   ├── package.json
│   └── tsup.config.ts
│
└── graz/                          # graz (기존 패키지, 호환성 래퍼)
    ├── src/
    │   └── index.ts               # re-export @graz/core + @graz/react
    └── package.json
```

### 4.2 의존성 구조

```
@graz/core
├── @cosmjs/proto-signing
├── @cosmjs/stargate
├── @cosmjs/cosmwasm-stargate
├── @cosmjs/amino
├── @cosmjs/encoding
├── @keplr-wallet/types
├── @walletconnect/sign-client
├── @walletconnect/modal
├── zustand (vanilla만 사용)
├── p-map
└── long

@graz/react
├── @graz/core (peer)
├── react (peer)
├── @tanstack/react-query (peer)
└── zustand (useStore만 사용)

graz (호환성 래퍼)
├── @graz/core
└── @graz/react
```

### 4.3 API 설계

#### @graz/core API
```typescript
// Config
export { createConfig, type GrazConfig } from './config';

// Actions (framework-agnostic)
export { connect, disconnect, reconnect, getOfflineSigners } from './actions/account';
export { addChain, suggestChain, suggestChainAndConnect } from './actions/chains';
export { configureGraz } from './actions/configure';
export { sendTokens, sendIbcTokens, executeContract, instantiateContract } from './actions/methods';

// Query Options (for TanStack Query integration)
export { stargateClientQueryOptions } from './query/stargateClient';
export { cosmwasmClientQueryOptions } from './query/cosmwasmClient';
export { stargateSigningClientQueryOptions, cosmwasmSigningClientQueryOptions } from './query/signingClients';
export { balancesQueryOptions, balanceQueryOptions, balanceStakedQueryOptions } from './query/balance';
export { offlineSignersQueryOptions } from './query/offlineSigners';

// Wallet adapters
export { getWallet, checkWallet } from './actions/wallet';
export { WalletType } from './types/wallet';

// Store (vanilla)
export { grazInternalStore, grazSessionStore } from './store';

// Events
export { GrazEventManager } from './events';

// Types
export type { Key, Wallet, ConnectArgs, ConnectResult, OfflineSigners, ... };

// Chains
export { mainnetChains, testnetChains } from './chains';

// Utils
export { createMultiChainAsyncFunction, createMultiChainFunction } from './utils/multi-chain';
```

#### @graz/react API (기존 API 유지)
```typescript
// Provider
export { GrazProvider } from './provider';

// Hooks (기존과 동일한 API surface)
export { useAccount, useConnect, useDisconnect, useOfflineSigners } from './hooks/account';
export { useBalances, useBalance, useBalanceStaked } from './hooks/account';
export { useStargateClient, useCosmWasmClient } from './hooks/clients';
export { useStargateSigningClient, useCosmWasmSigningClient } from './hooks/signingClients';
export { useSendTokens, useSendIbcTokens, useExecuteContract, useInstantiateContract } from './hooks/methods';
export { useQuerySmart, useQueryRaw } from './hooks/methods';
export { useActiveChains, useActiveChainIds, useChainInfo, useChainInfos } from './hooks/chains';
export { useSuggestChain, useSuggestChainAndConnect, useAddChain } from './hooks/chains';
export { useActiveWalletType, useCheckWallet } from './hooks/wallet';

// Context
export { useGrazConfig } from './context';
```

---

## 5. 작업 상세 계획

### Phase 1: @graz/core 패키지 생성 (6~8일)

#### Task 1.1: 패키지 인프라 (1일)
- [ ] `packages/core/` 디렉토리 생성
- [ ] `package.json` 작성 (`@graz/core`)
- [ ] `tsup.config.ts` 설정 (CJS/ESM dual build)
- [ ] `pnpm-workspace.yaml` 업데이트
- [ ] `turbo.json` 빌드 파이프라인 추가

#### Task 1.2: Store Vanilla 전환 (2~3일)
현재 `create()` → `createStore()` (zustand/vanilla)

```typescript
// 변경 전 (store/index.ts)
import { create } from "zustand";
export const useGrazInternalStore = create(
  subscribeWithSelector(persist(() => grazInternalDefaultValues, persistOptions))
);

// 변경 후 (@graz/core/store.ts)
import { createStore } from "zustand/vanilla";
export const grazInternalStore = createStore(
  subscribeWithSelector(persist(() => grazInternalDefaultValues, persistOptions))
);

// 영향받는 파일: actions/ 전체에서 호출 패턴 변경
// 변경 전: useGrazInternalStore.getState()
// 변경 후: grazInternalStore.getState()
// (동일한 API이므로 rename 수준)
```

**세부 작업:**
- `store/index.ts`: `create()` → `createStore()`, export 이름 변경
- `actions/account.ts`: store import 경로 변경 (13개소)
- `actions/chains.ts`: store import 경로 변경
- `actions/configure.ts`: store import 경로 변경
- `actions/methods.ts`: store import 경로 변경
- `actions/wallet/index.ts`: store import 경로 변경
- `actions/wallet/para.ts`: store import 경로 변경
- `actions/wallet/wallet-connect/index.ts`: store import 경로 변경
- `utils/multi-chain.ts`: store import 경로 변경

#### Task 1.3: createConfig() 도입 (2일)
wagmi의 `createConfig()` 패턴 적용.

```typescript
// @graz/core/config.ts
import { createStore } from 'zustand/vanilla';

export interface GrazConfig {
  chains: ChainInfo[];
  chainsConfig?: Record<string, ChainConfig>;
  walletType?: WalletType;
  walletConnect?: WalletConnectStore;
  walletDefaultOptions?: Keplr["defaultOptions"];
  multiChainFetchConcurrency?: number;
  pingInterval?: number;
  loggerConfig?: LoggerConfig;
  iframeOptions?: IframeOptions;
  paraConfig?: ParaGrazConfig;
  autoReconnect?: boolean;
  onReconnectFailed?: () => void;
  onNotFound?: () => void;
}

export function createConfig(options: GrazConfig): GrazConfigResult {
  const internalStore = createStore(
    subscribeWithSelector(persist(() => ({
      ...grazInternalDefaultValues,
      chains: options.chains,
      chainsConfig: options.chainsConfig ?? null,
      // ... 나머지 options 매핑
    }), persistOptions))
  );

  const sessionStore = createStore(
    subscribeWithSelector(persist(() => grazSessionDefaultValues, sessionOptions))
  );

  const eventManager = new GrazEventManager(internalStore, sessionStore);

  return {
    internalStore,
    sessionStore,
    eventManager,
    // action 바인딩
    connect: (args) => connect(args, internalStore, sessionStore),
    disconnect: (args) => disconnect(args, internalStore, sessionStore),
    reconnect: (args) => reconnect(args, internalStore, sessionStore),
    getOfflineSigners: (args) => getOfflineSigners(args, internalStore),
  };
}
```

**설계 결정**: Actions에 store를 주입할지 vs 글로벌 store를 유지할지

- **Option A (Store 주입)**: 각 action 함수에 store를 파라미터로 전달. 테스트 용이, 멀티 인스턴스 지원. 하지만 모든 action 시그니처 변경 필요.
- **Option B (글로벌 store + Config 객체)**: config에서 생성한 store를 모듈 레벨 변수에 설정. 기존 action 시그니처 유지. wagmi가 이 방식 사용.
- **추천: Option B** - 기존 코드 변경 최소화, wagmi와 동일한 패턴.

```typescript
// @graz/core/config.ts
let currentConfig: GrazConfigResult | null = null;

export function createConfig(options: GrazConfig): GrazConfigResult {
  // ... store 생성
  currentConfig = { internalStore, sessionStore, eventManager };
  return currentConfig;
}

export function getConfig(): GrazConfigResult {
  if (!currentConfig) throw new Error("graz not configured. Call createConfig() first.");
  return currentConfig;
}

// actions에서:
import { getConfig } from '../config';
export const connect = async (args?: ConnectArgs) => {
  const { internalStore, sessionStore } = getConfig();
  const { chains, walletType } = internalStore.getState();
  // ... 기존 로직 그대로
};
```

#### Task 1.4: Event System 추출 (2일)
`provider/events.tsx`의 4개 `useEffect`를 framework-agnostic 클래스로 변환.

```typescript
// @graz/core/events.ts
export class GrazEventManager {
  private cleanups: (() => void)[] = [];
  private started = false;

  constructor(
    private internalStore: StoreApi<GrazInternalStore>,
    private sessionStore: StoreApi<GrazSessionStore>,
  ) {}

  start(): void {
    if (this.started) return;
    this.started = true;
    this.setupFocusPing();
    this.setupAutoReconnect();
    this.setupWalletSubscriptions();
    this.setupIframeAutoConnect();
  }

  destroy(): void {
    this.cleanups.forEach(fn => fn());
    this.cleanups = [];
    this.started = false;
  }

  // 1. Window focus → wallet ping
  private setupFocusPing(): void {
    const handleFocus = async () => {
      const { _reconnectConnector, pingInterval } = this.internalStore.getState();
      const { activeChainIds, lastPing } = this.sessionStore.getState();
      if (!_reconnectConnector || !activeChainIds?.[0]) return;
      if (lastPing && Date.now() - lastPing < pingInterval) return;

      try {
        const wallet = getWallet(_reconnectConnector);
        await wallet.getKey(activeChainIds[0]);
        this.sessionStore.setState({ lastPing: Date.now() });
      } catch {
        void reconnect({ onError: this.internalStore.getState()._onReconnectFailed });
      }
    };
    window.addEventListener("focus", handleFocus);
    this.cleanups.push(() => window.removeEventListener("focus", handleFocus));
  }

  // 2. Auto-reconnect on page load
  private setupAutoReconnect(): void {
    const unsub = this.internalStore.subscribe(
      // ... _reconnectConnector 변화 감지 시 reconnect
    );
    this.cleanups.push(unsub);
  }

  // 3. Wallet keystorechange 구독 (10개 지갑)
  private setupWalletSubscriptions(): void {
    const unsub = this.internalStore.subscribe(
      (state) => state._reconnectConnector,
      (connector) => {
        if (!connector) return;
        const wallet = getWallet(connector);
        wallet.subscription?.(() => {
          void reconnect({ onError: this.internalStore.getState()._onReconnectFailed });
        });
      }
    );
    this.cleanups.push(unsub);
  }

  // 4. Iframe auto-connect
  private setupIframeAutoConnect(): void { /* ... */ }
}
```

#### Task 1.5: Multi-chain Utils 분리 (0.5일)

```typescript
// utils/multi-chain.ts에서 useChainsFromArgs를 core 순수 함수로:
export const getChainsFromStore = (
  store: StoreApi<GrazInternalStore>,
  chainId?: string[]
): ChainInfo[] => {
  const chains = store.getState().chains;
  if (!chains) throw new Error("No chains configured");
  if (chainId?.length) {
    return chainId.map(id => chains.find(c => c.chainId === id)!).filter(Boolean);
  }
  return chains;
};

// createMultiChainAsyncFunction은 이미 .getState()로 접근하므로
// store 파라미터 추가만 하면 됨
```

#### Task 1.6: Query Options 패턴 도입 (1일)

```typescript
// @graz/core/query/stargateClient.ts
import type { QueryOptions } from '@tanstack/query-core';

export function stargateClientQueryOptions(
  config: GrazConfigResult,
  args?: { chainId?: string[] }
): QueryOptions {
  const chains = getChainsFromStore(config.internalStore, args?.chainId);
  return {
    queryKey: ["USE_STARGATE_CLIENT", chains.map(c => c.chainId)],
    queryFn: async () => {
      return createMultiChainAsyncFunction(
        chains,
        async (chain) => {
          const chainConfig = config.internalStore.getState().chainsConfig?.[chain.chainId];
          const endpoint = { url: chain.rpc, headers: chainConfig?.rpcHeaders || {} };
          return StargateClient.connect(endpoint);
        },
        config.internalStore.getState().multiChainFetchConcurrency,
      );
    },
    enabled: chains.length > 0,
  };
}
```

**query options로 변환할 hooks 목록 (8개):**

| 현재 Hook | Core queryOptions |
|-----------|-------------------|
| `useStargateClient` | `stargateClientQueryOptions` |
| `useCosmWasmClient` | `cosmwasmClientQueryOptions` |
| `useStargateSigningClient` | `stargateSigningClientQueryOptions` |
| `useCosmWasmSigningClient` | `cosmwasmSigningClientQueryOptions` |
| `useBalances` | `balancesQueryOptions` |
| `useBalance` | `balanceQueryOptions` |
| `useBalanceStaked` | `balanceStakedQueryOptions` |
| `useOfflineSigners` | `offlineSignersQueryOptions` |

**mutation options로 변환할 hooks 목록 (7개):**

| 현재 Hook | Core mutationOptions |
|-----------|---------------------|
| `useConnect` | `connectMutationOptions` |
| `useDisconnect` | `disconnectMutationOptions` |
| `useSendTokens` | `sendTokensMutationOptions` |
| `useSendIbcTokens` | `sendIbcTokensMutationOptions` |
| `useInstantiateContract` | `instantiateContractMutationOptions` |
| `useExecuteContract` | `executeContractMutationOptions` |
| `useSuggestChain` | `suggestChainMutationOptions` |

### Phase 2: @graz/react 패키지 재구성 (6~7일)

#### Task 2.1: Context & Provider (1일)
```typescript
// @graz/react/context.ts
import { createContext, useContext } from 'react';
import type { GrazConfigResult } from '@graz/core';

const GrazContext = createContext<GrazConfigResult | null>(null);

export const useGrazConfig = () => {
  const config = useContext(GrazContext);
  if (!config) throw new Error("useGrazConfig must be used within GrazProvider");
  return config;
};

// @graz/react/provider.tsx
export const GrazProvider: FC<{ config: GrazConfigResult; children: ReactNode }> = ({
  config,
  children,
}) => {
  useEffect(() => {
    config.eventManager.start();
    return () => config.eventManager.destroy();
  }, [config]);

  return <GrazContext.Provider value={config}>{children}</GrazContext.Provider>;
};
```

#### Task 2.2: Hooks 재작성 (3~4일)
각 hook을 core의 queryOptions/mutationOptions 위에 얇은 래퍼로 변환.

```typescript
// @graz/react/hooks/clients.ts
import { useQuery } from '@tanstack/react-query';
import { stargateClientQueryOptions } from '@graz/core';
import { useGrazConfig } from '../context';

export function useStargateClient(args?) {
  const config = useGrazConfig();
  return useQuery(stargateClientQueryOptions(config, args));
}
```

**각 hook 파일별 작업량 추정:**

| 파일 | Hooks 수 | 난이도 | 예상 |
|------|----------|--------|------|
| `hooks/account.ts` | 7 (useAccount, useConnect, useDisconnect, useBalances, useBalance, useBalanceStaked, useOfflineSigners) | 높음 - useAccount의 subscribe 로직 | 1.5일 |
| `hooks/clients.ts` | 2 (useStargateClient, useCosmWasmClient) | 낮음 | 0.25일 |
| `hooks/signingClients.ts` | 2 (useStargateSigningClient, useCosmWasmSigningClient) | 중간 | 0.5일 |
| `hooks/methods.ts` | 6 (useSendTokens, useSendIbcTokens, useInstantiateContract, useExecuteContract, useQuerySmart, useQueryRaw) | 낮음 - 단순 mutation 래퍼 | 0.5일 |
| `hooks/chains.ts` | 9 (useActiveChainIds, useActiveChains, useChainInfo, useChainInfos, useActiveChainCurrency, useQueryClientValidators, useRecentChainIds, useRecentChains, useAddChain, useSuggestChain, useSuggestChainAndConnect) | 중간 | 0.75일 |
| `hooks/wallet.ts` | 2 (useActiveWalletType, useCheckWallet) | 낮음 | 0.25일 |

#### Task 2.3: Store Hook 래퍼 (0.5일)
```typescript
// @graz/react/store.ts
import { useStore } from 'zustand';
import { grazInternalStore, grazSessionStore } from '@graz/core';

// 하위 호환성을 위해 기존 이름 유지
export const useGrazInternalStore = <T>(selector: (s: GrazInternalStore) => T) =>
  useStore(grazInternalStore, selector);
export const useGrazSessionStore = <T>(selector: (s: GrazSessionStore) => T) =>
  useStore(grazSessionStore, selector);
```

#### Task 2.4: 타입 분리 (0.5일)
- `types/hooks.ts`의 React-specific 타입을 `@graz/react`로 이동
  - `UseMultiChainQueryResult` (UseQueryResult 기반)
  - `MutationEventArgs`
  - `QueryConfig`
  - `ChainIdToRecord` (core에도 필요)
- Core 타입은 `@graz/core/types/`에 유지

### Phase 3: 하위 호환성 래퍼 (2일)

#### Task 3.1: graz 패키지를 re-export 래퍼로 전환

```typescript
// packages/graz/src/index.ts
// Core re-exports
export {
  connect, disconnect, reconnect, getOfflineSigners,
  addChain, suggestChain, suggestChainAndConnect,
  configureGraz, createConfig,
  sendTokens, sendIbcTokens, executeContract, instantiateContract,
  getWallet, checkWallet,
  WalletType,
  mainnetChains, testnetChains,
  // ... 모든 core exports
} from '@graz/core';

// React re-exports
export {
  GrazProvider,
  useAccount, useConnect, useDisconnect,
  useStargateClient, useCosmWasmClient,
  // ... 모든 react exports
} from '@graz/react';
```

#### Task 3.2: GrazProvider 하위 호환성
기존 `grazOptions` prop을 내부에서 `createConfig()`로 변환하는 호환 레이어.

```typescript
// @graz/react (또는 graz 호환 래퍼)
export const GrazProviderCompat: FC<{ grazOptions: ConfigureGrazArgs; children: ReactNode }> = ({
  grazOptions,
  children,
}) => {
  const config = useMemo(() => createConfig(grazOptions), [grazOptions]);
  return <GrazProvider config={config}>{children}</GrazProvider>;
};
```

### Phase 4: 테스트 & 마이그레이션 (2~3일)

#### Task 4.1: Core 테스트 (1일)
- Store vanilla 동작 테스트
- Actions 단위 테스트 (connect, disconnect, reconnect)
- EventManager 테스트
- Query options 생성 테스트

#### Task 4.2: React 통합 테스트 (1일)
- 기존 hook 동작 호환성 테스트
- Provider 테스트
- Example 앱 마이그레이션 (`example/vite`, `example/playground`)

#### Task 4.3: 빌드 검증 (0.5일)
- 각 패키지 독립 빌드 확인
- Tree-shaking 동작 확인
- CJS/ESM dual export 확인
- 번들 사이즈 비교

---

## 6. 작업량 요약

| Phase | 작업 내용 | 예상 기간 |
|-------|----------|----------|
| **Phase 1** | @graz/core 추출 | **6~8일** |
| 1.1 | 패키지 인프라 | 1일 |
| 1.2 | Store vanilla 전환 | 2~3일 |
| 1.3 | createConfig() 도입 | 2일 |
| 1.4 | Event system 추출 | 2일 |
| 1.5 | Multi-chain utils 분리 | 0.5일 |
| 1.6 | Query options 패턴 | 1일 |
| **Phase 2** | @graz/react 재구성 | **6~7일** |
| 2.1 | Context & Provider | 1일 |
| 2.2 | Hooks 재작성 | 3~4일 |
| 2.3 | Store hook 래퍼 | 0.5일 |
| 2.4 | 타입 분리 | 0.5일 |
| **Phase 3** | 하위 호환성 래퍼 | **2일** |
| **Phase 4** | 테스트 & 마이그레이션 | **2~3일** |
| **합계** | | **15~19일 (3~4주)** |

---

## 7. 리스크 & 고려사항

### 7.1 주요 리스크

| 리스크 | 영향 | 완화 방안 |
|--------|------|----------|
| Store 전환 시 persist 동작 변경 | localStorage/sessionStorage 호환성 깨짐 | persist version 유지, migration 함수 작성 |
| useAccount의 subscribe 패턴 복잡성 | 기존 onConnect/onDisconnect 콜백 동작 변경 | Core에서 EventEmitter 패턴으로 대체 |
| TanStack Query 의존성 방향 | @graz/core가 @tanstack/query-core에 의존해야 할 수도 | queryOptions 반환 타입을 plain object로 유지, 실제 Query 타입은 사용하지 않음 |
| SSR 호환성 (ClientOnly 컴포넌트) | window 참조하는 코드가 SSR에서 에러 | typeof window 체크를 core에서 통일 |
| 번들 사이즈 증가 | 패키지 분리로 인한 중복 | 공통 의존성을 peer로 관리 |

### 7.2 Breaking Changes

**@graz/core 사용자 (새로운 API):**
- `createConfig()` 필수
- Store 접근 방식 변경 (`useGrazInternalStore` → `grazInternalStore`)

**기존 graz 사용자:**
- `GrazProvider`의 API 변경 가능성 (grazOptions → config)
- 호환 래퍼로 최소화 가능하지만, 마이그레이션 가이드 필요

### 7.3 wagmi와의 비교

| 항목 | wagmi | graz (현재) | graz (목표) |
|------|-------|------------|------------|
| Core 패키지 | `@wagmi/core` | 없음 | `@graz/core` |
| React 패키지 | `wagmi` | `graz` (all-in-one) | `@graz/react` |
| Config 패턴 | `createConfig()` | `configureGraz()` (side-effect) | `createConfig()` |
| Store | Vanilla Zustand | React Zustand | Vanilla Zustand |
| Query 패턴 | `queryOptions()` 함수 | Hook 내부에 inline | `queryOptions()` 함수 |
| Event System | EventEmitter 클래스 | React useEffect | EventManager 클래스 |
| Vue 지원 | `@wagmi/vue` | 없음 | `@graz/vue` (미래) |
| Svelte 지원 | Community | 없음 | `@graz/svelte` (미래) |

---

## 8. 미래 확장 가능성

### @graz/vue (Phase 5, 미래)
```typescript
// core의 queryOptions를 Vue의 useQuery로 래핑
import { useQuery } from '@tanstack/vue-query';
import { stargateClientQueryOptions } from '@graz/core';

export function useStargateClient(args?) {
  const config = inject(GrazConfigKey);
  return useQuery(stargateClientQueryOptions(config, args));
}
```

### @graz/svelte (Phase 5, 미래)
```typescript
// core의 queryOptions를 Svelte의 createQuery로 래핑
import { createQuery } from '@tanstack/svelte-query';
import { stargateClientQueryOptions } from '@graz/core';

export function createStargateClient(args?) {
  const config = getContext('graz');
  return createQuery(stargateClientQueryOptions(config, args));
}
```

### Vanilla JS 사용
```typescript
// Framework 없이 직접 사용
import { createConfig, connect, disconnect } from '@graz/core';

const config = createConfig({
  chains: [cosmoshub],
});

config.eventManager.start();

// Store 구독 (vanilla)
config.sessionStore.subscribe((state) => {
  console.log('Status:', state.status);
  console.log('Accounts:', state.accounts);
});

// 직접 action 호출
await connect({ chainId: ["cosmoshub-4"], walletType: WalletType.KEPLR });
```

---

## 9. 권장 실행 순서

1. **Phase 1.1 + 1.2 (패키지 인프라 + Store 전환)** - 가장 기초적인 변경. 나머지 모든 작업의 기반.
2. **Phase 1.3 (createConfig)** - config 패턴이 확립되어야 actions과 query options 설계 가능.
3. **Phase 1.4 (Event System)** - Provider 의존성 제거.
4. **Phase 1.5 + 1.6 (Utils + Query Options)** - Core API 완성.
5. **Phase 2 (React 재구성)** - Core가 안정화된 후 React 래퍼 작성.
6. **Phase 3 (하위 호환성)** - 기존 사용자 마이그레이션 경로 제공.
7. **Phase 4 (테스트)** - 전체 통합 테스트.

각 Phase 완료 시점에 독립적으로 동작 가능하도록 설계. Phase 1 완료 시 `@graz/core`는 단독 사용 가능하며, Phase 2 완료 시 기존 React 사용자도 마이그레이션 가능.

---

*작성일: 2026-03-28*
*분석 대상: graz v0.4.2 (branch: dev, commit: ef5af86)*
