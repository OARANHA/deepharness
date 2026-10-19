/** Pure upgrade acceptance; never installs or mutates a profile. */
import assert from 'node:assert/strict';
const name='@wandora/deepharness-chatgpt-mcp-read';
function manifest(value){
  const out=structuredClone(value);
  assert.equal(out.dsh.profile.bundles.filter(x=>x===name).length,1);
  assert.match(out.dependencies[name],/^file:[^\r\n]+\.tgz$/);
  out.dependencies[name]='<reviewed-mcp-tarball>';
  return out;
}
function lock(value){
  const out=structuredClone(value),entry=out.importers['.'].dependencies[name];
  assert.equal(typeof entry.specifier,'string');assert.equal(typeof entry.version,'string');
  for(const section of ['packages','snapshots']){
    if(!out[section])continue;
    for(const key of Object.keys(out[section])){
      if(key.startsWith(name+'@')||key===entry.version||key===entry.specifier)delete out[section][key];
    }
  }
  out.importers['.'].dependencies[name]={specifier:'<reviewed-mcp-tarball>',version:'<reviewed-mcp-tarball>'};
  return out;
}
function disabled(value){
  let count=0;const visited=new WeakSet();
  const visit=x=>{
    if(!x||typeof x!=='object'||visited.has(x))return;
    visited.add(x);
    if(x.id==='wandora-chatgpt-mcp-read'){
      assert.deepEqual(x,{id:x.id,name:name+'/plugin',disabled:true,config:{endpointEnabled:false}});count++;
    }
    for(const child of Object.values(x))visit(child);
  };
  visit(value);assert.equal(count,1);
}
export function verifyExistingProfileUpgrade(before,after,expectedVersion='0.1.0-lab.5'){
  assert.equal(before.version,'0.1.0-lab.4');assert.match(expectedVersion,/^0\.1\.0-lab\.[0-9]+$/);
  assert.equal(after.version,expectedVersion);
  assert.notEqual(before.manifest.dependencies[name],after.manifest.dependencies[name]);
  assert.deepEqual(manifest(before.manifest),manifest(after.manifest));
  assert.deepEqual(before.userPatch,after.userPatch);assert.deepEqual(before.homePatch,after.homePatch);
  disabled(before.composition);disabled(after.composition);
  assert.deepEqual(before.composition,after.composition);
  assert.deepEqual(lock(before.lock),lock(after.lock));
  return true;
}
