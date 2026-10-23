import { sql, type AnyColumn, type SQL } from "drizzle-orm";

/**
 * A column reference that is always table-qualified, for hand-written
 * correlated subqueries.
 *
 * Drizzle renders `${column}` inside a raw `sql` template *unqualified* when
 * the outer query selects from a single table (`"id"`, not
 * `"app"."orders"."id"`). Inside a subquery Postgres then resolves `"id"` to
 * the *inner* table's column, and the correlation silently matches nothing
 * (e.g. every order counted 0 items). Query-builder conditions (`eq`,
 * `exists`) are always qualified; only raw fragments need this.
 */
export function qualified(column: AnyColumn): SQL {
  return sql`${column.table}.${sql.identifier(column.name)}`;
}
