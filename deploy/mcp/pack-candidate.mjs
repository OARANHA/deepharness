import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
const [source,destination,sourceSha]=process.argv.slice(2);
if(!source||!destination||!/^[a-f0-9]{40}$/.test(sourceSha??''))throw Error('Exact source SHA required');
await mkdir(destination,{recursive:true});
const [packed]=JSON.parse(execFileSync('npm',['pack',source,'--ignore-scripts','--json','--pack-destination',destination],{encoding:'utf8'}));
const files=[];
for(const file of packed.files){
  const sha256=createHash('sha256').update(await readFile(join(source,file.path))).digest('hex');
  files.push({path:file.path,sha256});
}
const tarSha256=createHash('sha256').update(await readFile(join(destination,packed.filename))).digest('hex');
await writeFile(join(destination,'packed-files.json'),JSON.stringify({version:1,sourceSha,tarball:packed.filename,tarSha256,files},null,2)+'\n');
await writeFile(join(destination,'SHA256SUMS'),tarSha256+'  '+packed.filename+'\n');
