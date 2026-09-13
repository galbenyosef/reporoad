'use client';
import { useEffect, useMemo, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Slider } from './ui/slider';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from './ui/accordion';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog';
import { Download, Code2 as Github, Check, Plus, SlidersHorizontal } from 'lucide-react';
import { Input } from './ui/input';
import { NativeSelect, NativeSelectOption } from './ui/native-select';
import RepositoryBuilding from './repository-building';
import { repositoryName } from '@/lib/repository-address';
import { DRAFT_KEY, parseDraft } from '@/lib/building-draft';
import { BUILDING_STYLES, CONFIG_PATH, parseBuildingConfig, serializeBuildingConfig, type BuildingStyle, type Repository } from '@/lib/repositories';

const LABELS = { woodland: 'Cabin', stone: 'Workshop', cafe: 'Café', brick: 'Brick house', greenhouse: 'Greenhouse', townhouse: 'Townhouse' };
const COLORS = ['#778565', '#b7d879', '#ad5542', '#ebd9bd', '#718bad'];
const defaults = (): BuildingStyle => ({ version: 1, style: 'woodland', color: '#778565', roof: 'gable', garden: true, signText: '', support: { sponsor: false, helpWanted: false } });

function PreviewCamera({floors}:{floors:number}) {
  const {camera,size,invalidate}=useThree();
  useEffect(()=>{
    const height=floors*2.4+2;
    const halfAngle=Math.min(21*Math.PI/180,Math.atan(Math.tan(21*Math.PI/180)*size.width/size.height));
    const distance=Math.hypot(6,6,height/2)/Math.sin(halfAngle)*1.1;
    const length=Math.hypot(11,6,16);
    camera.position.set(11/length*distance,height/2+6/length*distance,16/length*distance);
    camera.lookAt(0,height/2,0);camera.updateProjectionMatrix();invalidate();
  },[camera,size.width,size.height,floors,invalidate]);
  return null;
}

