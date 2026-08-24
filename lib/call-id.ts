const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function hashCallId(value: string, seed: number) {
  let hash = seed;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193);
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function toSystemCallUuid(callId: string) {
  if (UUID_PATTERN.test(callId)) return callId.toLowerCase();
  const first = hashCallId(callId, 0x811c9dc5);
  const second = hashCallId(callId, 0x9e3779b9);
  const third = hashCallId(callId, 0x85ebca6b);
  const fourth = hashCallId(callId, 0xc2b2ae35);
  return `${first}-${second.slice(0, 4)}-4${second.slice(5, 8)}-8${third.slice(1, 4)}-${third}${fourth.slice(0, 4)}`;
}
