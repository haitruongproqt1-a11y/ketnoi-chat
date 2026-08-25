export type MobileMediaConstraints = {
  audio: boolean;
  video:
    | false
    | {
        facingMode: "user" | "environment";
        frameRate: { ideal: number; max: number };
        width: { ideal: number };
        height: { ideal: number };
      };
};

/**
 * Voice call requests microphone only. Video call requests a conservative front-camera
 * profile that is suitable for mobile networks and can be replaced by screen sharing later.
 */
export function createMobileMediaConstraints(withVideo: boolean): MobileMediaConstraints {
  if (!withVideo) return { audio: true, video: false };
  return {
    audio: true,
    video: {
      facingMode: "user",
      frameRate: { ideal: 24, max: 30 },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  };
}
