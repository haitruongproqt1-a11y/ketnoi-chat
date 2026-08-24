export type SystemCall = {
  callId: string;
  peerId: number;
  peerName: string;
  withVideo: boolean;
  direction: "incoming" | "outgoing";
};

export async function initializeCallKeep() { return false; }
export function presentIncomingSystemCall(_call: SystemCall) {}
export function presentOutgoingSystemCall(_call: SystemCall) {}
export function markSystemCallConnected(_callId: string) {}
export function setSystemCallMuted(_callId: string, _muted: boolean) {}
export function setSystemCallSpeaker(_callId: string, _speakerOn: boolean) {}
export function endSystemCall(_callId: string, _reason?: number) {}
export function getSystemCall(_callId: string): SystemCall | null { return null; }
export function clearSystemCall(_callId: string) {}
export const RNCallKeep = { CONSTANTS: { END_CALL_REASONS: { REMOTE_ENDED: 2 } } };
