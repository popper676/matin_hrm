import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAvatarImage } from '../lib/avatarUpload.js';

const bytes = {
  png: Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]),
  jpg: Buffer.from([255,216,255,224,0,16,74,70,73,70]),
  webp: Buffer.concat([Buffer.from('RIFF'),Buffer.alloc(4),Buffer.from('WEBP')]),
};
const avatar=(name,mimetype,buffer)=>({originalname:name,mimetype,buffer,size:buffer.length});
test('BUG-005 avatar accepts matching PNG, JPEG and WebP signatures',()=>{
  assert.equal(validateAvatarImage(avatar('me.PNG','image/png',bytes.png)).extension,'png');
  assert.equal(validateAvatarImage(avatar('me.jpeg','image/jpeg',bytes.jpg)).extension,'jpg');
  assert.equal(validateAvatarImage(avatar('me.webp','image/webp',bytes.webp)).mime,'image/webp');
});
test('BUG-005 avatar rejects disguised scripts, mismatched MIME and non-images',()=>{
  const bad=[
    avatar('me.png','image/png',Buffer.from('<script>bad</script>')),
    avatar('me.svg','image/svg+xml',Buffer.from('<svg></svg>')),
    avatar('me.webp','image/png',bytes.webp),
    avatar('me.jpg','image/jpeg',bytes.png),
    avatar('me.jpg','image/jpeg',Buffer.alloc(0)),
    avatar('me.png','image/png',Buffer.alloc(10*1024*1024+1)),
  ];
  for(const file of bad)assert.throws(()=>validateAvatarImage(file),{status:400});
});
