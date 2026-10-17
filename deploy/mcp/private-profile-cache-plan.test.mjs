import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
test('cache copy plan excludes project-registration symlinks and keeps offline package data',async()=>{
  const {cacheCopyPlan}=createRequire(import.meta.url)('./private-profile-cache-plan.cjs');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'private-cache-plan-'));
  try{
    const store=path.join(root,'.local/share/pnpm/store/v11');
    fs.mkdirSync(store+'/projects',{recursive:true});
    fs.mkdirSync(store+'/files');fs.mkdirSync(store+'/file+opt+jev.tgz');
    fs.writeFileSync(store+'/index.db','fixture package index');
    fs.symlinkSync('../../../../../../profiles/web',store+'/projects/project');
    fs.symlinkSync('/outside',path.join(root,'.local/share/pnpm/pnpm'));
    assert.deepEqual(cacheCopyPlan(root),[
      '.local/share/pnpm/store/v11/file+opt+jev.tgz',
      '.local/share/pnpm/store/v11/files',
      '.local/share/pnpm/store/v11/index.db',
    ]);
    assert.equal(fs.readlinkSync(store+'/projects/project'),'../../../../../../profiles/web');
    const stdin=spawnSync(process.execPath,['-',root],{
      input:fs.readFileSync(new URL('./private-profile-cache-plan.cjs',import.meta.url)),encoding:'utf8',
    });
    assert.equal(stdin.status,0);
    assert.deepEqual(stdin.stdout.trim().split('\n'),cacheCopyPlan(root));
    fs.rmSync(store+'/files',{recursive:true});fs.symlinkSync('/outside',store+'/files');
    assert.throws(()=>cacheCopyPlan(root));
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
