/**
 * Files shared to Lexicon from another app, turned into `File`s.
 *
 * The Android activity copies each shared file into an inbox while it holds
 * the read grant (`src-tauri/android-src/MainActivity.kt`); the Rust side
 * lists and hands out that inbox (`src-tauri/src/share.rs`). This drains it.
 * What happens next is the ordinary import path, so a shared file is accepted
 * exactly when a dropped or picked one would be.
 *
 * `invoke` is a parameter so this can be tested without a Tauri runtime.
 */

export interface SharedFileEntry {
  id: string;
  name: string;
}

export type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

/**
 * Take everything waiting. Each file is removed from the inbox as it is
 * taken, so calling this twice never imports a share twice. A file that
 * cannot be read is skipped, not fatal: one bad share should not strand the
 * others behind it.
 */
export async function drainSharedFiles(invoke: Invoke): Promise<File[]> {
  const waiting = await invoke<SharedFileEntry[]>("list_shared_files");
  const files: File[] = [];
  for (const entry of waiting) {
    try {
      const bytes = await invoke<ArrayBuffer>("take_shared_file", { id: entry.id });
      files.push(new File([bytes], entry.name));
    } catch (e) {
      console.warn(`shared file ${entry.name} could not be read`, e);
    }
  }
  return files;
}
