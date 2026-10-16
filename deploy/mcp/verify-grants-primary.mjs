/** Disposable CI only: validate actual role boundaries and persisted DB restart. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
if(process.env.GITHUB_ACTIONS!=='true')throw Error('Disposable CI only');
const image=process.argv[2];if(!/^local\/deepharness-grants:ci$/.test(image??''))throw Error('CI image required');
const suffix=process.env.GITHUB_RUN_ID+'-'+process.env.GITHUB_RUN_ATTEMPT;
if(!/^[0-9]+-[0-9]+$/.test(suffix))throw Error('CI run identity required');
const name='dsh-grants-ci-'+suffix,volume=name+'-data';
const root=await mkdtemp(join(tmpdir(),'dsh-grants-ci-'));
const admin='a'.repeat(64),reader='b'.repeat(64); // Disposable known fixtures, not operational credentials.
const docker=args=>execFileSync('docker',args,{encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe']});
let phase='files';
const query=(role,sql)=>docker(['exec','-e','PGPASSWORD='+(role==='dsh_mcp_reader'?reader:admin),name,
  'psql','-X','-h','127.0.0.1','-U',role,'-d','dsh_mcp_grants','-v','ON_ERROR_STOP=1','-At','-c',sql]);
const healthy=()=>assert.equal(query('dsh_mcp_reader','SELECT count(*) FROM public.chatgpt_mcp_read_grants;').trim(),'0');
const wait=async()=>{
  for(let i=0;i<60;i++){
    try{healthy();return;}catch{}
    if(docker(['inspect','--format','{{.State.Status}}',name]).trim()!=='running')throw Error('CI primary exited');
    await delay(500);
  }throw Error('CI primary not ready');
};
const start=()=>docker(['run','-d','--name',name,'--network','none','--read-only','--cap-drop','ALL',
  '--security-opt','no-new-privileges','--memory','256m','--cpus','0.5','--pids-limit','128',
  '--tmpfs','/var/run/postgresql:rw,nosuid,nodev,noexec,size=8m,mode=0770,uid=999,gid=999',
  '--tmpfs','/tmp:rw,nosuid,nodev,noexec,size=16m,mode=1777',
  '--mount','type=volume,src='+volume+',dst=/var/lib/postgresql/data',
  '--mount','type=bind,src='+join(root,'admin')+',dst=/run/secrets/mcp-admin-db-password,readonly',
  '--mount','type=bind,src='+join(root,'reader')+',dst=/run/secrets/mcp-runtime-db-password,readonly',
  '-e','POSTGRES_DB=dsh_mcp_grants','-e','POSTGRES_USER=dsh_mcp_owner',
  '-e','POSTGRES_PASSWORD_FILE=/run/secrets/mcp-admin-db-password','-e','POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256',
  image,'postgres','-c','max_connections=20','-c','shared_buffers=32MB','-c','password_encryption=scram-sha-256']);
try {
  await writeFile(join(root,'admin'),admin+'\n',{mode:0o400});
  await writeFile(join(root,'reader'),reader+'\n',{mode:0o440});
  execFileSync('sudo',['chown','999:999',join(root,'admin')]);
  execFileSync('sudo',['chown','1000:999',join(root,'reader')]);
  phase='new isolated primary';docker(['volume','create',volume]);start();await wait();
  assert.equal(query('dsh_mcp_reader','SELECT count(*) FROM public.chatgpt_mcp_token_revocations;').trim(),'0');
  const denied=sql=>{let failed=false;try{query('dsh_mcp_reader',sql);}catch{failed=true;}assert.equal(failed,true);healthy();};
  phase='runtime privilege boundaries';
  denied("BEGIN READ WRITE; INSERT INTO public.chatgpt_mcp_read_grants VALUES ('"+'c'.repeat(64)+"',true); COMMIT;");
  denied('BEGIN READ WRITE; CREATE TABLE public.unauthorized(id integer); COMMIT;');
  denied('SET ROLE dsh_mcp_owner;');
  assert.equal(query('dsh_mcp_reader',"SELECT has_table_privilege(current_user,'public.chatgpt_mcp_read_grants','INSERT') OR has_table_privilege(current_user,'public.chatgpt_mcp_token_revocations','UPDATE') OR has_schema_privilege(current_user,'public','CREATE');").trim(),'f');
  assert.equal(query('dsh_mcp_owner',"SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls FROM pg_roles WHERE rolname='dsh_mcp_reader';").trim(),'f');
  phase='recreate with preserved state';docker(['stop',name]);docker(['rm',name]);start();await wait();
  denied('SET ROLE dsh_mcp_owner;');
  assert.equal(query('dsh_mcp_reader','SELECT count(*) FROM public.chatgpt_mcp_token_revocations;').trim(),'0');
  console.log('MCP_PRIMARY_READER_PRIVILEGES_PERSIST_MATCH: SELECT works; write/DDL/owner role denied; healthy controls and recreated DB; no host ports or default grants');
} catch {throw Error('MCP authorization primary verification failed at '+phase);}
finally {
  try{docker(['rm','-f',name]);}catch{}
  try{docker(['volume','rm',volume]);}catch{}
  await rm(root,{recursive:true,force:true});
}
