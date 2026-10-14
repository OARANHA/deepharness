import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {closePrivateWireResources} from './close-private-wire-resources.mjs';
test('failed proxy removal still closes live backend and removes private fixtures',async t=>{
  const root=await mkdtemp(join(tmpdir(),'dsh-wire-cleanup-')),http=createServer();
  t.after(async()=>{http.closeAllConnections();if(http.listening)await new Promise(r=>http.close(r));await rm(root,{recursive:true,force:true});});
  await writeFile(join(root,'private-fixture'),'test only',{mode:0o600});
  await new Promise(r=>http.listen(0,'127.0.0.1',r));
  const error=Error('simulated Docker removal failure');
  await assert.rejects(closePrivateWireResources({disposeHandler(){},closeProxy:async()=>{throw error;},http,root}),e=>e===error);
  assert.equal(http.listening,false);await assert.rejects(access(root),e=>e.code==='ENOENT');
});
