/** CI-only contract: Stage C Web requires approved private runtime; never activate production. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateOperationalHostConfig} from './operational-host.mjs';
const file=new URL('./runtime.review.json',import.meta.url);
test('review runtime stays disabled and refuses operational boot',async()=>{
 const review=JSON.parse(await readFile(file,'utf8'));
 assert.equal(review.enabled,false);
 assert.throws(()=>validateOperationalHostConfig(review),/disabled or invalid/);
});
test('strict, in-memory private-only schema can be validated without starting host',async()=>{
 const review=JSON.parse(await readFile(file,'utf8'));
 const privateCandidate={...review,enabled:true};
 const validated=validateOperationalHostConfig(privateCandidate);
 assert.equal(validated.enabled,true);
 assert.equal(validated.backendPort,3443);
 assert.deepEqual(validated.allowedOrigins,review.allowedOrigins);
 assert.ok(Object.isFrozen(validated));
 assert.throws(()=>validateOperationalHostConfig({...privateCandidate,grant:'*'}),/disabled or invalid/);
 assert.throws(()=>validateOperationalHostConfig({...privateCandidate,resource:'http://localhost/mcp'}),/disabled or invalid/);
 assert.equal(review.enabled,false);
});
