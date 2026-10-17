// Read-only selection of offline package data. Never copy pnpm project links.
const fs=require('node:fs'),path=require('node:path');
function cacheCopyPlan(root){
  const result=[];
  const exists=p=>{try{return fs.lstatSync(p);}catch(e){if(e.code==='ENOENT')return null;throw e;}};
  const directory=relative=>{
    const absolute=path.join(root,relative),stat=exists(absolute);
    if(!stat)return false;
    if(!stat.isDirectory()||fs.realpathSync(absolute)!==absolute)throw Error('Unexpected cache directory');
    return true;
  };
  const add=relative=>{
    const stat=exists(path.join(root,relative));if(!stat)return;
    if(stat.isSymbolicLink()||(!stat.isDirectory()&&!stat.isFile()))throw Error('Unexpected cache entry');
    result.push(relative);
  };
  for(const base of ['.local/share/pnpm/store','.pnpm-store']){
    if(!directory(base))continue;
    for(const version of fs.readdirSync(path.join(root,base)).sort()){
      if(!/^v[0-9]+$/.test(version))continue;
      const store=base+'/'+version;if(!directory(store))continue;
      for(const entry of fs.readdirSync(path.join(root,store)).sort()){
        if(['files','index','index.db','index.db-wal','index.db-shm'].includes(entry)||
          /^file\+[-a-zA-Z0-9._+%@=]+$/.test(entry))add(store+'/'+entry);
        // In particular, `projects` is NOT package data: do not copy or follow it.
      }
    }
  }
  for(const base of ['.cache/pnpm','cache/pnpm']){
    if(!directory(base))continue;
    for(const entry of ['metadata','lockfile-verified.jsonl'])add(base+'/'+entry);
    for(const entry of fs.readdirSync(path.join(root,base)).sort()){
      // pnpm 9/10 stores registry mirrors under metadata-v1.3, not metadata.
      // Use only narrowly named local cache directories; reject symlinks via add().
      if(/^metadata-v[0-9]+(?:\.[0-9]+)*$/.test(entry))add(base+'/'+entry);
      if(/^v[0-9]+$/.test(entry)&&directory(base+'/'+entry))add(base+'/'+entry+'/metadata');
    }
  }
  return result;
}
module.exports={cacheCopyPlan};
if(require.main===module||module.id==='[stdin]'){
  try{for(const entry of cacheCopyPlan(process.argv[2]??'/data/dsh'))console.log(entry);}
  catch{console.error('PRIVATE_CACHE_PLAN_DENIED');process.exitCode=1;}
}
