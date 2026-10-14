package com.lexicon.app

// Tracked source. `scripts/android-prepare.mjs` copies it into the generated
// project and declares it in the manifest; `tauri android init` knows nothing
// about it. Edit this file, not the copy under src-tauri/gen.

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import android.util.Log
import androidx.core.content.IntentCompat
import java.io.File

/**
 * Receives files shared to Lexicon from another app, then gets out of the way.
 *
 * Its own activity rather than MainActivity's intent filter, because of how
 * the share sheet launches: with NEW_DOCUMENT | MULTIPLE_TASK. Against a
 * running singleTask MainActivity, Android answers START_TASK_TO_FRONT and
 * never delivers the intent — the app comes forward and the file is lost.
 * An adb-sent intent does not show this; only a real share sheet does.
 *
 * It copies each file into the inbox the web side drains
 * (src-tauri/src/share.rs) while it holds the read grant, which lasts only as
 * long as this intent, then brings MainActivity forward and finishes. Its
 * theme is NoDisplay, so it is never seen, and it is kept out of Recents.
 */
class ShareActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    receive(intent)
    startActivity(
      Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
    )
    finish()
  }

  private fun receive(intent: Intent?) {
    val uris: List<Uri> = when (intent?.action) {
      Intent.ACTION_SEND ->
        listOfNotNull(IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri::class.java))
      Intent.ACTION_SEND_MULTIPLE ->
        IntentCompat.getParcelableArrayListExtra(intent, Intent.EXTRA_STREAM, Uri::class.java) ?: emptyList()
      else -> emptyList()
    }
    if (uris.isEmpty()) return

    val inbox = File(cacheDir, INBOX).apply { mkdirs() }
    uris.forEachIndexed { i, uri ->
      try {
        val name = nameFor(uri, intent?.type)
        // The timestamp keeps two shares of "words.json" apart; share.rs
        // strips everything up to "__" before the web side sees the name.
        val target = File(inbox, "${System.currentTimeMillis()}-${i}__$name")
        val copied = contentResolver.openInputStream(uri)?.use { input ->
          target.outputStream().use { output -> input.copyTo(output) }
        } ?: 0L
        // Nothing a person shares from a vocabulary list is this big; a
        // stray video shared by mistake should not sit in the cache.
        if (copied > MAX_BYTES) {
          target.delete()
          Log.w("Lexicon", "Ignored a shared file over ${MAX_BYTES / 1_000_000} MB")
        }
      } catch (e: Exception) {
        Log.w("Lexicon", "Could not receive a shared file: ${e.message}")
      }
    }
  }

  /** The shared file's own name, with an extension the importer recognises. */
  private fun nameFor(uri: Uri, type: String?): String {
    var name = "shared"
    contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
      if (c.moveToFirst() && !c.isNull(0)) name = c.getString(0)
    }
    name = name.replace(Regex("[^A-Za-z0-9._ -]"), "_").take(120)
    if (!Regex("\\.(json|csv|apkg)$", RegexOption.IGNORE_CASE).containsMatchIn(name)) {
      name += when (type) {
        "application/json" -> ".json"
        "text/csv", "text/comma-separated-values" -> ".csv"
        else -> ""
      }
    }
    return name
  }

  companion object {
    const val INBOX = "shared-inbox"
    const val MAX_BYTES = 50_000_000L
  }
}
