import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {visiblePlaces} from '../lib/building-settings.ts';
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const stub=url(`
export const env={},noStore={};
export const database=()=>globalThis.removeTest.db;
export const sameOrigin=r=>r.headers.get('origin')==='https://reporoad.org';
export const session=async()=>globalThis.removeTest.user;
export const github=async p=>p==='/user'?{id:globalThis.removeTest.identity}:globalThis.removeTest.repo;
export const verifyRepository=()=>{},saveRegistration=()=>{},parseBuildingConfig=()=>{},serializeBuildingConfig=()=>{},applyWebsiteSettings=()=>{},hasRepositoryInstallation=()=>{};
export class RegistrationError extends Error{}
`);
let source=readFileSync(new URL('../app/api/repositories/building/route.ts',import.meta.url),'utf8');
source=source.replace(/from '([^']+)'/g,(whole,path)=>`from ${JSON.stringify(path==='@/lib/github-crypto'?new URL('../lib/github-crypto.ts',import.meta.url).href:path==='@/lib/road-registration'?url(`export {repositoryName} from ${JSON.stringify(new URL('../lib/repository-address.ts',import.meta.url).href)}; export {verifyRepository,saveRegistration,RegistrationError} from ${JSON.stringify(stub)};`):stub)}`);
const {DELETE}=await import(url(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText));
test('removal requires same-origin, fresh identity and repository owner/admin; batches only site records',async()=>{
  const batches=[];
  const state=globalThis.removeTest={identity:2,user:{user_id:2,token:'test'},repo:{id:9,full_name:'tester/repo',private:false,owner:{id:2}},db:{prepare(sql){return {bind(...values){return {sql,values}}}},async batch(statements){batches.push(statements)}}};
  const req=(origin='https://reporoad.org',name='tester/repo')=>new Request('https://reporoad.org/api/repositories/building?repository='+encodeURIComponent(name),{method:'DELETE',headers:{origin}});
  assert.equal((await DELETE(req('https://evil.test'))).status,403);
  assert.equal((await DELETE(req(undefined,'https://evil.test/a/b'))).status,400);
  state.user=null;assert.equal((await DELETE(req())).status,401);
  state.user={user_id:2,token:'test'};state.identity=3;assert.equal((await DELETE(req())).status,401);
  state.identity=2;state.repo.owner.id=3;assert.equal((await DELETE(req())).status,403);
  state.repo.permissions={admin:true};state.repo.private=true;assert.equal((await DELETE(req())).status,403);
  assert.equal(batches.length,0);
  state.repo.private=false;assert.equal((await DELETE(req())).status,200);
  assert.equal(batches[0].length,3);
  assert.match(batches[0][0].sql,/INSERT INTO removed_places/);
  assert.deepEqual(batches[0][1].values,[9]);
  assert.deepEqual(batches[0][2].values,['tester/repo']);
  state.repo.owner.id=2;state.repo.permissions={};assert.equal((await DELETE(req())).status,200);
  delete globalThis.removeTest;
});
test('removal filters cached and discovered entries, but not a different owner after transfer',async()=>{
  const db={prepare:()=>({all:async()=>({results:[{repository_id:9,owner_id:2}]})})};
  assert.deepEqual(await visiblePlaces(db,[{githubId:9,ownerId:2},{githubId:10,ownerId:2},{githubId:9,ownerId:3}]),[{githubId:10,ownerId:2},{githubId:9,ownerId:3}]);
});
