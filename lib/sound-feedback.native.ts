type AudioPlayer = { play: () => void; pause?: () => void; seekTo?: (seconds: number) => void; remove?: () => void; loop?: boolean; volume?: number };
type ExpoAudioModule = { createAudioPlayer: (source: number, options?: { loop?: boolean }) => AudioPlayer; setAudioModeAsync: (options: { playsInSilentMode?: boolean }) => Promise<void> };

const sources = {
  message: require("../assets/sounds/message-tone.wav"),
  ringtone: require("../assets/sounds/incoming-ringtone.mp3"),
  waiting: require("../assets/sounds/call-waiting.mp3"),
};

const players = new Map<keyof typeof sources, AudioPlayer>();

async function getPlayer(kind: keyof typeof sources, loop = false) {
  const existing = players.get(kind);
  if (existing) return existing;
  const audio = await import("expo-audio") as unknown as ExpoAudioModule;
  await audio.setAudioModeAsync({ playsInSilentMode: true });
  const player = audio.createAudioPlayer(sources[kind], { loop });
  player.loop = loop;
  player.volume = kind === "message" ? 0.62 : 0.5;
  players.set(kind, player);
  return player;
}

async function replay(kind: keyof typeof sources, loop = false) {
  const player = await getPlayer(kind, loop);
  player.seekTo?.(0);
  player.play();
}

export function playIncomingMessageTone() { void replay("message"); }
export function startIncomingRingtone() { void replay("ringtone", true); }
export function stopIncomingRingtone() { const player = players.get("ringtone"); player?.pause?.(); player?.seekTo?.(0); }
export function startCallWaitingTone() { void replay("waiting", true); }
export function stopCallWaitingTone() { const player = players.get("waiting"); player?.pause?.(); player?.seekTo?.(0); }
