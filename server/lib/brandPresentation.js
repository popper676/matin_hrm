import {DEFAULT_BRANDING,brandPalette} from '../../shared/branding.js';
export function drawBrandHeader(doc,settings=DEFAULT_BRANDING,size=11) {
 const b={...DEFAULT_BRANDING,...settings},top=doc.y,x=doc.page.margins.left,width=doc.page.width-x-doc.page.margins.right;
 doc.fontSize(size).fillColor(brandPalette(b.accent).text);
 if(b.logoBuffer){doc.text(b.name,x,top,{width:width-48});const after=doc.y;try{doc.image(b.logoBuffer,x+width-34,top,{fit:[34,34]});}catch{/* Keep the name if a stored image is unavailable. */}doc.y=Math.max(after,top+34)+7;}
 else doc.text(b.name);
}
