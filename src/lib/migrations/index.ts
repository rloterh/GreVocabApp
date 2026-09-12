import { runTracksMigration, type MigrationResult, type MigrationStorage } from "./tracks";

/**
 * Migrations that must run before any store hydrates.
 *
 * Zustand's per-store `migrate` cannot do this work: the tracks migration
 * derives an id map from the vocabulary and applies it to progress, and the
 * two stores hydrate independently in no defined order.
 *
 * Every migration here is idempotent and fails closed — an exception leaves
 * storage exactly as it was. A user whose data did not migrate can be helped;
 * a user whose data half-migrated cannot.
 */
export function runMigrations(
  storage: MigrationStorage = localStorage,
): MigrationResult[] {
  const results: MigrationResult[] = [];
  for (const migration of [runTracksMigration]) {
    try {
      results.push(migration(storage));
    } catch (error) {
      // Deliberately swallowed. The app starting with un-migrated data is a
      // visible, reversible problem; a failed migration that took the stores
      // down with it would look identical to data loss.
      results.push({
        ran: false,
        reason: `failed: ${error instanceof Error ? error.message : String(error)}`,
        monthsMigrated: 0,
        wordsRenamed: 0,
        progressRecordsRewritten: 0,
        orphans: [],
      });
    }
  }
  return results;
}

export { runTracksMigration };
export type { MigrationResult, MigrationStorage };
