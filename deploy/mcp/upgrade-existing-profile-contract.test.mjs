import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyExistingProfileUpgrade} from './upgrade-existing-profile-contract.mjs';
const name='@wandora/deepharness-chatgpt-mcp-read';
const snapshot=version=>({version,
  manifest:{private:true,dependencies:{unrelated:'1.0.0',[name]:'file:'+version+'.tgz'},
    dsh:{profile:{bundles:['base',name,'team']}}},
  userPatch:'unchanged-user',homePatch:'unchanged-home',
  composition:[{id:'unrelated'},{id:'wandora-chatgpt-mcp-read',name:name+'/plugin',disabled:true,config:{endpointEnabled:false}}],
  lock:{importers:{'.':{dependencies:{unrelated:{specifier:'1.0.0',version:'1.0.0'},
    [name]:{specifier:'file:'+version+'.tgz',version:'file:'+version+'.tgz'}}}},
    packages:{'unrelated@1.0.0':{},[name+'@file:'+version+'.tgz']:{resolution:{integrity:version}}},
    snapshots:{'unrelated@1.0.0':{},[name+'@file:'+version+'.tgz']:{}}},
});
test('only existing lab4 to lab5 dependency may change; bundle/config/lock remain exact',()=>{
  const before=snapshot('0.1.0-lab.4'),after=snapshot('0.1.0-lab.5');
  assert.equal(verifyExistingProfileUpgrade(before,after),true);
  for(const mutate of [
    x=>{x.manifest.dsh.profile.bundles.reverse();},x=>{x.manifest.dependencies.unrelated='2.0.0';},
    x=>{x.userPatch='modified';},x=>{x.homePatch='modified';},
    x=>{x.composition[1].disabled=false;},x=>{x.composition[1].config.endpointEnabled=true;},
    x=>{x.lock.packages['unrelated@1.0.0']={modified:true};},x=>{x.lock.importers.other={};},
    x=>{x.version='0.1.0-lab.6';},
  ]){
    const changed=structuredClone(after);mutate(changed);
    assert.throws(()=>verifyExistingProfileUpgrade(before,changed));
  }
  const missing=structuredClone(before);missing.manifest.dsh.profile.bundles=[];
  assert.throws(()=>verifyExistingProfileUpgrade(missing,after));
});

test('accepts the exact newly packed lab version while preserving all profile state',()=>{
  const before=snapshot('0.1.0-lab.4'),after=snapshot('0.1.0-lab.7');
  assert.equal(verifyExistingProfileUpgrade(before,after,'0.1.0-lab.7'),true);
  assert.throws(()=>verifyExistingProfileUpgrade(before,after,'0.1.0-lab.6'));
});
