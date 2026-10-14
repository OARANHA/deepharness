import {rm} from 'node:fs/promises';
/** Test-harness cleanup must run even if Docker removal fails. */
export async function closePrivateWireResources({disposeHandler,closeProxy,http,root}){
  try{try{disposeHandler();}finally{await closeProxy?.();}}
  finally{
    try{if(http?.listening)await new Promise(resolve=>{http.close(resolve);http.closeAllConnections();});}
    finally{await rm(root,{recursive:true,force:true});}
  }
}
