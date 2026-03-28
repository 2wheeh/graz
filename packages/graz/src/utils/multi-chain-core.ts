/**
 * Pure multi-chain utility functions with no external dependencies.
 * Separated to enable direct testing without Vitest SSR transform issues.
 */

/**
 * Creates a synchronous function that executes across multiple chains.
 * Always returns Record<chainId, T> for consistent multi-chain results.
 *
 * @param chains - Array of chain objects to execute against
 * @param fn - Synchronous function to execute for each chain
 * @returns Record<chainId, T> - Results mapped by chain ID
 */
export const createMultiChainFunction = <T, C extends { chainId: string }>(
  chains: C[],
  fn: (chain: C) => T,
): Record<string, T> => {
  const res = chains.map(fn);
  return Object.fromEntries(res.map((x, i) => [chains[i]!.chainId, x]));
};
