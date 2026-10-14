import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareOfficialDshTeamRead} from '../adapters/prepare-official-dsh-team-read.mjs';
const services = {
  workspaceRegistry: {get:()=>undefined},
  sessionProjections: {snapshot:()=>undefined},
  resolveLiveLeadSession: async()=>undefined,
  authenticateTransport: async()=>({principalId:'id#sub',kind:'individual'}),
  grants: [], allowedOrigins:['http://127.0.0.1:18081'],
};
test('official host composition denies incomplete services and exports no grant writes or listener', async()=>{
  for(const key of ['workspaceRegistry','sessionProjections','resolveLiveLeadSession','authenticateTransport']){
    assert.throws(()=>prepareOfficialDshTeamRead({...services,[key]:undefined}),/denied/);
  }
  const binding=prepareOfficialDshTeamRead(services);
  assert.deepEqual(Object.keys(binding).sort(),['readTeam','runHttpRequest']);
  await assert.rejects(binding.readTeam({workspaceId:'ws',leadSessionId:'lead'}),/denied/);
});
