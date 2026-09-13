type Installation = {id:number; app_id:number; account?:{id:number}; suspended_at?:string|null};
/** Verify installation membership with GitHub, never a callback installation_id. */
export async function hasRepositoryInstallation(read: (path:string)=>Promise<unknown>, repositoryId:number, ownerId:number) {
  for(let page=1;page<=10;page++) {
    const data=await read(`/user/installations?per_page=100&page=${page}`) as {installations?:Installation[]};
    if(!Array.isArray(data.installations))throw Error('Invalid installation response');
    for(const installation of data.installations) {
      if(installation.app_id!==4919551 || installation.account?.id!==ownerId || installation.suspended_at || !Number.isSafeInteger(installation.id))continue;
      for(let repoPage=1;repoPage<=20;repoPage++) {
        const repos=await read(`/user/installations/${installation.id}/repositories?per_page=100&page=${repoPage}`) as {repositories?:{id:number;private:boolean}[]};
        if(!Array.isArray(repos.repositories))throw Error('Invalid repositories response');
        if(repos.repositories.some(r=>r.id===repositoryId && r.private===false))return true;
        if(repos.repositories.length<100)break;
        if(repoPage===20)throw Error('Installation repository limit reached');
      }
    }
    if(data.installations.length<100)return false;
  }
  throw Error('Installation lookup limit reached');
}
