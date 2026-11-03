// Validated avatar formats; extension and MIME alone are user-controlled.
// Never allow SVG or HTML in a file served as an employee image.
export function validateAvatarImage(file) {
  if (!file?.buffer?.length || file.buffer.length > 10 * 1024 * 1024)
    throw Object.assign(new Error('Choose a JPEG, PNG or WebP image up to 10 MB.'), {status:400});
  const extension = file.originalname?.split('.').pop()?.toLowerCase();
  const formats = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  };
  const mime = formats[extension];
  if (!mime || file.mimetype !== mime)
    throw Object.assign(new Error('Choose a valid JPEG, PNG or WebP avatar.'), {status:400});
  const bytes = file.buffer;
  const valid = mime === 'image/jpeg'
    ? bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : mime === 'image/png'
      ? bytes.length >= 8 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      : bytes.length >= 12 && bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP';
  if (!valid)
    throw Object.assign(new Error('The avatar file content does not match its declared image format.'), {status:400});
  return {mime, extension:extension === 'jpeg' ? 'jpg' : extension};
}
