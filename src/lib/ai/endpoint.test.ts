import { describe, expect, it } from "vitest";
import { confirmationFor, judgeEndpoint } from "@/lib/ai/endpoint";

describe("accepting an endpoint", () => {
  it.each([
    "https://api.together.xyz/v1",
    "https://my-llm.example.com/v1/chat",
    "https://example.com:8443/v1",
  ])("accepts %s", (url) => {
    expect(judgeEndpoint(url).ok).toBe(true);
  });

  it("reports the host it would send to", () => {
    const verdict = judgeEndpoint("https://API.Together.XYZ/v1");
    expect(verdict.ok && verdict.host).toBe("api.together.xyz");
  });

  it("keeps the port, which is part of the host", () => {
    const verdict = judgeEndpoint("https://example.com:8443/v1");
    expect(verdict.ok && verdict.host).toBe("example.com:8443");
  });
});

describe("plain http", () => {
  it.each([
    "http://127.0.0.1:11434/v1",
    "http://localhost:1234/v1",
    "http://[::1]:8080/v1",
  ])("is fine on loopback: %s", (url) => {
    // There is no network to intercept, and making a local model server feel
    // dangerous would push people towards the cloud.
    const verdict = judgeEndpoint(url);
    expect(verdict.ok).toBe(true);
    expect(verdict.ok && verdict.needsConfirmation).toBe(false);
  });

  it("is refused anywhere else", () => {
    // Refused, not warned about: a key sent in the clear is readable by
    // anything in between, and there is no version of that the user meant.
    const verdict = judgeEndpoint("http://example.com/v1");
    expect(verdict.ok).toBe(false);
    expect(!verdict.ok && verdict.reason).toMatch(/in the clear/);
  });

  it("is refused for a host that merely contains 'localhost'", () => {
    expect(judgeEndpoint("http://localhost.evil.test/v1").ok).toBe(false);
  });

  it("is refused for a host that merely starts like a loopback address", () => {
    expect(judgeEndpoint("http://127.0.0.1.evil.test/v1").ok).toBe(false);
  });
});

describe("confirmation", () => {
  it("is needed for anywhere off this machine", () => {
    const verdict = judgeEndpoint("https://my-llm.example.com/v1");
    expect(verdict.ok && verdict.needsConfirmation).toBe(true);
  });

  it("is not needed for loopback", () => {
    const verdict = judgeEndpoint("http://127.0.0.1:11434/v1");
    expect(verdict.ok && verdict.note).toMatch(/never leaves|nothing leaves/i);
  });

  it("names the exact host, which is the only thing that catches a typo", () => {
    expect(confirmationFor("api.openai.com.evil.test")).toContain(
      "api.openai.com.evil.test",
    );
  });
});

describe("refusing what is not an endpoint", () => {
  it.each([
    ["empty", ""],
    ["whitespace", "   "],
    ["a bare host", "api.example.com"],
    ["a path", "/v1/chat"],
    ["nonsense", "????"],
  ])("refuses %s", (_name, url) => {
    expect(judgeEndpoint(url).ok).toBe(false);
  });

  it("refuses a scheme it does not call", () => {
    for (const url of ["file:///etc/passwd", "ftp://example.com/x"]) {
      expect(judgeEndpoint(url).ok, url).toBe(false);
    }
  });

  it("refuses credentials embedded in the address", () => {
    // They end up in logs and history, where the key field does not.
    const verdict = judgeEndpoint("https://user:secret@example.com/v1");
    expect(verdict.ok).toBe(false);
    expect(!verdict.ok && verdict.reason).toMatch(/key field/);
  });

  it("says what to do, not only what is wrong", () => {
    const verdict = judgeEndpoint("api.example.com");
    expect(!verdict.ok && verdict.reason).toMatch(/https:\/\//);
  });
});
