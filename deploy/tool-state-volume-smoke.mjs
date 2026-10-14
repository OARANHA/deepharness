import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const image = process.argv[2];
assert.match(image ?? '', /^local\/deepharness:[a-z0-9-]+$/);
const prefix = 'dsh-tool-state-' + process.pid + '-' + Date.now();
const volumes = [];
function docker(args, input) {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout || 'Docker command failed');
  return result.stdout;
}
const restrictions = ['--rm', '-i', '--read-only', '--network', 'none',
  '--security-opt', 'no-new-privileges', '--cap-drop', 'ALL',
  '--pids-limit', '256', '--memory', '2g', '--cpus', '1.5',
  '--tmpfs', '/tmp:rw,nosuid,nodev,noexec,size=128m,mode=1777'];
try {
  const config = JSON.parse(docker(['compose', '-f', 'deploy/portainer-stack.yml', 'config', '--format', 'json']));
  const web = config.services.web;
  assert.equal(web.read_only, true);
  assert.equal(web.privileged ?? false, false);
  assert.equal(web.ports?.length ?? 0, 0);
  assert.deepEqual(web.volumes.map(v => v.target).sort(), ['/data/dsh', '/workspace']);
  const mounts = web.volumes.map(v => {
    assert.equal(v.type, 'volume');
    const name = prefix + '-' + v.source;
    docker(['volume', 'create', name]);
    volumes.push(name);
    return { name, target: v.target };
  });
  const data = mounts.find(v => v.target === '/data/dsh');
  assert.ok(data);
  // Disposable legacy-volume fixture: DSH root is writable, old tool dirs are not.
  docker(['run', '--rm', '-i', '--network', 'none', '--user', '0:0',
    '-v', data.name + ':/data/dsh', image, 'node'], `
    const fs = require('node:fs');
    fs.chownSync('/data/dsh', 1000, 1000);
    for (const path of ['/data/dsh/.npm-cache', '/data/dsh/.cache', '/data/dsh/.hyperframes']) {
      fs.mkdirSync(path, {recursive:true});
      fs.chownSync(path, 0, 0); fs.chmodSync(path, 0o700);
      fs.writeFileSync(path + '/legacy-sentinel', 'preserve');
    }`);
  const baseline = docker(['run', ...restrictions, '-v', data.name + ':/data/dsh',
    image, 'node'], `
    const fs = require('node:fs'), assert = require('node:assert/strict');
    assert.equal(process.getuid(), 1000);
    for (const path of ['/data/dsh/.npm-cache', '/data/dsh/.cache', '/data/dsh/.hyperframes'])
      assert.throws(() => fs.writeFileSync(path + '/probe', 'x'), {code:'EACCES'});
    console.log('LEGACY_ROOT_TOOL_STATE_REPRODUCED');`);
  assert.match(baseline, /LEGACY_ROOT_TOOL_STATE_REPRODUCED/);
  // CI fixture only: repair exact known paths and files, keeping legacy state visible.
  // Production requires inventory and authorization; never repair all /data/dsh.
  docker(['run', '--rm', '-i', '--network', 'none', '--user', '0:0',
    '-v', data.name + ':/data/dsh', image, 'node'], `
    const fs=require('node:fs');
    for(const dir of ['/data/dsh/.npm-cache','/data/dsh/.cache','/data/dsh/.hyperframes']) {
      fs.chownSync(dir,1000,1000);
      fs.chownSync(dir+'/legacy-sentinel',1000,1000);
    }`);
  const mounted = mounts.flatMap(v => ['-v', v.name + ':' + v.target]);
  const env = Object.entries(web.environment).flatMap(([k,v]) => ['-e', k + '=' + v]);
  for (let pass = 1; pass <= 2; pass++) {
    docker(['run', ...restrictions, ...mounted, ...env, '-e', 'PROBE_PASS=' + pass, image, 'node'], `
      const fs = require('node:fs'), assert = require('node:assert/strict');
      const {spawnSync} = require('node:child_process');
      assert.equal(process.getuid(), 1000);
      assert.equal(process.env.HOME, '/data/dsh');
      assert.equal(process.env.DSH_HOME, '/data/dsh');
      assert.equal(process.env.NPM_CONFIG_CACHE, '/data/dsh/.npm-cache');
      assert.equal(process.env.XDG_CACHE_HOME, '/data/dsh/.cache');
      assert.equal(process.env.NPM_CONFIG_PREFIX, '/data/dsh/.npm-global');
      const pass = Number(process.env.PROBE_PASS);
      for(const dir of ['/data/dsh/.npm-cache','/data/dsh/.cache','/data/dsh/.hyperframes'])
        assert.equal(fs.readFileSync(dir+'/legacy-sentinel','utf8'),'preserve');
      for (const dir of [process.env.NPM_CONFIG_CACHE, process.env.XDG_CACHE_HOME, '/data/dsh/.hyperframes', process.env.NPM_CONFIG_PREFIX]) {
        assert.equal(fs.statSync(dir).uid, process.getuid());
        if (pass === 2) assert.equal(fs.readFileSync(dir + '/write-probe', 'utf8'), 'persisted');
        fs.writeFileSync(dir + '/write-probe', 'persisted');
      }
      fs.mkdirSync('/tmp/npm-fixture', {recursive:true});
      fs.writeFileSync('/tmp/npm-fixture/package.json', JSON.stringify({name:'dsh-cache-fixture',version:'1.0.0',bin:{'dsh-tool-install-probe':'cli.js'}}));
      fs.writeFileSync('/tmp/npm-fixture/index.js', 'module.exports=1;');
      fs.writeFileSync('/tmp/npm-fixture/cli.js', '#!/usr/bin/env node\\nconsole.log("PERSISTENT_USER_INSTALL_OK");\\n', {mode:0o755});
      function npm(args, cwd='/tmp') {
        const r=spawnSync('npm', args, {cwd,encoding:'utf8'});
        assert.equal(r.status,0,r.stderr); return r.stdout;
      }
      if (pass===1) {
        npm(['pack','--offline','--ignore-scripts','--silent'], '/tmp/npm-fixture');
        npm(['cache','add','/tmp/npm-fixture/dsh-cache-fixture-1.0.0.tgz','--offline','--ignore-scripts']);
        npm(['install','--global','/tmp/npm-fixture/dsh-cache-fixture-1.0.0.tgz','--offline','--ignore-scripts','--no-audit','--no-fund']);
      }
      assert.match(npm(['cache','ls','--offline']), /dsh-cache-fixture/);
      npm(['cache','verify','--offline']);
      const binary=spawnSync('dsh-tool-install-probe', [], {encoding:'utf8'});
      assert.equal(binary.status,0,binary.stderr || String(binary.error));
      assert.match(binary.stdout,/PERSISTENT_USER_INSTALL_OK/);
      const skill='/data/dsh/.agents/skills/dsh-install-probe';
      if(pass===1) {fs.mkdirSync(skill,{recursive:true});fs.writeFileSync(skill+'/SKILL.md','local fixture');}
      assert.equal(fs.readFileSync(skill+'/SKILL.md','utf8'),'local fixture');
      console.log('TOOL_STATE_PASS_' + pass);`);
  }
  // Verify the same legacy directories retain their contents after scoped repair.
  docker(['run', '--rm', '-i', '--network', 'none', '--user', '0:0',
    '-v', data.name + ':/data/dsh', image, 'node'], `
    const fs=require('node:fs'),assert=require('node:assert/strict');
    for(const dir of ['/data/dsh/.npm-cache','/data/dsh/.cache','/data/dsh/.hyperframes']) {
      assert.equal(fs.statSync(dir).uid,1000);
      assert.equal(fs.readFileSync(dir+'/legacy-sentinel','utf8'),'preserve');
    }`);
  console.log('TOOL_STATE_EXISTING_VOLUME_NONROOT_INSTALL_MATCH');
} finally {
  for (const volume of volumes.reverse()) docker(['volume', 'rm', volume]);
}
