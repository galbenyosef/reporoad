import { env } from 'cloudflare:workers';
import { database } from '@/lib/db';
import { github, noStore, sameOrigin, session } from '@/lib/github-auth';
import { mayManageRepository } from '@/lib/github-crypto';
import { repositoryName, verifyRepository, saveRegistration, RegistrationError } from '@/lib/road-registration';
import { parseBuildingConfig, serializeBuildingConfig } from '@/lib/repositories';
import { applyWebsiteSettings } from '@/lib/building-settings';
import { hasRepositoryInstallation } from '@/lib/github-installation';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
  const name=repositoryName(new URL(request.url).searchParams.get('repository'));
  if(!name)return Response.json({error:'Enter a public GitHub repository URL.'},{status:400,headers:noStore});
  try {
    const repo=await verifyRepository(name,(env as unknown as {GITHUB_READ_TOKEN?:string}).GITHUB_READ_TOKEN);
    if(new URL(request.url).searchParams.get('source')==='file')
      return Response.json({repository:repo,mode:'file'},{headers:noStore});
    const [resolved]=await applyWebsiteSettings(database(),[repo]);
    return Response.json({repository:resolved,mode:resolved.configSource==='website'?'website':'file'},{headers:noStore});
  } catch(error) {return Response.json({error:error instanceof RegistrationError?error.message:'Could not load repository settings.'},{status:503,headers:noStore});}
}
export async function POST(request:Request) {
  const reply=(error:string,status=400)=>Response.json({error},{status,headers:noStore});
  if(!sameOrigin(request))return reply('Save from RepoRoad.',403);
  if(!request.headers.get('content-type')?.startsWith('application/json'))return reply('Expected JSON.',415);
  try {
    const user=await session(request);if(!user)return reply('Connect GitHub before saving.',401);
    const reader=request.body?.getReader();if(!reader)return reply('Missing settings.');
    let raw='',size=0;const decoder=new TextDecoder();
    try {for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>10000)return reply('Settings too large.',413);raw+=decoder.decode(value,{stream:true});}raw+=decoder.decode();}
    finally {await reader.cancel();}
    const input=JSON.parse(raw), name=repositoryName(input.repository);
    if(!name || !['website','file'].includes(input.mode))return reply('Choose a repository and settings source.');
    const building=input.mode==='website'?parseBuildingConfig(JSON.stringify(input.building)):null;
    if(input.mode==='website' && !building)return reply('Invalid building settings.');
    const db=database(), now=Date.now();
    const limit=await db.prepare('INSERT INTO road_submission_limits(id,updated_at) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at WHERE road_submission_limits.updated_at<=?').bind(`github-save:${user.user_id}`,now,now-3000).run();
    if(!limit.meta.changes)return reply('Please wait a few seconds before saving again.',429);
    const identity=await github('/user',user.token) as {id?:number};
    if(identity.id!==user.user_id)return reply('Reconnect GitHub.',401);
    const metadata=await github(`/repos/${name}`,user.token) as {id:number;full_name:string;private:boolean;owner:{id:number};permissions?:{admin?:boolean}};
    if(repositoryName(metadata.full_name)!==name || metadata.private!==false)return reply('Choose a public repository.',403);
    if(!await hasRepositoryInstallation(path=>github(path,user.token),metadata.id,metadata.owner.id))
      return Response.json({error:'Enable RepoRoad for this repository, then continue here.',code:'installation_required'},{status:403,headers:noStore});
    if(!mayManageRepository(metadata,user.user_id))return reply('Only the repository owner or an administrator can save.',403);
    const repo=await verifyRepository(name,user.token);
    if(repo.githubId!==metadata.id || repo.ownerId!==metadata.owner.id)return reply('Repository changed during verification. Try again.',409);
    await saveRegistration(db,repo);
    if(input.mode==='file')await db.prepare('DELETE FROM building_settings WHERE repository_id=?').bind(metadata.id).run();
    else {
      const result=await db.prepare('INSERT INTO building_settings(repository_id,owner_id,name,settings,updated_by,updated_at) SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM building_settings)<1000 OR EXISTS(SELECT 1 FROM building_settings WHERE repository_id=?) ON CONFLICT(repository_id) DO UPDATE SET owner_id=excluded.owner_id,name=excluded.name,settings=excluded.settings,updated_by=excluded.updated_by,updated_at=excluded.updated_at').bind(metadata.id,metadata.owner.id,name,serializeBuildingConfig(building!),user.user_id,now,metadata.id).run();
      if(!result.meta.changes)return reply('Website design capacity reached.',503);
    }
    await db.prepare('DELETE FROM removed_places WHERE repository_id=?').bind(metadata.id).run();
    return Response.json({ok:true,mode:input.mode},{headers:noStore});
  } catch {return reply('Could not verify GitHub permissions or save. Check the app installation, reconnect GitHub, and try again.',503);}
}
export async function DELETE(request:Request) {
  const reply=(error:string,status:number)=>Response.json({error},{status,headers:noStore});
  if(!sameOrigin(request))return reply('Remove from RepoRoad.',403);
  const name=repositoryName(new URL(request.url).searchParams.get('repository'));
  if(!name)return reply('Enter a public GitHub repository URL.',400);
  try {
    const user=await session(request);
    if(!user)return reply('Sign in to GitHub before removing a place.',401);
    const identity=await github('/user',user.token) as {id?:number};
    if(identity.id!==user.user_id)return reply('Reconnect GitHub.',401);
    const repo=await github(`/repos/${name}`,user.token) as {id:number;full_name:string;private:boolean;owner:{id:number};permissions?:{admin?:boolean}};
    if(repositoryName(repo.full_name)!==name || !mayManageRepository(repo,user.user_id))
      return reply('Only the public repository owner or an administrator can remove this place.',403);
    const db=database();
    // Atomic removal and durable opt-out: cached/YAML discovery cannot restore it.
    await db.batch([
      db.prepare('INSERT INTO removed_places(repository_id,owner_id,removed_by,removed_at) VALUES (?,?,?,?) ON CONFLICT(repository_id) DO UPDATE SET owner_id=excluded.owner_id,removed_by=excluded.removed_by,removed_at=excluded.removed_at').bind(repo.id,repo.owner.id,user.user_id,Date.now()),
      db.prepare('DELETE FROM building_settings WHERE repository_id=?').bind(repo.id),
      db.prepare('DELETE FROM road_registrations WHERE name=?').bind(name),
    ]);
    return Response.json({ok:true},{headers:noStore});
  }catch{return reply('Could not verify GitHub access or remove the place. Reconnect GitHub and try again.',503);}
}
