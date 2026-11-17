// Local policy test: npm i -D @electric-sql/pglite; node docs/reel-jobs-rls-test.mjs v2 (run from repo root). Uses stand-in auth/storage roles, not the real Supabase ones.
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
const db = new PGlite();
const A="11111111-1111-1111-1111-111111111111", B="22222222-2222-2222-2222-222222222222";
await db.exec(`
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create schema storage;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
create table storage.buckets(id text primary key,name text,public bool,file_size_limit bigint);
create table storage.objects(id uuid default gen_random_uuid() primary key,bucket_id text,name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name,'/') $$;
grant usage on schema auth, storage, public to authenticated, service_role;
grant select, insert on storage.objects to authenticated;
insert into auth.users values ('${A}'),('${B}');
`);
const base = fs.readFileSync("docs/reel-jobs.sql","utf8");
await db.exec(base);
await db.exec("grant select,insert,update,delete on all tables in schema public to service_role;");
const v2 = fs.readFileSync("docs/reel-jobs-v2.patch.sql","utf8");
const mode = process.argv[2]||"v2";
if (mode==="v2") await db.exec(v2);
let pass=0, fail=0;
async function as(uid, sql, params){ await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${uid}',false)`); try { return await db.query(sql, params);} finally { await db.exec("reset role"); } }
async function expectErr(name, fn){ try{ await fn(); console.log("FAIL (no error):",name); fail++; }catch(e){ console.log("ok  blocked:",name,"-",String(e.message).slice(0,60)); pass++; } }
async function expectEq(name, got, want){ if(JSON.stringify(got)===JSON.stringify(want)){console.log("ok  ",name);pass++;}else{console.log("FAIL",name,JSON.stringify(got),"want",JSON.stringify(want));fail++;} }
const brief = JSON.stringify({topic:"t"});
const ins = await as(A,"insert into reel_jobs(user_id,brief_json) values ($1,$2) returning id",[A,brief]); const jobA = ins.rows[0].id;
await expectEq("A sees own job",(await as(A,"select id from reel_jobs")).rows.length,1);
await expectEq("B sees none",(await as(B,"select id from reel_jobs")).rows.length,0);
await expectErr("B inserts job as A",()=>as(B,"insert into reel_jobs(user_id,brief_json) values ($1,$2)",[A,brief]));
await expectErr("A inserts with status ready",()=>as(A,"insert into reel_jobs(user_id,brief_json,status) values ($1,$2,'ready')",[A,brief]));
await expectEq("B cancel A job affects 0 rows",(await as(B,"update reel_jobs set status='canceled' where id=$1 returning id",[jobA])).rows.length,0);
await expectErr("A sets own job ready",()=>as(A,"update reel_jobs set status='ready' where id=$1",[jobA]));
await expectErr("A edits result_video_path on own job",()=>as(A,"update reel_jobs set result_video_path='x/y.mp4' where id=$1",[jobA]));
await expectErr("A edits brief_json on own job",()=>as(A,"update reel_jobs set brief_json='{}' where id=$1",[jobA]));
await expectErr("A edits claimed_by",()=>as(A,"update reel_jobs set claimed_by='me' where id=$1",[jobA]));
await expectErr("A cancels AND writes result_video_path in one update",()=>as(A,"update reel_jobs set status='canceled', result_video_path='x/y.mp4', claimed_by='z' where id=$1",[jobA]));
await expectErr("A inserts job pointing source at B's file",()=>as(A,"insert into reel_jobs(user_id,brief_json,source_video_path) values ($1,$2,$3)",[A,brief,B+"/x/s.mp4"]));
await expectErr("A inserts job with preset result path",()=>as(A,"insert into reel_jobs(user_id,brief_json,result_video_path) values ($1,$2,$3)",[A,brief,A+"/x/r.mp4"]));
await expectErr("A inserts job with preset claimed_by",()=>as(A,"insert into reel_jobs(user_id,brief_json,claimed_by) values ($1,$2,'w')",[A,brief]));
{const id="33333333-3333-3333-3333-333333333333"; await as(A,"insert into reel_jobs(id,user_id,brief_json,source_video_path) values ($1,$2,$3,$4)",[id,A,brief,A+"/"+id+"/s.mp4"]); console.log("ok   A inserts job with own-folder source"); pass++;}
await expectErr("A deletes job",()=>as(A,"delete from reel_jobs where id=$1",[jobA]));
await expectErr("A writes events directly",()=>as(A,"insert into reel_job_events(job_id,status) values ($1,'ready')",[jobA]));
await expectErr("A inserts into results bucket",()=>as(A,"insert into storage.objects(bucket_id,name) values ('reel-results',$1)",[A+"/x/r.mp4"]));
await expectErr("A inserts source into B folder",()=>as(A,"insert into storage.objects(bucket_id,name) values ('reel-sources',$1)",[B+"/x/s.mp4"]));
await as(A,"insert into storage.objects(bucket_id,name) values ('reel-sources',$1)",[A+"/x/s.mp4"]); console.log("ok   A inserts own source"); pass++;
await expectEq("B cannot read A source",(await as(B,"select 1 from storage.objects")).rows.length,0);
await expectEq("A reads own source",(await as(A,"select 1 from storage.objects")).rows.length,1);
// server path
await db.exec("set role service_role");
const c = await db.query("update reel_jobs set status='claimed', claimed_at=now(), claimed_by='w1' where id=(select id from reel_jobs where status='submitted' order by created_at for update skip locked limit 1) returning id,status");
await expectEq("worker claims atomically",c.rows[0]?.status,"claimed");
const c2 = await db.query("update reel_jobs set status='claimed', claimed_by='w2' where id=(select id from reel_jobs where status='submitted' order by created_at for update skip locked limit 1) returning id");
await expectEq("second claim never returns the already-claimed job",c2.rows.every(r=>r.id!==c.rows[0].id),true);
await db.exec("reset role");
const upd = await as(A,"update reel_jobs set status='canceled' where id=$1 returning id",[jobA]);
await expectEq("A cancel after claim affects 0 rows",upd.rows.length,0);
const ev = (await as(A,"select status from reel_job_events where job_id=$1 order by id",[jobA])).rows.map(r=>r.status);
await expectEq("A sees event trail (needs trigger)",ev,["submitted","claimed"]);
await expectEq("B sees no events",(await as(B,"select 1 from reel_job_events")).rows.length,0);
console.log(`mode=${mode} pass=${pass} fail=${fail}`);
