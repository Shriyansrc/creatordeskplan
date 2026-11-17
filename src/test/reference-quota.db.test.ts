import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { describe, expect, it } from "vitest";

// Explicit opt-in: tests use the configured test connection, hold its quota lock, and
// roll back every reservation. They never update or delete creator data.
describe.skipIf(process.env["RUN_REFERENCE_DB_TESTS"] !== "1")("PostgreSQL reference quota", () => {
  const connect = () => {
    const url = process.env["REFERENCE_QUOTA_TEST_DB_URL"] ?? process.env["SUPABASE_DB_URL"];
    if (!url) throw new Error("Existing database connection required");
    return postgres(url, { max: 1, onnotice: () => {} });
  };
  const lock = async (sql: postgres.Sql) => {
    await sql`begin`;
    await sql`set local role service_role`;
    await sql`select pg_advisory_xact_lock(724193806112345678::bigint)`;
  };
  it("allows exactly 8 per user, then denies without any partial reservation", async () => {
    const sql = connect();
    try {
      await lock(sql);
      const before = await sql`select count(*)::int as n from public.reference_search_quota where reserved_at > clock_timestamp() - interval '1 hour'`;
      const initial = before[0]?.['n'];
      if (typeof initial !== "number") throw new Error("Count unavailable");
      expect(initial).toBeLessThanOrEqual(900);
      const user = randomUUID();
      for (let i = 0; i < 100; i++) expect((await sql`select public.reserve_reference_search(${user}::uuid) as allowed`)[0]?.['allowed']).toBe(true);
      expect((await sql`select public.reserve_reference_search(${user}::uuid) as allowed`)[0]?.['allowed']).toBe(false);
      expect((await sql`select count(*)::int as n from public.reference_search_quota where user_id=${user}::uuid`)[0]?.['n']).toBe(100);
      expect((await sql`select count(*)::int as n from public.reference_search_quota where reserved_at > clock_timestamp() - interval '1 hour'`)[0]?.['n']).toBe(initial + 100);
    } finally { await sql`rollback`; await sql.end(); }
  });
  it("enforces exactly 1000 globally and does not increment either bucket when denied", async () => {
    const sql = connect();
    try {
      await lock(sql);
      const initial = (await sql`select count(*)::int as n from public.reference_search_quota where reserved_at > clock_timestamp() - interval '1 hour'`)[0]?.['n'];
      if (typeof initial !== "number") throw new Error("Count unavailable");
      const users = Array.from({ length: 10 }, () => randomUUID());
      for (let i = initial; i < 1000; i++) {
        const user = users[Math.floor((i - initial) / 8)];
        if (!user) throw new Error("Test user unavailable");
        expect((await sql`select public.reserve_reference_search(${user}::uuid) as allowed`)[0]?.['allowed']).toBe(true);
      }
      const deniedUser = randomUUID();
      expect((await sql`select public.reserve_reference_search(${deniedUser}::uuid) as allowed`)[0]?.['allowed']).toBe(false);
      expect((await sql`select count(*)::int as n from public.reference_search_quota where reserved_at > clock_timestamp() - interval '1 hour'`)[0]?.['n']).toBe(1000);
      expect((await sql`select count(*)::int as n from public.reference_search_quota where user_id=${deniedUser}::uuid`)[0]?.['n']).toBe(0);
    } finally { await sql`rollback`; await sql.end(); }
  });
  it("serializes concurrent independent connections before reservation", async () => {
    const holder = connect();
    const contenders = Array.from({ length: 4 }, () => connect());
    const user = randomUUID();
    try {
      await lock(holder);
      await holder`reset role`;
      await Promise.all(contenders.map(async (sql) => { await sql`begin`; await sql`set local role service_role`; }));
      const jobs = contenders.map(async (sql) => {
        const result = await sql`select public.reserve_reference_search(${user}::uuid) as allowed`;
        await sql`rollback`;
        return result[0]?.['allowed'];
      });
      let waiting = 0;
      for (let i = 0; i < 40 && waiting < 4; i++) {
        waiting = (await holder`select count(*)::int as n from pg_locks where locktype='advisory' and not granted`)[0]?.['n'] ?? 0;
        if (waiting < 4) await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(waiting).toBe(4);
      await holder`rollback`;
      expect(await Promise.all(jobs)).toEqual([true, true, true, true]);
      await holder`begin`; await holder`set local role service_role`;
      expect((await holder`select count(*)::int as n from public.reference_search_quota where user_id=${user}::uuid`)[0]?.['n']).toBe(0);
    } finally {
      await holder`rollback`; await holder.end();
      await Promise.all(contenders.map(async (sql) => { await sql`rollback`; await sql.end(); }));
    }
  }, 15000);
  it("denies anon/authenticated table access and RPC execution", async () => {
    const sql = connect();
    try {
      for (const role of ["anon", "authenticated"]) {
        const row = (await sql`select has_table_privilege(${role}, 'public.reference_search_quota', 'SELECT,INSERT,UPDATE,DELETE') as table_access, has_function_privilege(${role}, 'public.reserve_reference_search(uuid)', 'EXECUTE') as rpc_access`)[0];
        expect(row?.['table_access']).toBe(false);
        expect(row?.['rpc_access']).toBe(false);
      }
    } finally { await sql.end(); }
  });
});