export default function RepoEditor({ active = true }: { active?: boolean }) {
  const [building, setBuilding] = useState<BuildingStyle>(defaults);
  const [address, setAddress] = useState('');
  const validRepository = repositoryName(address);
  const addressError = address.trim() && !validRepository ? 'Enter a GitHub repository URL, such as https://github.com/owner/repo (not a profile or file URL).' : '';
  const [identity, setIdentity] = useState('reporoad/your-repo');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [floors,setFloors] = useState(1);
  const [githubLogin,setGithubLogin] = useState<string | null>(null);
  const [customise,setCustomise] = useState<string[]>([]);
  const [yamlOpen,setYamlOpen] = useState(false);
  const [connectOpen,setConnectOpen] = useState(false);
  const [needsInstallation,setNeedsInstallation] = useState(false);
  useEffect(()=>{
    let stopped=false;
    const query=new URLSearchParams(window.location.search);
    try {
      const fragment=new URLSearchParams(window.location.hash.slice(1));
      const transferred=fragment.get('reporoad-draft');
      const draft=parseDraft(transferred || sessionStorage.getItem(DRAFT_KEY));
      if(draft){setAddress(draft.address);setBuilding(draft.building);setFloors(draft.floors);sessionStorage.setItem(DRAFT_KEY,JSON.stringify(draft));}
      if(transferred)window.history.replaceState(null,'',window.location.pathname+window.location.search);
    }catch{/* Storage may be disabled; normal editing still works. */}
    if(['connected','resume'].includes(query.get('github')||''))setConnectOpen(true);
    fetch('/api/github/session',{cache:'no-store'}).then(r=>r.json() as Promise<{login?:string}>).then(data=>{if(!stopped)setGithubLogin(data.login || null);}).catch(()=>{});
    if(query.get('github')==='error')setMessage('GitHub sign-in did not finish. Your draft is still here. Please try Add again.');
    return ()=>{stopped=true;};
  },[]);
  const preview = useMemo<Repository>(() => ({ fullName: identity, name: identity.split('/')[1], stars: floors*10000, description: '', language: null, defaultBranch: 'main', fetchedAt: 0, configStatus: 'custom', building }), [identity, building, floors]);
  const update = (patch: Partial<BuildingStyle>) => setBuilding(old => ({ ...old, ...patch }));
  function apply(raw: string) {
    const parsed = parseBuildingConfig(raw);
    if (!parsed) throw Error('Invalid settings. Use version 1, a supported style, a six-digit hex color and a gable or flat roof. Files must be under 8 KB.');
    setBuilding({ ...defaults(), ...parsed });
  }
  async function load() {
    const name = repositoryName(address);
    if (!name) { setMessage('Enter a valid public GitHub repository URL.'); return; }
    setBusy(true); setMessage('Loading settings…');
    try {
      const response = await fetch(`/api/repositories/building?source=file&repository=${encodeURIComponent(name)}`, { signal: AbortSignal.timeout(25000), cache:'no-store' });
      const data=await response.json() as {error?:string;repository:Repository;mode:string};
      if(!response.ok)throw Error(data.error || 'Could not load settings.');
      if(data.repository.configStatus!=='custom')throw Error(data.repository.configStatus==='default'?'No .reporoad.yml was found on the default branch. Download one below to get started.':'The repository YAML could not be read or is invalid. Check the file and try again.');
      apply(JSON.stringify(data.repository.building)); setIdentity(data.repository.fullName);
      setFloors(Math.min(50,Math.max(1,Math.floor(data.repository.stars/10000))));
      setMessage('YAML checked and loaded. Open Customise to edit the building.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to load settings.'); }
    finally { setBusy(false); }
  }
  async function saveDesign(settingsMode: 'website'|'file' = 'website') {
    if (!repositoryName(address)) { setMessage('Enter a valid public GitHub repository URL.'); return; }
    setBusy(true);setMessage('Verifying GitHub permissions…');
    try {
      const response=await fetch('/api/repositories/building',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({repository:address,mode:settingsMode,building}),signal:AbortSignal.timeout(45000)});
      const data=await response.json() as {error?:string;code?:string};
      if(response.status===401){setGithubLogin(null);setConnectOpen(true);throw Error('Sign in to GitHub to continue. Your draft is still here.');}
      if(data.code==='installation_required'){setNeedsInstallation(true);setConnectOpen(true);throw Error(data.error);}
      if(!response.ok)throw Error(data.error || 'Could not save.');
      setConnectOpen(false);setNeedsInstallation(false);
      try{sessionStorage.removeItem(DRAFT_KEY);}catch{}
      setMessage(settingsMode==='website'?'Saved! Your design is now on the shared road.':'File-managed settings restored. Website overrides have been removed.');
      window.dispatchEvent(new Event('reporoad:directory-updated'));
    } catch(error){setMessage(error instanceof Error?error.message:'Could not save. Your preview is still here.');}
    finally{setBusy(false);}
  }
  function download() {
    const content = serializeBuildingConfig(building);
    if (!parseBuildingConfig(content)) { setMessage('Check your settings before downloading.'); return; }
    const url = URL.createObjectURL(new Blob([content], { type: 'application/yaml' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = CONFIG_PATH; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage(`Downloaded ${CONFIG_PATH}. Commit it at the root of your public repository on its default branch.`);
  }
  function connectGithub() {
    const raw=JSON.stringify({address,building,floors,createdAt:Date.now()});
    if(!parseDraft(raw)){setMessage('Enter a valid repository and settings first.');return;}
    try{sessionStorage.setItem(DRAFT_KEY,raw);}catch{setMessage('Allow browser storage to keep your draft during sign-in, or download the YAML first.');return;}
    if(window.location.origin!=='https://reporoad.org') {
      window.location.assign(`https://reporoad.org/?tab=add&github=resume#reporoad-draft=${encodeURIComponent(raw)}`);
    }else window.location.assign('/api/github/start');
  }
  return <section className="place-editor">
    <label htmlFor="load-repo">Repository URL</label>
    <Input id="load-repo" placeholder="https://github.com/owner/repo" value={address} onChange={e => setAddress(e.target.value)} aria-invalid={!!addressError} aria-describedby={addressError?'repo-url-error':undefined} />
    {addressError && <p id="repo-url-error" className="repo-url-error">{addressError}</p>}
    <Accordion className="customise-accordion" value={customise} onValueChange={value=>setCustomise(value as string[])}>
    <AccordionItem value="customise">
    <AccordionTrigger><span className="customise-label"><SlidersHorizontal size={18}/> Customise</span></AccordionTrigger>
    <AccordionContent>
    <div className="place-preview" aria-label="Live building preview">
      {active && customise.includes('customise') && <Canvas frameloop="demand" dpr={[1, 1.5]} camera={{ position: [11, 8, 16], fov: 42, near: 0.1, far: 2000 }}>
        <PreviewCamera floors={floors}/>
        <color attach="background" args={['#18221c']}/><ambientLight intensity={1.4}/><directionalLight position={[3, 10, 6]} intensity={3}/>
        <RepositoryBuilding repo={preview} season="Summer"/>
      </Canvas>}<small>Live preview · {floors} {floors===1?'floor':'floors'}</small>
    </div>
    <label id="preview-floors-label">Preview height · {floors} {floors===1?'floor':'floors'}</label>
    <Slider aria-labelledby="preview-floors-label" min={1} max={50} step={1} value={[floors]} onValueChange={value=>setFloors(Array.isArray(value)?value[0]:value)}/>
    <p className="fine">Preview only. Actual height comes from GitHub stars: one floor per 10,000 stars, with a minimum of one.</p>
    <label>Building</label><div className="building-choices">{(['woodland', 'stone', 'cafe', 'brick', 'greenhouse', 'townhouse'] as typeof BUILDING_STYLES[number][]).map(style => <button key={style} className={`building-choice ${building.style === style ? 'selected' : ''}`} aria-pressed={building.style === style} onClick={() => update({ style })}>
      <svg viewBox="0 0 80 60" aria-hidden="true"><rect x="15" y="25" width="50" height="30" fill={style === 'stone' ? '#81877d' : style === 'greenhouse' ? '#6f9e91' : building.color}/><path d={style === 'townhouse' ? 'M10 24H70V18H10Z' : 'M7 26L40 5L73 26Z'} fill="#55432f"/><rect x="34" y="35" width="13" height="20" fill="#443623"/><path d="M21 33h8v10h-8zm32 0h8v10h-8z" fill="#efc774"/>{style === 'cafe' && <path d="M12 28h56v8H12z" fill="#f1d3a1"/>}</svg>
      {building.style === style && <Check size={15}/>}<span>{LABELS[style]}</span></button>)}</div>
    <label htmlFor="sign-text">Sign text</label><Input id="sign-text" maxLength={48} placeholder="Repository name (default)" value={building.signText || ''} onChange={e => update({ signText: e.target.value })}/>
    <label>Accent color</label><div className="accent-choices">{COLORS.map(color => <button key={color} aria-label={`Accent ${color}`} aria-pressed={building.color === color} style={{ background: color }} onClick={() => update({ color })}>{building.color === color && <Check size={17}/>}</button>)}<input type="color" aria-label="Custom accent color" value={building.color} onChange={e => update({ color: e.target.value })}/></div>
    <label htmlFor="roof">Roof</label><NativeSelect id="roof" value={building.roof} onChange={e => update({ roof: e.target.value as BuildingStyle['roof'] })}><NativeSelectOption value="gable">Gable</NativeSelectOption><NativeSelectOption value="flat">Flat</NativeSelectOption></NativeSelect>
    <label className="place-toggle">Garden<input type="checkbox" role="switch" checked={building.garden !== false} onChange={e => update({ garden: e.target.checked })}/></label>
    <label className="place-toggle">Help wanted sign<input type="checkbox" role="switch" checked={!!building.support?.helpWanted} onChange={e => update({ support: { ...building.support, helpWanted: e.target.checked } })}/></label>
    <label className="place-toggle">Sponsor heart<input type="checkbox" role="switch" checked={!!building.support?.sponsor} onChange={e => update({ support: { ...building.support, sponsor: e.target.checked } })}/></label>
    <p className="fine">The heart indicates that the repository is seeking sponsorship. Visitors can open the repository to learn more.</p>
    <button className="reset-place" onClick={() => { setBuilding(defaults()); setFloors(1); setIdentity('reporoad/your-repo'); setMessage(''); }}>Reset customisation</button>
    </AccordionContent>
    </AccordionItem>
    </Accordion>
    <div className="place-add-actions">
      <button className="btn primary" disabled={busy || !validRepository} onClick={()=>{if(validRepository){setMessage('');setNeedsInstallation(false);setConnectOpen(true);}}}>{busy?'Adding…':'Add'}</button>
      <button className="btn icon" aria-label="Add using a YAML file" title="Add using a YAML file" onClick={()=>setYamlOpen(true)}><Plus size={20}/></button>
    </div>
    {message && <p className="notice" role="status">{message}</p>}
    <Dialog open={yamlOpen} onOpenChange={setYamlOpen}>
      <DialogContent className="repo-workflow-dialog">
        <DialogTitle>Add with a repository file</DialogTitle>
        <DialogDescription>You can also add your place by creating a <code>.reporoad.yml</code> file at the root of your repository on its default branch. Download your current design and commit the file, then click “Load / check YAML from URL” to confirm the file can be found and loads correctly.</DialogDescription>
        <label htmlFor="yaml-repository-url">Repository URL</label>
        <Input id="yaml-repository-url" value={address} onChange={e=>setAddress(e.target.value)} placeholder="https://github.com/owner/repo" aria-invalid={!!addressError} aria-describedby={addressError?'yaml-url-error':undefined} />
        {addressError && <p id="yaml-url-error" className="repo-url-error">{addressError}</p>}
        <button className="btn primary" onClick={download}><Download size={17}/> Download YAML file</button>
        <button className="btn" disabled={busy || !validRepository} onClick={()=>void load()}>{busy?'Checking…':'Load / check YAML from URL'}</button>
        {githubLogin && <button className="btn" disabled={busy || !validRepository} onClick={()=>void saveDesign('file')}>Use repository file instead of website settings</button>}
        {message && <p className="notice" role="status">{message}</p>}
      </DialogContent>
    </Dialog>
    <Dialog open={connectOpen} onOpenChange={setConnectOpen}>
      <DialogContent className="repo-workflow-dialog">
        <DialogTitle>Add with GitHub</DialogTitle>
        <DialogDescription>{!githubLogin?'Sign in to verify your GitHub account. We’ll guide you through repository access next and keep your design ready.':needsInstallation?'Choose this repository in GitHub’s access settings. Return here when you’re done; we’ll verify access before adding it.':`Connected as ${githubLogin}. We’ll check repository access and add your saved design. If access is missing, we’ll guide you through enabling it.`}</DialogDescription>
        <ol className="github-steps"><li data-current={!githubLogin}>1. Sign in {githubLogin && <Check size={16}/>}</li><li data-current={!!githubLogin && needsInstallation}>2. Enable repository access</li><li data-current={!!githubLogin && !needsInstallation}>3. Add your place</li></ol>
        <p className="fine">{validRepository || 'Enter a repository URL first.'}</p>
        {!githubLogin ? <button className="btn primary" disabled={!validRepository} onClick={connectGithub}><Github size={18}/> Continue with GitHub</button> : <>
          {needsInstallation && <a className="btn" href="https://github.com/apps/reporoad/installations/new" target="_blank" rel="noopener noreferrer">Enable repository access on GitHub</a>}
          <button className="btn primary" disabled={busy || !validRepository} onClick={()=>void saveDesign('website')}>{busy?'Checking access…':needsInstallation?'Check access & add':'Add my place'}</button>
        </>}
        <p className="fine">No code-writing access. Only repository owners and administrators can add a place.</p>
        {message && <p className="notice" role="status">{message}</p>}
      </DialogContent>
    </Dialog>
  </section>;
}
