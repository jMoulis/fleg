// Operational retry intervals, not guarantees about provider transfer lifetimes.
// Keep browser retries short and bounded; background recovery takes over later.
export const uploadLifecyclePolicy = {
  retryDelaysMs: [2_000, 5_000, 15_000, 60_000, 300_000],
  cleanupRetryMs: 15 * 60_000,
  cleanupWatchMs: 24 * 60 * 60_000,
  automaticVerificationAttempts: 4,
  browserRecoveryWindowMs: 30_000,
} as const;

export function uploadVerificationRetryMs(failures: number) {
  const delays = uploadLifecyclePolicy.retryDelaysMs;
  return delays[Math.min(Math.max(failures - 1, 0), delays.length - 1)]!;
}
