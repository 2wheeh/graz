import type { ChainInfo } from "@keplr-wallet/types";

/**
 * Pre-configured test chain fixtures compatible with ChainInfo.
 * Use these in your test setup to avoid creating chain configs from scratch.
 */
export const testChains = {
  cosmosHub: {
    chainId: "cosmoshub-4",
    chainName: "Cosmos Hub",
    rpc: "https://rpc.cosmos.network",
    rest: "https://api.cosmos.network",
    bip44: { coinType: 118 },
    bech32Config: {
      bech32PrefixAccAddr: "cosmos",
      bech32PrefixAccPub: "cosmospub",
      bech32PrefixValAddr: "cosmosvaloper",
      bech32PrefixValPub: "cosmosvaloperpub",
      bech32PrefixConsAddr: "cosmosvalcons",
      bech32PrefixConsPub: "cosmosvalconspub",
    },
    currencies: [{ coinDenom: "ATOM", coinMinimalDenom: "uatom", coinDecimals: 6 }],
    feeCurrencies: [{ coinDenom: "ATOM", coinMinimalDenom: "uatom", coinDecimals: 6 }],
    stakeCurrency: { coinDenom: "ATOM", coinMinimalDenom: "uatom", coinDecimals: 6 },
  } as ChainInfo,

  osmosis: {
    chainId: "osmosis-1",
    chainName: "Osmosis",
    rpc: "https://rpc.osmosis.zone",
    rest: "https://api.osmosis.zone",
    bip44: { coinType: 118 },
    bech32Config: {
      bech32PrefixAccAddr: "osmo",
      bech32PrefixAccPub: "osmopub",
      bech32PrefixValAddr: "osmovaloper",
      bech32PrefixValPub: "osmovaloperpub",
      bech32PrefixConsAddr: "osmovalcons",
      bech32PrefixConsPub: "osmovalconspub",
    },
    currencies: [{ coinDenom: "OSMO", coinMinimalDenom: "uosmo", coinDecimals: 6 }],
    feeCurrencies: [{ coinDenom: "OSMO", coinMinimalDenom: "uosmo", coinDecimals: 6 }],
    stakeCurrency: { coinDenom: "OSMO", coinMinimalDenom: "uosmo", coinDecimals: 6 },
  } as ChainInfo,

  juno: {
    chainId: "juno-1",
    chainName: "Juno",
    rpc: "https://rpc.juno.network",
    rest: "https://api.juno.network",
    bip44: { coinType: 118 },
    bech32Config: {
      bech32PrefixAccAddr: "juno",
      bech32PrefixAccPub: "junopub",
      bech32PrefixValAddr: "junovaloper",
      bech32PrefixValPub: "junovaloperpub",
      bech32PrefixConsAddr: "junovalcons",
      bech32PrefixConsPub: "junovalconspub",
    },
    currencies: [{ coinDenom: "JUNO", coinMinimalDenom: "ujuno", coinDecimals: 6 }],
    feeCurrencies: [{ coinDenom: "JUNO", coinMinimalDenom: "ujuno", coinDecimals: 6 }],
    stakeCurrency: { coinDenom: "JUNO", coinMinimalDenom: "ujuno", coinDecimals: 6 },
  } as ChainInfo,
} as const;
