import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {verifyPackedInstall} from '../../../deploy/mcp/verify-packed-install.mjs';
const exec=promisify(execFile);
test('npm pack installs offline; all exports/imports match source; stale installed seam denied',{timeout:30000},async()=>{
  const root=await mkdtemp(join(tmpdir(),'stage-d-pack-'));
  try{
    const source=fileURLToPath(new URL('../',import.meta.url));
    const pack=async()=>JSON.parse((await exec('npm',['pack',source,'--ignore-scripts','--json','--pack-destination',root])).stdout)[0];
    const packed=await pack();const again=await pack();assert.equal(packed.integrity,again.integrity);
    const install=join(root,'install');await mkdir(install);
    await exec('npm',['install','--prefix',install,'--offline','--ignore-scripts','--no-audit','--no-fund','--package-lock=false',join(root,packed.filename)]);
    const resolve=createRequire(join(install,'package.json'));
    const packageRoot=join(install,'node_modules/@wandora/deepharness-chatgpt-mcp-read');
    const manifest=JSON.parse(await readFile(join(source,'package.json'),'utf8'));
    assert.deepEqual(packed.files.map(x=>x.path).sort(),['package.json',...manifest.files].sort());
    const files=[];
    for(const file of packed.files){
      assert.equal(file.mode,420);
      const expected=await readFile(join(source,file.path));const actual=await readFile(join(packageRoot,file.path));
      assert.deepEqual(actual,expected,file.path);
      files.push({path:file.path,sha256:createHash('sha256').update(expected).digest('hex')});
      if(file.path.endsWith('.mjs'))await import(pathToFileURL(join(packageRoot,file.path)).href);
    }
    for(const key of Object.keys(manifest.exports)){
      const path=resolve.resolve('@wandora/deepharness-chatgpt-mcp-read'+(key==='.'?'':key.slice(1)));
      assert.ok(path.startsWith(packageRoot));
    }
    const proof=join(root,'packed-files.json');await writeFile(proof,JSON.stringify({version:1,files}));
    assert.equal(await verifyPackedInstall(packageRoot,proof),true);
    await writeFile(join(packageRoot,'adapters/authoritative-pg-read-query.mjs'),'// stale package');
    await assert.rejects(verifyPackedInstall(packageRoot,proof),/provenance denied/);
    const patch=await readFile(join(packageRoot,'cordis.patch.yml'),'utf8');
    assert.match(patch,/disabled: true/);assert.match(patch,/endpointEnabled: false/);
    const backend=await import(pathToFileURL(join(packageRoot,'adapters/postgres-token-revocation.mjs')).href);
    assert.deepEqual(Object.keys(backend.createPostgresRevocationBackend({query:async()=>({rows:[]})})),['isRevoked']);
  }finally{await rm(root,{recursive:true,force:true});}
});
