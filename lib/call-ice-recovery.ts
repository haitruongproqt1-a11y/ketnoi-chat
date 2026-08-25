export const MAX_ICE_RESTART_ATTEMPTS = 2;
export const ICE_RESTART_DELAY_MS = 1_500;

export function shouldStartIceRestart(
  iceConnectionState: string,
  attempt: number,
  isOfferer: boolean,
) {
  return isOfferer
    && attempt < MAX_ICE_RESTART_ATTEMPTS
    && (iceConnectionState === "disconnected" || iceConnectionState === "failed");
}
