import test from 'node:test';
import assert from 'node:assert/strict';
import exclusions from '../scripts/music/excluded-tracks.json' with {type:'json'};
import {loadMusicLibrary,PLAYLIST,TRACK_DURATIONS} from '../lib/playlist.ts';
test('review exclusions are skipped even in an older hosted catalog',async()=>{
  assert.equal(new Set(exclusions.tracks.map(t=>t.src)).size,201);
  const bad={...exclusions.tracks[0],duration:300};
  const good={name:'Good test track',collection:'test',src:'/music/library/test/good.mp3',duration:240};
  await loadMusicLibrary(async()=>Response.json({tracks:[bad,good]}));
  assert.deepEqual(PLAYLIST,[{name:good.name,collection:good.collection,src:good.src}]);
  assert.deepEqual(TRACK_DURATIONS,[240]);
  await assert.rejects(loadMusicLibrary(async()=>Response.json({tracks:[bad]})),/No playable tracks/);
});
