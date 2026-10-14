/** CI only: official DSH profile install, boot-free composition, no listener. */
import assert from 'node:assert/strict';
import {verifyDisabledProfileDelta} from './disabled-mcp-profile-contract.mjs';
import {readFile,readdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile),name='@wandora/deepharness-chatgpt-mcp-read';
assert.equal(process.env.DSH_MCP_INSTALL_PROOF,'true','disposable CI proof only');
assert.equal(process.env.DSH_HOME,'/data/dsh');
const artifacts='/opt/wandora-mcp-artifacts';
const files=(await readdir(artifacts)).filter(file=>file.endsWith('.tgz'));
assert.equal(files.length,1,'exactly one private artifact required');
const tarball=join(artifacts,files[0]),profile='/data/dsh/profiles/web';
const official=JSON.parse(await readFile('/opt/dsh/node_modules/@deepseek-ai/dsh/package.json','utf8'));
assert.equal(official.version,'0.2.1-alpha.2','official DSH version cannot silently change');
const yaml=createRequire('/opt/wandora-mcp-verifier/package.json')('js-yaml');
// Preserve !!js as inert text if a shipped config contains it; never evaluate.
const schema=yaml.JSON_SCHEMA.extend([new yaml.Type('tag:yaml.org,2002:js',{
  kind:'scalar',construct:value=>value,
})]);
const dump=async()=>{
  const result=await exec('dsh',['web','--dump-config'],{timeout:90000,maxBuffer:4*1024*1024});
  return yaml.load(result.stdout,{schema});
};
const rows=tree=>{
  const found=[],seen=new Set();
  const visit=value=>{
    if(!value||typeof value!=='object'||seen.has(value))return;
    seen.add(value);if(typeof value.id==='string')found.push(value);
    for(const child of Object.values(value))visit(child);
  };visit(tree);return found;
};
let phase='baseline';
try{
  const beforeTree=await dump(),before=rows(beforeTree);
  assert.equal(before.filter(row=>row.id==='wandora-chatgpt-mcp-read').length,0);
  phase='offline official install';
  await exec('dsh',['plugin','--profile','web','add','--offline','--ignore-scripts',tarball],
    {timeout:90000,maxBuffer:2*1024*1024});
  const manifest=JSON.parse(await readFile(join(profile,'package.json'),'utf8'));
  assert.ok(Object.hasOwn(manifest.dependencies,name));
  assert.ok(manifest.dsh.profile.bundles.includes(name),'official installer must recognize/select the bundle');
  phase='installed module';
  const resolve=createRequire(join(profile,'package.json'));
  const installed=JSON.parse(await readFile(resolve.resolve(name+'/package.json'),'utf8'));
  assert.equal(installed.version,'0.1.0-lab.3');
  assert.equal(installed.dsh.bundle.patch,'./cordis.patch.yml');
  const plugin=await import(pathToFileURL(resolve.resolve(name+'/plugin')).href);
  assert.equal(typeof plugin.apply,'function');
  assert.deepEqual(plugin.inject,['workspaceRegistry','sessions','sessionProjections','chatgptMcpReadPolicy']);
  phase='official composed profile';
  verifyDisabledProfileDelta(beforeTree,await dump());
  console.log('DSH_OFFICIAL_DISABLED_PROFILE_INSTALL_MATCH: offline official CLI + selected bundle + disabled composed row + unchanged existing services');
}catch{throw Error('DSH disabled profile installation proof failed at '+phase);}
