import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('private rehearsal refuses ordinary execution before reading a profile',()=>{
  const result=spawnSync(process.execPath,[fileURLToPath(new URL('./private-profile-rehearsal.mjs',import.meta.url))],{
    env:{...process.env,DSH_MCP_PRIVATE_REHEARSAL:''},encoding:'utf8',timeout:5000,
  });
  assert.equal(result.status,1);
  assert.equal(result.stdout,'');
  assert.match(result.stderr,/^PRIVATE_PROFILE_REHEARSAL_DENIED guard\n$/);
});
