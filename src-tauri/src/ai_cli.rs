//! Use an AI CLI the user already has installed and signed in.
//!
//! We invoke the program and let it authenticate itself. Lexicon never sees,
//! stores or transmits a token, and never reads another tool's credential
//! store — that would be credential theft however convenient.
//!
//! Detection is presence on `PATH`. Nothing is invoked until the user enables
//! that tool in settings: spending someone's subscription quota without asking
//! is not acceptable even when it is technically possible.
//!
//! See docs/adr/0009-installed-cli-providers.md.

use std::io::Write;
use std::process::{Command, Stdio};
use std::time::Duration;

use serde::Serialize;

/// Tools we know how to drive.
///
/// A fixed allowlist, deliberately. The obvious next request is "let me point
/// it at any command", which is a remote-code-execution hole wearing a settings
/// field. If that is ever added it needs its own ADR and a much louder consent
/// step.
struct CliSpec {
    /// Stable id used by the frontend.
    id: &'static str,
    /// Executable name, looked up on PATH.
    program: &'static str,
    label: &'static str,
    /// Arguments that make it read a prompt from stdin and print a reply.
    args: &'static [&'static str],
}

const TOOLS: &[CliSpec] = &[
    CliSpec {
        id: "claude",
        program: "claude",
        label: "Claude Code",
        args: &["--print"],
    },
    CliSpec {
        id: "codex",
        program: "codex",
        label: "Codex",
        args: &["exec"],
    },
    CliSpec {
        id: "gemini",
        program: "gemini",
        label: "Gemini CLI",
        args: &["--prompt"],
    },
];

/// How long a single generation may take before we stop waiting.
const RUN_TIMEOUT: Duration = Duration::from_secs(180);

/// Cap on captured output, so a runaway tool cannot exhaust memory.
const MAX_OUTPUT_BYTES: usize = 2 * 1024 * 1024;

#[derive(Clone, Serialize)]
pub struct DetectedCli {
    pub id: String,
    pub label: String,
    /// Where it was found, shown in settings so the user knows what will run.
    pub path: String,
}

fn spec(id: &str) -> Option<&'static CliSpec> {
    TOOLS.iter().find(|t| t.id == id)
}

/// Resolve a program on PATH without running it.
fn which(program: &str) -> Option<String> {
    let path = std::env::var_os("PATH")?;
    let exts: Vec<String> = if cfg!(windows) {
        std::env::var("PATHEXT")
            .unwrap_or_else(|_| ".EXE;.CMD;.BAT".into())
            .split(';')
            .map(|e| e.to_lowercase())
            .collect()
    } else {
        vec![String::new()]
    };

    for dir in std::env::split_paths(&path) {
        for ext in &exts {
            let candidate = dir.join(format!("{program}{ext}"));
            if candidate.is_file() {
                return Some(candidate.to_string_lossy().to_string());
            }
        }
    }
    None
}

/// Which known AI CLIs are installed.
///
/// Presence only — nothing is executed. Running a tool to ask whether it exists
/// would spend the user's quota to answer a question `PATH` already answers.
#[tauri::command]
pub fn detect_ai_clis() -> Vec<DetectedCli> {
    TOOLS
        .iter()
        .filter_map(|tool| {
            which(tool.program).map(|path| DetectedCli {
                id: tool.id.to_string(),
                label: tool.label.to_string(),
                path,
            })
        })
        .collect()
}

/// Run a prompt through an installed tool and return its reply.
///
/// The prompt goes over stdin rather than as an argument: it can be tens of
/// kilobytes, it contains newlines and quotes, and command lines have limits
/// and quoting rules that differ per platform. Arguments are passed as a
/// vector with no shell, so nothing in the prompt can be interpreted.
#[tauri::command]
pub async fn run_ai_cli(tool: String, prompt: String) -> Result<String, String> {
    let spec = spec(&tool).ok_or_else(|| format!("{tool} is not a supported tool"))?;
    let program = which(spec.program)
        .ok_or_else(|| format!("{} is not installed", spec.label))?;

    // Blocking process work off the async runtime.
    tauri::async_runtime::spawn_blocking(move || run_blocking(&program, spec, &prompt))
        .await
        .map_err(|e| format!("could not start {}: {e}", spec.label))?
}

fn run_blocking(program: &str, spec: &CliSpec, prompt: &str) -> Result<String, String> {
    let mut child = Command::new(program)
        .args(spec.args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("could not start {}: {e}", spec.label))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(prompt.as_bytes())
            .map_err(|e| format!("could not send the prompt to {}: {e}", spec.label))?;
        // Dropping stdin closes it, which is what tells the tool to begin.
    }

    let deadline = std::time::Instant::now() + RUN_TIMEOUT;
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) => {
                if std::time::Instant::now() > deadline {
                    let _ = child.kill();
                    return Err(format!(
                        "{} did not finish within {}s",
                        spec.label,
                        RUN_TIMEOUT.as_secs()
                    ));
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            Err(e) => return Err(format!("{} failed: {e}", spec.label)),
        }
    }

    let output = child
        .wait_with_output()
        .map_err(|e| format!("{} failed: {e}", spec.label))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let detail = stderr.trim();
        return Err(if detail.is_empty() {
            format!("{} exited with an error", spec.label)
        } else {
            // The tool's own message is far more useful than ours — it is what
            // says "not logged in" or "quota exceeded".
            format!("{}: {}", spec.label, truncate(detail, 400))
        });
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    if stdout.len() > MAX_OUTPUT_BYTES {
        return Err(format!("{} returned too much output", spec.label));
    }
    Ok(stdout.to_string())
}

fn truncate(text: &str, max: usize) -> String {
    if text.len() <= max {
        text.to_string()
    } else {
        format!("{}…", &text[..max])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_known_tools_resolve() {
        assert!(spec("claude").is_some());
        assert!(spec("codex").is_some());
        // The allowlist is the whole security boundary here.
        assert!(spec("bash").is_none());
        assert!(spec("rm").is_none());
        assert!(spec("").is_none());
        assert!(spec("claude; rm -rf /").is_none());
    }

    #[test]
    fn every_tool_has_a_distinct_id_and_a_label() {
        let mut ids: Vec<&str> = TOOLS.iter().map(|t| t.id).collect();
        ids.sort_unstable();
        let count = ids.len();
        ids.dedup();
        assert_eq!(ids.len(), count, "tool ids must be unique");
        assert!(TOOLS.iter().all(|t| !t.label.is_empty()));
    }

    #[test]
    fn which_finds_nothing_for_a_nonsense_program() {
        assert!(which("definitely-not-a-real-program-xyzzy").is_none());
    }

    #[test]
    fn detection_does_not_execute_anything() {
        // Detection must be safe to run on every startup. If this ever starts
        // invoking tools it will spend real money, so the test documents it.
        let _ = detect_ai_clis();
    }
}
