import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyDisabledProfileDelta} from './disabled-mcp-profile-contract.mjs';
const baseline={plugins:[{id:'existing',name:'official',disabled:false,config:{port:3080}}]};
const row={id:'wandora-chatgpt-mcp-read',name:'@wandora/deepharness-chatgpt-mcp-read/plugin',disabled:true,config:{endpointEnabled:false}};
test('only exact disabled insertion passes',()=>verifyDisabledProfileDelta(baseline,{plugins:[...baseline.plugins,row]}));
for(const field of ['name','disabled','config']){
 test('changed existing '+field+' denied',()=>{
 const changed=structuredClone(baseline);changed.plugins[0][field]=field==='config'?{port:9000}:field==='disabled'?true:'other';
 changed.plugins.push(row);assert.throws(()=>verifyDisabledProfileDelta(baseline,changed));
 });
}
test('anonymous addition denied',()=>assert.throws(()=>verifyDisabledProfileDelta(baseline,{plugins:[...baseline.plugins,row,{config:{extra:true}}]})));
test('enabled connector denied',()=>assert.throws(()=>verifyDisabledProfileDelta(baseline,{plugins:[...baseline.plugins,{...row,disabled:false}]})));
test('duplicate connector denied',()=>assert.throws(()=>verifyDisabledProfileDelta(baseline,{plugins:[...baseline.plugins,row,row]})));
test('extra connector field denied',()=>assert.throws(()=>verifyDisabledProfileDelta(baseline,{plugins:[...baseline.plugins,{...row,extra:true}]})));
