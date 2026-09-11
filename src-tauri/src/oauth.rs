//! The loopback half of an OAuth PKCE sign-in.
//!
//! A desktop app has no server to redirect back to, so it becomes one for a
//! few seconds: bind a port on the loopback interface, send the user to the
//! provider in their real browser, and catch the redirect that comes back.
//!
//! This module knows nothing about OpenRouter beyond an allowlist of where it
//! may send the user. The URL, the PKCE crypto and the code exchange all live
//! in `src/lib/ai/oauth.ts`; what Rust contributes is the one thing a web page
//! cannot do, which is listen on a socket.
//!
//! See docs/adr/0007-authentication-strategy.md.

use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::time::{Duration, Instant};

use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

/// Where a sign-in may send the user.
///
/// The frontend supplies the whole URL, so without this an IPC bug — or
/// anything that could reach the frontend — could open an arbitrary page in the
/// user's browser under the app's name. Only one provider passed the spike, so
/// the list is one entry long and should stay that short.
const ALLOWED_PREFIXES: &[&str] = &["https://openrouter.ai/auth?"];

/// Substituted with the port once it is known. Must match `PORT_PLACEHOLDER`
/// in `src/lib/ai/oauth.ts`.
///
/// Alphanumeric deliberately: form-encoding escapes braces, so a `{port}` token
/// would arrive here as `%7Bport%7D` and never match.
const PORT_PLACEHOLDER: &str = "__PORT__";

/// The path the provider is told to come back to.
const CALLBACK_PATH: &str = "/callback";

/// Longest request line we will read, so a rogue local client cannot make us
/// buffer without limit.
const MAX_REQUEST_LINE: u64 = 8 * 1024;

/// How long to wait for the browser to come back before giving up.
const MAX_WAIT: Duration = Duration::from_secs(300);

/// How often to check for a connection while waiting.
const POLL_INTERVAL: Duration = Duration::from_millis(120);

