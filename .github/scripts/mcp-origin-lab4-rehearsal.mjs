/**
 * Synthetic isolated proof for replacing exactly one MCP handler using the official DSH CLI.
 * CI-owned /fixture only. Never point HOME/DSH_HOME to a persistent Web profile.
 * prepare: creates synthetic lab.4 profile using old frozen tarball.
 * verify:  --network none, re-adds corrected lab.4 tarball and checks preservation.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createRequire} from 'node:module';
import {join} from 'node:path';

const exec=promisify(execFile);
const name='@wandora/deepharness-chatgpt-mcp-read';
const oldBlob='7b19d33431ccd0d24af09556e55fc773f2b888a5';
const newBlob='1e98882f9d78a765a2b267425c298cfdcbce0393';
const tarHash='73756d0bbe9f6fa90aafdcb00fb05b459e4e9db380c0e2d64ea78578b63f04d6';
const home='/fixture/home',profile=home+'/profiles/web',installed=profile+'/node_modules/'+name;
const pkgPath='adapters/private-mcp-http-handler.mjs';
const mode=process.argv[2];
assert.ok(['prepare','verify'].includes(mode));
assert.equal(process.getuid(),1000);
assert.equal(process.env.DSH_MCP_ORIGIN_CI,'isolated-fixture-only');
assert.equal(process.env.HOME,home);
assert.equal(process.env.DSH_HOME,home);
assert.equal(fs.realpathSync('/fixture'),'/fixture');
const yaml=createRequire('/opt/wandora-mcp-verifier/package.json')('js-yaml');
const schema=yaml.JSON_SCHEMA.extend([new yaml.Type('tag:yaml.org,2002:js',{kind:'scalar',construct:x=>x})]);
const env={...process.env,NPM_CONFIG_CACHE:join(home,'cache'),NPM_CONFIG_PREFIX:join(home,'prefix'),XDG_CACHE_HOME:join(home,'cache'),COREPACK_ENABLE_DOWNLOAD_PROMPT:'0'};
const run=async args=>(await exec('dsh',args,{cwd:home,env,timeout:240000,maxBuffer:8*1024*1024})).stdout;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const blob=bytes=>createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');
const load=path=>fs.readFileSync(path,'utf8');
const yload=path=>yaml.load(load(path),{schema});
function packageHashes(root){
  const out={};
  function walk(folder,rel=''){
    for(const entry of fs.readdirSync(folder,{withFileTypes:true})){
      const file=join(folder,entry.name),key=rel?rel+'/'+entry.name:entry.name;
      assert.ok(entry.isFile()||entry.isDirectory(),'Package symlinks and devices denied');
      if(entry.isDirectory())walk(file,key);
      else out[key]=hash(fs.readFileSync(file));
    }
  }
  walk(root);
  return out;
}
function normalizeManifest(value){
  const v=structuredClone(value);
  assert.ok(v.dsh?.profile?.bundles?.includes(name));
  assert.match(v.dependencies?.[name]??'',/^file:.*\.tgz$/);
  v.dependencies[name]='<verified-tarball>';
  return v;
}
function normalizeLock(value){
  const v=structuredClone(value);
  const e=v.importers?.['.']?.dependencies?.[name];
  assert.equal(typeof e?.specifier,'string');
  assert.equal(typeof e?.version,'string');
  for(const section of ['packages','snapshots']){
    for(const key of Object.keys(v[section]??{})){
      if(key.startsWith(name+'@')||key===e.version||key===e.specifier)delete v[section][key];
    }
  }
  v.importers['.'].dependencies[name]={specifier:'<verified-tarball>',version:'<verified-tarball>'};
  return v;
}
function checkDisabled(composition){
  let n=0,visited=new WeakSet();
  const visit=v=>{
    if(!v||typeof v!=='object'||visited.has(v))return;
    visited.add(v);
    if(v.id==='wandora-chatgpt-mcp-read'){
      assert.equal(v.name,name+'/plugin');
      assert.equal(v.disabled,true);
      assert.equal(v.config?.endpointEnabled,false);
      n++;
    }
    for(const x of Object.values(v))visit(x);
  };
  visit(composition);
  assert.equal(n,1,'Disabled MCP must remain exactly once');
}
async function snapshot(){
  const result={
    manifest:JSON.parse(load(profile+'/package.json')),
    lock:yload(profile+'/pnpm-lock.yaml'),
    patch:load(profile+'/cordis.patch.yml'),
    version:JSON.parse(load(installed+'/package.json')).version,
    composition:yaml.load(await run(['web','--dump-config']),{schema}),
    packageHashes:packageHashes(installed),
  };
  assert.equal(result.version,'0.1.0-lab.4');
  assert.equal(fs.lstatSync(installed).isSymbolicLink(),false);
  assert.equal(fs.realpathSync(installed),installed);
  checkDisabled(result.composition);
  return result;
}
let phase='preconditions';
try {
  if(mode==='prepare'){
    assert.equal(fs.existsSync(home),false,'New disposable home only');
    fs.mkdirSync(home,{recursive:true});
    phase='official bootstrap';
    await run(['web','--dump-config']);
    const dir='/opt/wandora-mcp-artifacts';
    const old=fs.readdirSync(dir).filter(x=>x.endsWith('.tgz'));
    assert.equal(old.length,1,'Exactly one frozen lab4 tarball required');
    const tar=dir+'/'+old[0];
    const details=JSON.parse((await exec('tar',['-xOzf',tar,'package/package.json'],{maxBuffer:100000})).stdout);
    assert.equal(details.version,'0.1.0-lab.4');
    await run(['plugin','--profile','web','add','--ignore-scripts',
      '@deepseek-ai/dsh-experimental-agent-team-profile@0.2.1-alpha.2',tar]);
    fs.writeFileSync(profile+'/cordis.patch.yml',
      '- insert:\n    - id: user-patch-preservation-fixture\n      name: \''+name+'/plugin\'\n      disabled: true\n      config:\n        endpointEnabled: false\n');
    phase='baseline';
    const before=await snapshot();
    assert.equal(blob(fs.readFileSync(installed+'/'+pkgPath)),oldBlob,'Wrong baseline');
    assert.equal(fs.existsSync(home+'/cordis.patch.yml'),false);
    fs.writeFileSync('/fixture/baseline.json',JSON.stringify(before),{flag:'wx',mode:0o600});
    console.log('ORIGIN_LAB4_DISPOSABLE_BASELINE_GREEN');
  } else {
    assert.equal(fs.existsSync('/fixture/baseline.json'),true);
    assert.equal(fs.existsSync(home+'/cordis.patch.yml'),false);
    const archive='/fixture/review/hotfix.tgz';
    assert.equal(hash(fs.readFileSync(archive)),tarHash,'Unverified hotfix');
    const before=JSON.parse(load('/fixture/baseline.json'));
    assert.equal(blob(fs.readFileSync(installed+'/'+pkgPath)),oldBlob);
    phase='official offline same-version replacement';
    await run(['plugin','--profile','web','add','--offline','--ignore-scripts',archive]);
    phase='preservation';
    const after=await snapshot();
    assert.deepEqual(normalizeManifest(before.manifest),normalizeManifest(after.manifest));
    assert.deepEqual(normalizeLock(before.lock),normalizeLock(after.lock));
    assert.equal(after.patch,before.patch);
    assert.deepEqual(after.composition,before.composition);
    assert.equal(fs.existsSync(home+'/cordis.patch.yml'),false);
    assert.equal(blob(fs.readFileSync(installed+'/'+pkgPath)),newBlob);
    const originalHashes=structuredClone(before.packageHashes);
    const finalHashes=structuredClone(after.packageHashes);
    assert.ok(originalHashes[pkgPath]!==finalHashes[pkgPath]);
    delete originalHashes[pkgPath];delete finalHashes[pkgPath];
    assert.deepEqual(originalHashes,finalHashes,'Unrelated package bytes changed');
    console.log('ORIGIN_LAB4_SAME_VERSION_OFFLINE_REHEARSAL_GREEN');
  }
}catch{
  console.error('ORIGIN_LAB4_REHEARSAL_DENIED phase='+phase);
  process.exitCode=1;
}
