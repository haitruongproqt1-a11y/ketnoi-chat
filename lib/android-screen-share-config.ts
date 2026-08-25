export type AndroidScreenShareConstraints = {
  audio: false;
  video: true;
  android: {
    createConfigForDefaultDisplay: true;
    resolutionScale: number;
  };
};

/**
 * Android MediaProjection should capture video only. A moderate scale keeps the
 * replacement track suitable for P2P mobile connections without touching audio.
 */
export function createAndroidScreenShareConstraints(): AndroidScreenShareConstraints {
  return {
    audio: false,
    video: true,
    android: {
      createConfigForDefaultDisplay: true,
      resolutionScale: 0.75,
    },
  };
}
