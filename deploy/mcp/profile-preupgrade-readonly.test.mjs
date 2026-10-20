import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import * as path from "node:path";
import vm from "node:vm";
import {fileURLToPath} from "node:url";

const sourcePath=fileURLToPath(new URL("./profile-preupgrade-readonly.review.sh",import.meta.url));
const source=readFileSync(sourcePath,"utf8");
const start=source.indexOf("<<'NODE'\n"),end=source.lastIndexOf("\nNODE\n");
assert.ok(start>=0&&end>start);
const body=source.slice(start+"<<'NODE'\n".length,end);
const root="/data/dsh/profiles/web";
const pkgDir=root+"/node_modules/@wandora/deepharness-chatgpt-mcp-read";

function fixture(overrides={}){
  const files=new Map([
    [pkgDir+"/package.json",JSON.stringify({version:"0.1.0-lab.4",exports:{},privateToken:"MUST_NOT_LEAK"})],
    [root+"/package.json",JSON.stringify({dsh:{profile:{bundles:["@deepseek-ai/dsh-experimental-agent-team-profile"]}},password:"MUST_NOT_LEAK"})],
    [root+"/pnpm-lock.yaml","private-lock-contents MUST_NOT_LEAK\n"],
    [root+"/cordis.patch.yml",'- insert:\n    - id: wandora-chatgpt-mcp-read\n      name: "@wandora/deepharness-chatgpt-mcp-read/plugin"\n      disabled: true\n      config:\n        endpointEnabled: false\n'],
    ["/opt/dsh/node_modules/@deepseek-ai/dsh/package.json",JSON.stringify({version:"0.2.1-alpha.2"})],
    ["/opt/wandora-mcp-verifier/mcp/operational-host.mjs","const value = 0;\n"],
    ["/etc/wandora-mcp/runtime.json",JSON.stringify({enabled:true,backendPort:3443})]
  ]);
  for(const [p,v] of Object.entries(overrides)) {
    if(v===null)files.delete(p);else files.set(p,v);
  }
  const fsMock={
    readFileSync(file){if(!files.has(file))throw Error("ENOENT");return Buffer.from(files.get(file));},
    statSync(file){if(!files.has(file))throw Error("ENOENT");return {isFile:()=>true};}
  };
  const entries=[];
  const runProcess={getuid:()=>1000,exitCode:0};
  vm.runInNewContext(body,{
    require(name){
      if(name==="node:fs")return fsMock;
      if(name==="node:crypto")return {createHash};
      if(name==="node:path")return path;
      throw Error("unknown module");
    },
    Buffer,process:runProcess,console:{log:(...x)=>entries.push(x.join(" "))}
  },{timeout:1500});
  return {entries,text:entries.join("\n"),process:runProcess};
}
test("shell grammar and Node stdin syntax are valid",()=>{
  const b=spawnSync("bash",["-n",sourcePath],{encoding:"utf8"});
  assert.equal(b.status,0,b.stderr);
  const n=spawnSync(process.execPath,["--check","--input-type=commonjs","-"],
    {input:body,encoding:"utf8"});
  assert.equal(n.status,0,n.stderr);
});
test("script cannot start Docker/Portainer, runs nonroot inside fixed container",()=>{
  assert.match(source,/docker exec -i --user 1000:1000 deepharness-web-1/);
  assert.match(source,/hostname -s/);
  assert.doesNotMatch(source,/\bdocker\s+(?:run|cp|load|tag|push|create|compose|restart|stop)\b/);
  assert.doesNotMatch(body,/\b(?:writeFile|mkdir|execFile|spawn|fetch|https|http|unlink|rename)\b/);
});
test("lab.4 baseline is reported read-only, no secrets ever printed",()=>{
  const r=fixture();
  assert.match(r.text,/DSH_PROFILE_VERSION=0\.1\.0-lab\.4/);
  assert.match(r.text,/DSH_OFFICIAL_DSH_VERSION=0\.2\.1-alpha\.2/);
  assert.match(r.text,/DSH_PROFILE_PLUGIN_DISABLED=YES/);
  assert.match(r.text,/DSH_PROFILE_HANDLER=ABSENT/);
  assert.match(r.text,/DSH_PROFILE_OPERATIONAL_HOST_SEMANTIC=ABSENT/);
  assert.match(r.text,/DSH_PROFILE_SEMANTIC_ROUTE=ABSENT/);
  assert.match(r.text,/DSH_PROFILE_LOCK_SHA256=[a-f0-9]{64}/);
  assert.match(r.text,/DSH_PROFILE_BACKUP=NOT_PERFORMED/);
  assert.match(r.text,/DSH_PROFILE_UPGRADE=NOT_PERFORMED/);
  assert.match(r.text,/DSH_PREUPGRADE_PREFLIGHT=READ_ONLY_COMPLETE/);
  assert.doesNotMatch(r.text,/MUST_NOT_LEAK|private-lock-contents/);
});
test("missing plugin and invalid runtime fail closed as unproven inventory",()=>{
  const r=fixture({[pkgDir+"/package.json"]:null,
    "/etc/wandora-mcp/runtime.json":"not-json"});
  assert.match(r.text,/DSH_PROFILE_VERSION=UNKNOWN/);
  assert.match(r.text,/DSH_PROFILE_HANDLER=ABSENT/);
  assert.match(r.text,/DSH_PROFILE_SEMANTIC_ROUTE=UNKNOWN/);
});
test("lab.7 is recognized and semantic handler source files are checked",()=>{
  const r=fixture({
    [pkgDir+"/package.json"]:JSON.stringify({
      version:"0.1.0-lab.7",
      exports:{"./private-semantic-http-handler":"./adapters/private-semantic-http-handler.mjs"}
    }),
    [pkgDir+"/adapters/private-semantic-http-handler.mjs"]:"export const safe=true;",
    "/opt/wandora-mcp-verifier/mcp/operational-host.mjs":
      "semanticBridge: true; createSemanticHttpHandler: true"
  });
  assert.match(r.text,/DSH_PROFILE_VERSION=0\.1\.0-lab\.7/);
  assert.match(r.text,/DSH_PROFILE_HANDLER=PRESENT/);
  assert.match(r.text,/DSH_PROFILE_OPERATIONAL_HOST_SEMANTIC=PRESENT/);
});
test("semantic enabled state is surfaced but never toggled",()=>{
  const r=fixture({"/etc/wandora-mcp/runtime.json":JSON.stringify({
    enabled:true,semanticBridge:{enabled:true,clientFingerprintSha256:"MUST_NOT_LEAK"}
  })});
  assert.match(r.text,/DSH_PROFILE_SEMANTIC_ROUTE=ENABLED/);
  assert.doesNotMatch(r.text,/MUST_NOT_LEAK/);
});
