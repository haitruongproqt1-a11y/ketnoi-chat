declare module "react-native-incall-manager" {
  const InCallManager: {
    start: (options?: { media?: "audio" | "video"; auto?: boolean }) => void;
    stop: () => void;
    setSpeakerphoneOn: (enabled: boolean) => void;
    setMicrophoneMute: (muted: boolean) => void;
  };
  export default InCallManager;
}
