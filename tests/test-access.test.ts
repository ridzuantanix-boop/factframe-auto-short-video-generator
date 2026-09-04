import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { TestAccess, evaluation, SCORE_FIELDS, testLimit } from "../cloud/test-access";
import type { Env } from "../cloud/worker";
import type { CloudJob } from "../cloud/utils";
import { publicJob } from "../cloud/utils";

test("evaluation scores validate 1–5, nullable irrelevant controls and bounded notes",()=>{
  assert.equal(Object.keys(evaluation({})).length,SCORE_FIELDS.length+1);
  assert.equal(evaluation({overall:5,notes:"Clear"}).overall,5);
  for(const overall of [0,6,1.5,"5",true])assert.throws(()=>evaluation({overall}));
  assert.throws(()=>evaluation({notes:"a".repeat(4001)}));
  for(const value of ["", "11","-1","NaN"])assert.equal(testLimit({PAWARNA_TEST_MAX_GENERATIONS:value}),0);
});
test("durable cap, reservations, revoked sessions and double claim fail closed",async()=>{
  const db=new DatabaseSync(":memory:");
  const sql={exec:(query:string,...args:(string|number)[])=>{
    const stmt=db.prepare(query);if(!stmt.columns().length){stmt.run(...args);return {toArray:()=>[],one:()=>undefined};}
    const rows=stmt.all(...args);return {toArray:()=>rows,one:()=>rows[0]};
  }};
  // TestAccess constructor uses multi-statement DDL; preserve SQLite's real transactional semantics.
  const original=sql.exec;sql.exec=(query,...args)=>query.trim().startsWith("CREATE")?(db.exec(query),{toArray:()=>[],one:()=>undefined}):original(query,...args);
  const ctx={storage:{sql}} as unknown as DurableObjectState;
  db.exec("CREATE TABLE jobs(id TEXT PRIMARY KEY, owner TEXT, stage TEXT, data TEXT)");
  const env={PAWARNA_TEST_TOKEN:"unit-test-secret-not-production-0000",PAWARNA_TEST_GENERATION_ENABLED:"true",PAWARNA_TEST_MAX_GENERATIONS:"2"} as Env;
  let access=new TestAccess(ctx,env);const epoch=await access.epoch();
  assert.equal(await access.authorized("owner"),false);
  db.prepare("INSERT INTO test_sessions VALUES(?,?,?,?)").run("owner",epoch,Date.now()+100000,"proof");
  assert.equal(await access.authorized("owner",undefined,"wrong"),false);
  assert.equal(await access.authorized("owner",undefined,"proof"),true);
  assert.equal(await access.authorized("owner"),true);
  const first={id:"a",owner:"owner",stage:"queued",provider_requests:[],controlled_test:access.reserve(epoch)} as unknown as CloudJob;
  db.prepare("INSERT INTO jobs VALUES(?,?,?,?)").run(first.id,first.owner,first.stage,JSON.stringify(first));
  const second={...first,id:"b",controlled_test:access.reserve(epoch)};
  db.prepare("INSERT INTO jobs VALUES(?,?,?,?)").run(second.id,second.owner,second.stage,JSON.stringify(second));
  assert.equal(access.available(),0);assert.throws(()=>access.reserve(epoch));
  access.claim(first,epoch);first.provider_requests.push({at:Date.now(),status:"failed",cost:0});first.stage="failed";
  db.prepare("UPDATE jobs SET stage=?,data=? WHERE id=?").run(first.stage,JSON.stringify(first),first.id);
  assert.throws(()=>access.claim(first,epoch));assert.equal(access.count("attempts"),1);
  access.claim(second,epoch);second.provider_requests.push({at:Date.now(),status:"uncertain",cost:0});second.stage="failed";
  db.prepare("UPDATE jobs SET stage=?,data=? WHERE id=?").run(second.stage,JSON.stringify(second),second.id);
  access=new TestAccess(ctx,env);assert.equal(access.count("attempts"),2);assert.equal(access.available(),0);
  assert.throws(()=>access.reserve(epoch));
  env.PAWARNA_TEST_TOKEN="rotated-test-secret-not-production-000";assert.equal(await access.authorized("owner",epoch),false);
  const publicData=JSON.stringify(publicJob({...first,image_count:1,has_avatar:false}));assert.ok(!publicData.includes(epoch));assert.ok(!publicData.includes("controlled_test"));
  db.close();
});