/// Run the sign-in and return the authorization code.
///
/// `url_template` is the full authorize URL with [`PORT_PLACEHOLDER`] standing
/// in for the port inside the (already percent-encoded) callback value.
#[tauri::command]
pub async fn oauth_authorize(app: AppHandle, url_template: String) -> Result<String, String> {
    check_allowed(&url_template)?;

    // Port 0 asks the OS for a free one. Loopback only: binding 0.0.0.0 would
    // expose the callback to the local network for the life of the flow.
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| format!("could not open a port for the sign-in: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("could not read the sign-in port: {e}"))?
        .port();
    listener
        .set_nonblocking(true)
        .map_err(|e| format!("could not configure the sign-in port: {e}"))?;

    let url = url_template.replace(PORT_PLACEHOLDER, &port.to_string());
    // The user's real browser, where they are already signed in — not a
    // webview inside this app, which is what makes this not credential-sharing.
    app.opener()
        .open_url(&url, None::<&str>)
        .map_err(|e| format!("could not open your browser: {e}"))?;

    // Blocking accept loop, off the async runtime's threads.
    tauri::async_runtime::spawn_blocking(move || wait_for_code(&listener))
        .await
        .map_err(|e| format!("the sign-in task failed: {e}"))?
}

/// Reject anything not on the allowlist, and anything with no port to fill in.
fn check_allowed(url_template: &str) -> Result<(), String> {
    if !ALLOWED_PREFIXES
        .iter()
        .any(|prefix| url_template.starts_with(prefix))
    {
        return Err("that is not a sign-in this app performs".into());
    }
    if !url_template.contains(PORT_PLACEHOLDER) {
        return Err("the sign-in URL has nowhere to put the callback port".into());
    }
    Ok(())
}

/// Accept connections until one carries a code, or time runs out.
fn wait_for_code(listener: &TcpListener) -> Result<String, String> {
    let deadline = Instant::now() + MAX_WAIT;

    while Instant::now() < deadline {
        match listener.accept() {
            Ok((stream, peer)) => {
                // Belt and braces: the socket is bound to loopback, so this
                // cannot fail, and it is cheap to be sure before trusting a
                // request enough to finish a sign-in with it.
                if !peer.ip().is_loopback() {
                    continue;
                }
                match handle(stream) {
                    // A browser asks for /favicon.ico and similar alongside the
                    // real redirect. Ignore those rather than failing the flow.
                    Ok(None) => continue,
                    Ok(Some(outcome)) => return outcome,
                    Err(_) => continue,
                }
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(POLL_INTERVAL);
            }
            Err(e) => return Err(format!("the sign-in connection failed: {e}")),
        }
    }

    Err("the sign-in timed out. Try connecting again.".into())
}

/// Read one request. `Ok(None)` means it was not the callback.
fn handle(mut stream: TcpStream) -> std::io::Result<Option<Result<String, String>>> {
    stream.set_read_timeout(Some(Duration::from_secs(5)))?;

    // Cap before buffering, not after: a rogue local client could otherwise
    // send an unbounded line and make this allocate without limit.
    let mut line = String::new();
    BufReader::new(stream.try_clone()?.take(MAX_REQUEST_LINE)).read_line(&mut line)?;

    let Some(target) = request_target(&line) else {
        return Ok(None);
    };
    let Some(query) = target.strip_prefix(CALLBACK_PATH) else {
        return Ok(None);
    };
    let query = query.strip_prefix('?').unwrap_or("");

    let outcome = match (param(query, "code"), param(query, "error")) {
        (Some(code), _) if !code.is_empty() => Ok(code),
        (_, Some(error)) => Err(format!("OpenRouter refused the sign-in ({error}).")),
        _ => return Ok(None),
    };

    let body = match &outcome {
        Ok(_) => page("Connected", "You can close this tab and return to Lexicon."),
        Err(message) => page("Not connected", message),
    };
    let _ = stream.write_all(body.as_bytes());
    let _ = stream.flush();

    Ok(Some(outcome))
}

/// The path-and-query out of `GET /callback?code=… HTTP/1.1`.
fn request_target(line: &str) -> Option<&str> {
    let mut parts = line.split_whitespace();
    if parts.next()? != "GET" {
        return None;
    }
    parts.next()
}

/// One query parameter, percent-decoded.
fn param(query: &str, name: &str) -> Option<String> {
    query.split('&').find_map(|pair| {
        let (key, value) = pair.split_once('=')?;
        (key == name).then(|| percent_decode(value))
    })
}

/// Enough percent-decoding for an authorization code and an error slug.
///
/// `+` means space in a query string, which is not the same rule as in a path —
/// getting that wrong would corrupt codes containing one.
fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' if i + 2 < bytes.len() => {
                match u8::from_str_radix(&value[i + 1..i + 3], 16) {
                    Ok(byte) => {
                        out.push(byte);
                        i += 3;
                    }
                    // Not a valid escape; treat the '%' as itself.
                    Err(_) => {
                        out.push(b'%');
                        i += 1;
                    }
                }
            }
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            byte => {
                out.push(byte);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// The page the user is left looking at in their browser.
fn page(title: &str, message: &str) -> String {
    let html = format!(
        "<!doctype html><meta charset=\"utf-8\"><title>{title}</title>\
         <body style=\"font-family:system-ui,sans-serif;display:grid;place-items:center;\
         height:100vh;margin:0;background:#0f0f0f;color:#f5f5f5\">\
         <main style=\"text-align:center\"><h1 style=\"font-weight:600\">{title}</h1>\
         <p style=\"opacity:.7\">{message}</p></main>"
    );
    format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n\
         Content-Length: {}\r\nConnection: close\r\n\r\n{html}",
        html.len()
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_allowlisted_sign_in_is_permitted() {
        assert!(check_allowed("https://openrouter.ai/auth?callback_url=x__PORT__").is_ok());

        // Without the allowlist this command opens any page in the user's
        // browser on the frontend's say-so.
        for url in [
            "https://evil.example.com/auth?x=__PORT__",
            // A lookalike host, and a path that only starts the same way.
            "https://openrouter.ai.evil.test/auth?x=__PORT__",
            "http://openrouter.ai/auth?x=__PORT__",
            "https://openrouter.ai/settings?x=__PORT__",
            "file:///etc/passwd__PORT__",
            "",
        ] {
            assert!(check_allowed(url).is_err(), "{url} should be rejected");
        }
    }

    #[test]
    fn a_url_with_no_port_placeholder_is_rejected() {
        // It would otherwise "succeed" while telling the provider to redirect
        // to a port nothing is listening on.
        assert!(check_allowed("https://openrouter.ai/auth?callback_url=x").is_err());
    }

    #[test]
    fn reads_the_target_from_a_request_line() {
        assert_eq!(
            request_target("GET /callback?code=abc HTTP/1.1\r\n"),
            Some("/callback?code=abc")
        );
        // Anything that is not a GET is not our redirect.
        assert_eq!(request_target("POST /callback HTTP/1.1\r\n"), None);
        assert_eq!(request_target(""), None);
    }

    #[test]
    fn finds_a_named_parameter() {
        assert_eq!(param("code=abc&state=1", "code").as_deref(), Some("abc"));
        assert_eq!(param("state=1&code=abc", "code").as_deref(), Some("abc"));
        assert_eq!(param("state=1", "code"), None);
        // A prefix of the name must not match it.
        assert_eq!(param("codex=abc", "code"), None);
    }

    #[test]
    fn decodes_what_a_browser_encodes() {
        assert_eq!(percent_decode("a%2Fb"), "a/b");
        assert_eq!(percent_decode("access%20denied"), "access denied");
        // '+' is a space in a query string.
        assert_eq!(percent_decode("access+denied"), "access denied");
        assert_eq!(percent_decode("plain"), "plain");
        // A stray '%' must not panic or truncate the code.
        assert_eq!(percent_decode("100%"), "100%");
        assert_eq!(percent_decode("%zz"), "%zz");
    }

    #[test]
    fn the_response_declares_its_own_length() {
        // Without Content-Length the browser waits for a close and the tab
        // looks like it hung, which reads as a failed sign-in.
        let response = page("Connected", "You can close this tab.");
        let body = response.split("\r\n\r\n").nth(1).unwrap();
        assert!(response.contains(&format!("Content-Length: {}", body.len())));
    }
}
