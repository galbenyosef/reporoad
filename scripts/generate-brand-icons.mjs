// Mechanical format/size conversion; preserves the supplied artwork and alpha.
import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
const input = process.argv[2];
if (!input) throw new Error('Pass the path to the supplied logo PNG.');
const png = size => sharp(input).resize(size, size, {fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
await writeFile('public/reporoad-logo.png', await png(256));
await writeFile('public/apple-touch-icon.png', await png(180));
for (const size of [16,32,48]) await writeFile(`public/favicon-${size}.png`, await png(size));
// ICO directory with embedded PNG images, supported by current browsers.
const sizes=[16,32,48], images=await Promise.all(sizes.map(png));
const header=Buffer.alloc(6+16*sizes.length);header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);
let offset=header.length;
images.forEach((image,i)=>{const at=6+i*16;header[at]=sizes[i];header[at+1]=sizes[i];header.writeUInt16LE(1,at+4);header.writeUInt16LE(32,at+6);header.writeUInt32LE(image.length,at+8);header.writeUInt32LE(offset,at+12);offset+=image.length;});
await writeFile('public/favicon.ico',Buffer.concat([header,...images]));
