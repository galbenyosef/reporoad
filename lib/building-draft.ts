import { parseBuildingConfig, type BuildingStyle } from './repositories.ts';
import { repositoryName } from './repository-address.ts';
export const DRAFT_KEY='reporoad:add-draft';
export function parseDraft(raw:string|null, now=Date.now()):{address:string;building:BuildingStyle;floors:number;createdAt:number}|null {
  if(!raw || raw.length>12000)return null;
  try {
    const data=JSON.parse(raw), name=repositoryName(data.address);
    const building=parseBuildingConfig(JSON.stringify(data.building));
    if(!name || !building || !Number.isFinite(data.createdAt) || data.createdAt>now+60000 || now-data.createdAt>3600000)return null;
    return {address:`https://github.com/${name}`,building,floors:Math.min(50,Math.max(1,Math.floor(Number(data.floors)||1))),createdAt:data.createdAt};
  }catch{return null;}
}
