import assert from 'node:assert/strict';
const id='wandora-chatgpt-mcp-read';
export function verifyDisabledProfileDelta(before,after){
  let removed=0;
  const seen=new WeakMap();
  const copy=(value,inArray=false)=>{
    if(!value||typeof value!=='object')return value;
    if(value.id===id){
      assert.ok(inArray,'connector must be a composition array entry');
      assert.deepEqual(value,{id,name:'@wandora/deepharness-chatgpt-mcp-read/plugin',disabled:true,config:{endpointEnabled:false}});
      removed++;return undefined;
    }
    if(seen.has(value))return seen.get(value);
    const result=Array.isArray(value)?[]:{};seen.set(value,result);
    if(Array.isArray(value)){
      for(const child of value){
        const cloned=copy(child,true);
        if(child&&typeof child==='object'&&child.id===id)continue;
        result.push(cloned);
      }
    }else for(const [key,child] of Object.entries(value))result[key]=copy(child);
    return result;
  };
  const baselineHasConnector=value=>{
    const visited=new WeakSet();
    const visit=item=>{
      if(!item||typeof item!=='object'||visited.has(item))return false;
      visited.add(item);
      return item.id===id||Object.values(item).some(visit);
    };return visit(value);
  };
  assert.equal(baselineHasConnector(before),false);
  const restored=copy(after);
  assert.equal(removed,1,'exactly one connector insertion required');
  assert.deepEqual(restored,before,'entire existing composition must remain unchanged');
}
