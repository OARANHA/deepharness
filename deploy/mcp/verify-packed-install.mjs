/** Refuse stale installed bundles before importing their executable code. */
import {readFile, lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
export async function verifyPackedInstall(root, manifestFile) {
  try {
    const manifest=JSON.parse(await readFile(manifestFile,'utf8'));
    if(manifest.version!==1||!Array.isArray(manifest.files)||manifest.files.length<20)throw Error();
    for(const file of manifest.files){
      if(typeof file.path!=='string'||!/^[-a-zA-Z0-9_./]+$/.test(file.path)||
          file.path.split('/').some(part=>!part||part==='.'||part==='..')||
          !/^[a-f0-9]{64}$/.test(file.sha256))throw Error();
      const path=join(root,file.path);
      if(!(await lstat(path)).isFile())throw Error();
      if(createHash('sha256').update(await readFile(path)).digest('hex')!==file.sha256)throw Error();
    }
    return true;
  }catch{throw Error('Installed MCP package provenance denied');}
}
