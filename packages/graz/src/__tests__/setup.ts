import { beforeEach, vi } from "vitest";

// Enable store mocking
vi.mock("../store");

// Mock WalletConnect/Para browser deps (not available in jsdom)
vi.mock("../actions/wallet/wallet-connect/index", () => ({}));
vi.mock("../actions/wallet/wallet-connect/keplr", () => ({ getWCKeplr: vi.fn() }));
vi.mock("../actions/wallet/wallet-connect/leap", () => ({ getWCLeap: vi.fn() }));
vi.mock("../actions/wallet/wallet-connect/cosmostation", () => ({ getWCCosmostation: vi.fn() }));
vi.mock("../actions/wallet/wallet-connect/clot", () => ({ getWCClot: vi.fn() }));
vi.mock("../actions/wallet/para", () => ({ getPara: vi.fn() }));

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
});

// Mock window object for browser APIs
global.window = global.window || ({} as any);

// Polyfill window.matchMedia for jsdom (required by @walletconnect/modal)
if (typeof window !== "undefined" && !window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
