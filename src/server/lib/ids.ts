import { ulid } from "ulid";

/**
 * Sortable, lexically-ordered primary keys (docs/03 §4: "text primary
 * keys (ULID, sortable) for app tables") - unlike a random UUIDv4, a
 * ULID's leading component is a timestamp, so an index on `id` is also
 * roughly an index on creation order, and new rows insert at the end of
 * the b-tree instead of at random points in it.
 */
export function createId(): string {
  return ulid();
}
