// Operational secret provisioning, never imported by the app or client build.
import { randomBytes } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root=new URL("..",import.meta.url),file=new URL(".pawarna/owner-test-access.json",root);
await mkdir(new URL(".pawarna/",root),{recursive:true});
let access;
try{access=JSON.parse(await readFile(file,"utf8"));}catch(e){if(e.code!=="ENOENT")throw e;access={url:"https://pawarna-video-factory.ridzuantanix.workers.dev/owner-test",token:randomBytes(32).toString("hex"),created_at:new Date().toISOString()};await writeFile(file,JSON.stringify(access,null,2)+"\n",{flag:"wx",mode:0o600});}
if(!/^[a-f0-9]{64}$/.test(access.token))throw Error("Invalid private access file");
const result=spawnSync(process.execPath,[fileURLToPath(new URL("node_modules/wrangler/bin/wrangler.js",root)),"secret","put","PAWARNA_TEST_TOKEN"],{cwd:root,input:access.token,encoding:"utf8",windowsHide:true});
if(result.status!==0)throw Error("Secret provisioning failed; private file preserved for retry.");
console.log("Owner test secret provisioned. Access file remains private and Git-ignored; token not printed.");
