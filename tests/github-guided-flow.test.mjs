import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {hasRepositoryInstallation} from '../lib/github-installation.ts';
import {parseDraft} from '../lib/building-draft.ts';
import {randomToken,seal} from '../lib/github-crypto.ts';

test('drafts preserve customization but reject expiry and unsafe addresses',()=>{
  const data={address:'https://github.com/RepoRoad/reporoad',building:{version:1,style:'cafe',color:'#778565',roof:'gable'},floors:7,createdAt:Date.now()};
  assert.equal(parseDraft(JSON.stringify(data)).floors,7);
  assert.equal(parseDraft(JSON.stringify(data)).address,'https://github.com/reporoad/reporoad');
  assert.equal(parseDraft(JSON.stringify({...data,address:'https://evil.test/a/b'})),null);
  assert.equal(parseDraft(JSON.stringify({...data,createdAt:Date.now()-3600001})),null);
  assert.equal(parseDraft('{broken'),null);
});
test('installation lookup requires correct app, owner, public repo and nonsuspended installation',async()=>{
  for(const [patch,repo,expected] of [[{}, {id:9,private:false},true],[{app_id:1},{id:9,private:false},false],[{account:{id:7}},{id:9,private:false},false],[{suspended_at:'today'},{id:9,private:false},false],[{},{id:8,private:false},false],[{},{id:9,private:true},false]]) {
    const read=async path=>path.startsWith('/user/installations?')?{installations:[{id:5,app_id:4919551,account:{id:6},...patch}]}:{repositories:[repo]};
    assert.equal(await hasRepositoryInstallation(read,9,6),expected);
  }
});

// Exercise the actual callback route with isolated network/storage boundaries.
const moduleUrl=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const authUrl=moduleUrl(`export const CALLBACK='https://reporoad.org/api/github/callback',CLIENT_ID='test',noStore={'Cache-Control':'no-store'};
export const secrets=()=>globalThis.__githubTest.secrets;
export const cookie=(r,n)=>r.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(n+'='))?.slice(n.length+1)||'';
export const setCookie=(n,v,a)=>n+'='+v+'; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age='+a;
export const github=async()=>({id:1,login:'tester'});`);
const dbUrl=moduleUrl(`export const database=()=>({prepare:()=>({bind(){return this},async run(){globalThis.__githubTest.writes++;return {meta:{changes:1}}}})});`);
let source=readFileSync(new URL('../app/api/github/callback/route.ts',import.meta.url),'utf8')
  .replace("'@/lib/github-auth'",JSON.stringify(authUrl))
  .replace("'@/lib/db'",JSON.stringify(dbUrl))
  .replace("'@/lib/github-crypto'",JSON.stringify(new URL('../lib/github-crypto.ts',import.meta.url).href));
const {GET}=await import(moduleUrl(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText));
test('callback validates state, rejects missing/tampered cookies, and establishes session only on success',async()=>{
  const originalFetch=globalThis.fetch, originalError=console.error;
  const logs=[];console.error=(...args)=>logs.push(args);
  const secret=randomToken(), state=randomToken();
  globalThis.__githubTest={secrets:{session:secret,client:'test-secret'},writes:0};
  const value=await seal({state,verifier:randomToken(),expires:Date.now()+600000},secret,'github-oauth');
  globalThis.fetch=async()=>Response.json({access_token:'ghu_test',expires_in:3600});
  const request=(cookie='',s=state)=>new Request('https://reporoad.org/api/github/callback?code=test-code&state='+s,{headers:{cookie}});
  try {
    assert.match((await GET(request())).headers.get('location'),/reason=oauth_cookie_missing/);
    assert.match((await GET(request('__Host-reporoad-oauth=broken'))).headers.get('location'),/reason=oauth_cookie_invalid/);
    assert.match((await GET(request('__Host-reporoad-oauth='+value,'wrong'))).headers.get('location'),/reason=oauth_state_invalid/);
    assert.equal(globalThis.__githubTest.writes,0);
    const success=await GET(request('__Host-reporoad-oauth='+value));
    assert.match(success.headers.get('location'),/github=connected/);
    assert.match(success.headers.get('set-cookie'),/__Host-reporoad-github=/);
    assert.equal(globalThis.__githubTest.writes,3);
    globalThis.fetch=async()=>Response.json({error:'bad_verification_code'});
    assert.match((await GET(request('__Host-reporoad-oauth='+value))).headers.get('location'),/reason=token_response/);
    const output=JSON.stringify(logs);for(const sensitive of [secret,state,value,'test-code','test-secret','ghu_test'])assert.equal(output.includes(sensitive),false);
  }finally{globalThis.fetch=originalFetch;console.error=originalError;delete globalThis.__githubTest;}
});
