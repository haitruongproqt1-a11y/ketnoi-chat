import { describe, expect, it, vi } from "vitest";

import { CallSignalMailbox, type CallSignalEnvelope } from "../lib/call-signal-mailbox";

const signal = (event: CallSignalEnvelope["event"], callId = "call-a"): CallSignalEnvelope => ({
  event,
  payload: { callId },
});

describe("CallSignalMailbox", () => {
  it("queues every signal in arrival order until a call route consumes it", () => {
    const mailbox = new CallSignalMailbox();
    mailbox.push(signal("call:offer"));
    mailbox.push(signal("call:ice-candidate"));
    mailbox.push(signal("call:ice-candidate"));

    expect(mailbox.consume("call-a").map((item) => item.event)).toEqual([
      "call:offer",
      "call:ice-candidate",
      "call:ice-candidate",
    ]);
    expect(mailbox.consume("call-a")).toEqual([]);
  });

  it("delivers subsequent live signals without replaying them after subscription", () => {
    const mailbox = new CallSignalMailbox();
    const listener = vi.fn();
    const unsubscribe = mailbox.subscribe("call-b", listener);

    mailbox.push(signal("call:answer", "call-b"));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(mailbox.consume("call-b")).toEqual([]);

    unsubscribe();
    mailbox.push(signal("call:hangup", "call-b"));
    expect(mailbox.consume("call-b").map((item) => item.event)).toEqual(["call:hangup"]);
  });
});
