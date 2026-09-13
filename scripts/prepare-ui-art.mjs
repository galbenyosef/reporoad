// Format-only optimization of generated artwork. Keep the frame's alpha intact.
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
const [header, frame, panel] = process.argv.slice(2);
if (!header || !frame || !panel) throw Error('Provide header, transparent frame and panel PNG paths.');
await mkdir('public/art', { recursive: true });
for (const [source, name] of [[header, 'workshop-header'], [frame, 'drive-frame'], [panel, 'voxel-panel']]) {
  await sharp(source).webp({ quality: 90, alphaQuality: 100 }).toFile(`public/art/${name}.webp`);
}
