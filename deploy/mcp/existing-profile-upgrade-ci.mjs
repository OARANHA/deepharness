/** Lab-only official CLI proof. NEVER point this at the real Web home. */
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,readdir,mkdir,rm,realpath} from 'node:fs/promises';
import {serialize,deserialize} from 'node:v8';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createRequire} from 'node:module';
import {verifyExistingProfileUpgrade} from './upgrade-existing-profile-contract.mjs';
import {verifyPackedInstall} from './verify-packed-install.mjs';
const exec=promisify(execFile),name='@wandora/deepharness-chatgpt-mcp-read';
assert.equal(process.env.DSH_MCP_UPGRADE_CI,'disposable-official-cli-only');
assert.equal(process.getuid(),1000);
const mode=process.argv[2];assert.ok(['prepare','upgrade'].includes(mode));
const stateFile='/fixture/state.bin';
const state=mode==='upgrade'?deserialize(await readFile(stateFile)):undefined;
const home=mode==='prepare'?await mkdtemp('/fixture/stage-d-upgrade-'):state.home;
assert.match(home,/^\/fixture\/stage-d-upgrade-[a-zA-Z0-9]+$/);
assert.equal(await realpath(home),home);
const profile=join(home,'profiles/web');
const env={...process.env,HOME:home,DSH_HOME:home,NPM_CONFIG_CACHE:join(home,'cache'),
  NPM_CONFIG_PREFIX:join(home,'prefix'),XDG_CACHE_HOME:join(home,'cache'),COREPACK_ENABLE_DOWNLOAD_PROMPT:'0'};
const yaml=createRequire('/opt/wandora-mcp-verifier/package.json')('js-yaml');
const schema=yaml.JSON_SCHEMA.extend([new yaml.Type('tag:yaml.org,2002:js',{kind:'scalar',construct:x=>x})]);
let phase='fixture bootstrap';
const run=async args=>(await exec('dsh',args,{env,cwd:home,timeout:180000,maxBuffer:8*1024*1024})).stdout;
try{
  const oldFiles=(await readdir('/opt/wandora-mcp-previous')).filter(x=>x.endsWith('.tgz'));
  assert.equal(oldFiles.length,1);
  const oldTar='/opt/wandora-mcp-previous/'+oldFiles[0];
  const proof=JSON.parse(await readFile('/opt/wandora-mcp-artifacts/packed-files.json','utf8'));
  const expectedVersion=proof.packageVersion;
  assert.match(expectedVersion,/^0\.1\.0-lab\.[0-9]+$/);
  const newTar='/opt/wandora-mcp-artifacts/'+proof.tarball;
  const snapshot=async()=>({
    manifest:JSON.parse(await readFile(join(profile,'package.json'),'utf8')),
    version:createRequire(join(profile,'package.json'))(name+'/package.json').version,
    userPatch:await readFile(join(profile,'cordis.patch.yml'),'utf8'),
    homePatch:await readFile(join(home,'cordis.patch.yml'),'utf8'),
    composition:yaml.load(await run(['web','--dump-config']),{schema}),
    lock:yaml.load(await readFile(join(profile,'pnpm-lock.yaml'),'utf8'),{schema}),
  });
  if(mode==='prepare'){
    await run(['web','--dump-config']);
    // Only fixture setup may fetch public dependencies; no production mounts.
    await run(['plugin','--profile','web','add','--ignore-scripts',
      '@deepseek-ai/dsh-experimental-agent-team-profile@0.2.1-alpha.2',oldTar]);
    await mkdir(profile,{recursive:true});
    const patch=id=>`- insert:\n    - id: ${id}\n      name: '${name}/plugin'\n      disabled: true\n      config:\n        endpointEnabled: false\n`;
    await writeFile(join(profile,'cordis.patch.yml'),patch('user-patch-preservation-fixture'));
    await writeFile(join(home,'cordis.patch.yml'),patch('home-patch-preservation-fixture'));
    phase='baseline';const before=await snapshot();
    assert.equal(before.version,'0.1.0-lab.4');
    assert.ok(before.manifest.dsh.profile.bundles.includes('@deepseek-ai/dsh-experimental-agent-team-profile'));
    await writeFile(stateFile,serialize({home,before,expectedVersion}),{flag:'wx'});
    console.log('EXISTING_PROFILE_UPGRADE_FIXTURE_PREPARED');
  }else{
    phase='official offline upgrade';
    // Workflow runs this second container with --network none.
    await run(['plugin','--profile','web','add','--offline','--ignore-scripts',newTar]);
    phase='preservation';const after=await snapshot();
    verifyExistingProfileUpgrade(state.before,after,state.expectedVersion);
    await verifyPackedInstall(join(profile,'node_modules',name),'/opt/wandora-mcp-artifacts/packed-files.json');
    console.log('EXISTING_PROFILE_LAB4_LAB5_OFFICIAL_UPGRADE_MATCH');
  }
}catch(error){
  console.error('Disposable existing-profile upgrade denied at '+phase);process.exitCode=1;
  const diagnostic=String(error.stderr??error.message??'').split('\n').slice(0,12)
    .map(line=>/token|password|secret|cookie|authorization/i.test(line)?'[redacted]':line.replace(/https?:\/\/\S+/g,'[url]'))
    .join('\n').slice(0,1600);
  console.error(diagnostic);
}finally{if(mode==='upgrade'||process.exitCode===1)await rm(home,{recursive:true,force:true});}
