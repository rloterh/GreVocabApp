/**
 * Judging a user-supplied endpoint before a credential goes near it.
 *
 * ADR 0010 §5: a custom base URL is user-supplied, a typo can send a key
 * somewhere unintended, and plain `http://` is refused except on loopback
 * where there is no network to intercept.
 *
 * Pure, so the UI can show the verdict while the user is still typing rather
 * than after they have committed to it.
 */

/** Why an endpoint was refused, or what to confirm before using it. */
export type EndpointVerdict =
  | { ok: true; host: string; needsConfirmation: boolean; note?: string }
  | { ok: false; reason: string };

/**
 * Hostnames that never leave the machine.
 *
 * Every check is a whole-string match. A prefix test — `/^127\./` — calls
 * `127.0.0.1.evil.test` loopback, which would then be allowed to take a key
 * over plain HTTP to somebody else's server. The same shape of mistake as a
 * lookalike host, and caught here by a test rather than in the wild.
 */
function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host === "::1" || host === "[::1]") return true;
  // Any 127.x.x.x address, and nothing that merely starts with one.
  return /^127(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(host);
}

/**
 * Is this endpoint usable, and does it need the user to look at it first?
 *
 * `needsConfirmation` is true whenever a credential would leave the machine to
 * a host the app has never seen. That is not a warning about danger so much as
 * a moment to read the hostname back — which is the only thing that catches a
 * typo before it costs a key.
 */
export function judgeEndpoint(raw: string): EndpointVerdict {
  const text = raw.trim();
  if (!text) return { ok: false, reason: "Enter an address." };

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return {
      ok: false,
      reason: "That is not a full address. It should start with https://",
    };
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, reason: `${url.protocol} is not an address this app calls.` };
  }

  const loopback = isLoopbackHost(url.hostname);

  if (url.protocol === "http:" && !loopback) {
    // Refused rather than warned about: a key sent over plain HTTP is
    // readable by anything between here and there, and there is no version of
    // that the user meant to accept.
    return {
      ok: false,
      reason:
        "Plain http:// sends your key in the clear. Use https:// — or a loopback address, which never leaves this machine.",
    };
  }

  if (url.username || url.password) {
    // Credentials in a URL end up in logs and history.
    return {
      ok: false,
      reason: "Put the key in the key field, not in the address.",
    };
  }

  return {
    ok: true,
    host: url.host.toLowerCase(),
    // Loopback needs no confirmation: nothing leaves the machine, and making
    // a local model server feel dangerous would push people towards the cloud.
    needsConfirmation: !loopback,
    note: loopback
      ? "Loopback — nothing leaves this machine."
      : undefined,
  };
}

/** The exact sentence shown before a key is first sent somewhere new. */
export function confirmationFor(host: string): string {
  return `Your key will be sent to ${host}. Only continue if you recognise that address.`;
}
