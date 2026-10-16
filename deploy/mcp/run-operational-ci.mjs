/** GitHub CI only; creates and removes exactly its own containers/networks/volume. */
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtemp,writeFile,mkdir,rm,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
if(process.env.GITHUB_ACTIONS!=='true')throw Error('Disposable CI only');
const suffix=process.env.GITHUB_RUN_ID+'-'+process.env.GITHUB_RUN_ATTEMPT;
if(!/^[0-9]+-[0-9]+$/.test(suffix))throw Error('CI run identity required');
const name='dsh-operational-ci-'+suffix,db=name+'-db',edge=name+'-edge',backend=name+'-backend',volume=name+'-data';
const root=await mkdtemp(join(tmpdir(),'dsh-operational-ci-'));
const run=(program,args,options={})=>execFileSync(program,args,{encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe'],...options});
const docker=args=>run('docker',args);
let phase='fixtures';
try{
  await chmod(root,0o755);await mkdir(join(root,'runtime'),{mode:0o755});await mkdir(join(root,'client'),{mode:0o755});
  const ssl=args=>run('openssl',args,{cwd:root});
  ssl(['req','-x509','-newkey','rsa:2048','-nodes','-keyout','ca.key','-out','ca.crt','-days','1','-subj','/CN=Disposable Operational CI CA']);
  for(const target of ['server','client']){
    ssl(['req','-new','-newkey','rsa:2048','-nodes','-keyout',target+'.key','-out',target+'.csr','-subj','/CN='+target]);
    await writeFile(join(root,target+'.ext'),target==='server'?'subjectAltName=DNS:deepharness-mcp-backend\nextendedKeyUsage=serverAuth\n':'extendedKeyUsage=clientAuth\n');
    ssl(['x509','-req','-in',target+'.csr','-CA','ca.crt','-CAkey','ca.key','-CAcreateserial','-out',target+'.crt','-days','1','-extfile',target+'.ext']);
  }
  const {copyFile}=await import('node:fs/promises');
  for(const [source,target] of [['server.key','runtime/backend-server-key.pem'],['server.crt','runtime/backend-server-chain.pem'],['ca.crt','runtime/backend-ca.pem'],['client.key','client/client.key'],['client.crt','client/client.crt']])await copyFile(join(root,source),join(root,target));
  await writeFile(join(root,'admin'),'a'.repeat(64)+'\n',{mode:0o400});
  await writeFile(join(root,'runtime/mcp-runtime-db-password'),'b'.repeat(64)+'\n',{mode:0o440});
  run('sudo',['chown','999:999',join(root,'admin')]);
  for(const file of ['runtime/backend-server-key.pem','runtime/backend-server-chain.pem','runtime/backend-ca.pem',
    'runtime/mcp-runtime-db-password','client/client.key','client/client.crt'])run('sudo',['chown','1000:999',join(root,file)]);
  phase='isolated networks and primary';
  docker(['network','create','--internal',edge]);docker(['network','create','--internal',backend]);docker(['volume','create',volume]);
  docker(['run','-d','--name',db,'--network',backend,'--network-alias','mcp-grants-db','--read-only','--cap-drop','ALL',
    '--security-opt','no-new-privileges','--memory','256m','--pids-limit','128',
    '--tmpfs','/var/run/postgresql:rw,nosuid,nodev,noexec,size=8m,mode=0770,uid=999,gid=999',
    '--tmpfs','/tmp:rw,nosuid,nodev,noexec,size=16m,mode=1777',
    '--mount','type=volume,src='+volume+',dst=/var/lib/postgresql/data',
    '--mount','type=bind,src='+join(root,'admin')+',dst=/run/secrets/mcp-admin-db-password,readonly',
    '--mount','type=bind,src='+join(root,'runtime/mcp-runtime-db-password')+',dst=/run/secrets/mcp-runtime-db-password,readonly',
    '-e','POSTGRES_DB=dsh_mcp_grants','-e','POSTGRES_USER=dsh_mcp_owner',
    '-e','POSTGRES_PASSWORD_FILE=/run/secrets/mcp-admin-db-password','-e','POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256',
    'local/deepharness-grants:ci']);
  let ready=false;
  for(let i=0;i<60;i++){
    try{docker(['exec','-e','PGPASSWORD='+'b'.repeat(64),db,'psql','-X','-h','127.0.0.1','-U','dsh_mcp_reader','-d','dsh_mcp_grants','-v','ON_ERROR_STOP=1','-c','SELECT count(*) FROM chatgpt_mcp_read_grants']);ready=true;break;}catch{}
    assert.equal(docker(['inspect','--format','{{.State.Status}}',db]).trim(),'running');await delay(500);
  }assert.ok(ready,'primary initialization');
  phase='official two-interface operational host';
  docker(['create','--name',name,'--network',edge,'--network-alias','deepharness-web-edge','--init','--read-only',
    '--cap-drop','ALL','--security-opt','no-new-privileges','--memory','2g','--pids-limit','256',
    '--tmpfs','/tmp:rw,nosuid,nodev,noexec,size=128m,mode=1777',
    '--tmpfs','/data/dsh:rw,nosuid,nodev,size=256m,mode=0700,uid=1000,gid=1000',
    '--tmpfs','/workspace:rw,nosuid,nodev,size=128m,mode=0700,uid=1000,gid=1000',
    '--mount','type=bind,src='+join(root,'runtime')+',dst=/run/secrets,readonly',
    '--mount','type=bind,src='+join(root,'client')+',dst=/ci,readonly',
    '-e','GITHUB_ACTIONS=true','-e','DSH_MCP_INSTALL_PROOF=true','local/deepharness-mcp:candidate',
    'node','/opt/wandora-mcp-verifier/mcp/verify-operational-host.mjs']);
  phase='attach private operational network';
  docker(['network','connect','--alias','deepharness-mcp-backend',backend,name]);
  assert.equal(docker(['inspect','--format','{{len .HostConfig.PortBindings}}',name]).trim(),'0');
  // Stage C ingress gate: only our disposable host and primary, no public proxy.
  // The original Web profile boots inside the sole operational-host container.
  assert.equal(docker(['inspect','--format','{{len .HostConfig.PortBindings}}',db]).trim(),'0');
  const members=docker(['network','inspect','--format','{{range .Containers}}{{.Name}} {{end}}',backend]).trim().split(/\s+/).sort();
  assert.deepEqual(members,[db,name].sort(),'private network must contain only CI primary and sole Web host');
  console.log('STAGE_C_PRIVATE_ONLY_NO_PROXY_MATCH');
  phase='run operational integration';
  const output=run('docker',['start','-a',name],{timeout:150000});
  const marker='MCP_OPERATIONAL_HOST_PRIMARY_MTLS_MATCH';assert.ok(output.includes(marker),'full integration marker required');
  assert.equal(docker(['inspect','--format','{{.State.ExitCode}}',name]).trim(),'0');
  console.log(marker+': isolated two-network runtime passed; no production data or published ports');
}catch(error){
  // Include startup errors even when no process reached the container log driver.
  const diagnostic = line => {
    if(typeof line!=='string'||line.length>500||
      /https?:\/\/|token|passphrase|password|secret|api[_-]?key|authorization|bearer|cookie|PRIVATE KEY/i.test(line))return;
    if(/^Operational (?:CI exception |integration failed at )/.test(line)||/^(?:Error(?: response from daemon)?|TypeError|ReferenceError|SyntaxError|AssertionError)(?: \[[A-Z0-9_]+\])?:/.test(line)||
      /^Operational CI (?:status expected [0-9]+ actual [0-9]+|error code [A-Z0-9_]+)$/.test(line)||
      /^OPERATIONAL_CI_STAGE [a-z -]+$/.test(line))console.error(line);
  };
  for(const value of [error?.stdout,error?.stderr])for(const line of String(value??'').split('\n'))diagnostic(line);
  try{
    const logs=spawnSync('docker',['logs','--tail','100',name],{encoding:'utf8',timeout:10000});
    for(const line of ((logs.stdout??'')+'\n'+(logs.stderr??'')).split('\n'))diagnostic(line);
    const state=docker(['inspect','--format','{{.State.Status}} {{.State.ExitCode}} {{.State.OOMKilled}}',name]).trim();
    if(/^[a-z]+ [0-9]+ (?:true|false)$/.test(state))console.error('Operational CI container state '+state);
  }catch{}
  throw Error('Disposable operational CI failed at '+phase);
}finally{
  for(const container of [name,db])try{docker(['rm','-f',container]);}catch{}
  try{docker(['volume','rm',volume]);}catch{}
  for(const network of [edge,backend])try{docker(['network','rm',network]);}catch{}
  await rm(root,{recursive:true,force:true});
}
