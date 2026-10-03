#!/usr/bin/env bash
# Runs the database tests on a throwaway local Postgres: no Docker, no
# Supabase account. Needs the Postgres server binaries (initdb, pg_ctl) and
# psql. Set PG_BIN if they are not where pg_config says.
#
# It starts a private Postgres in a temporary folder, loads a stub of the
# Supabase pieces the migrations use, applies every migration in order, runs
# every *.test.sql file, then deletes the whole thing.

set -euo pipefail

app_dir="$(cd "$(dirname "$0")/.." && pwd)"
pg_bin="${PG_BIN:-$(pg_config --bindir)}"
tmp="$(mktemp -d)"

cleanup() {
  "$pg_bin/pg_ctl" -D "$tmp/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT

"$pg_bin/initdb" -D "$tmp/data" -U postgres --auth=trust -E UTF8 --no-locale >/dev/null
"$pg_bin/pg_ctl" -D "$tmp/data" -l "$tmp/postgres.log" -w \
  -o "-c listen_addresses='' -k $tmp" start >/dev/null

run_sql() {
  psql -h "$tmp" -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 -f "$1"
}

run_sql "$app_dir/supabase/tests/supabase-stub.sql"
for migration in "$app_dir"/supabase/migrations/*.sql; do
  run_sql "$migration"
done
for test in "$app_dir"/supabase/tests/*.test.sql; do
  echo "# $(basename "$test")"
  run_sql "$test"
done
echo "database tests passed"
