import JSZip from 'jszip';
import {DOMParser} from '@xmldom/xmldom';

const WORD_NAMESPACES=new Set([
  'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  'http://purl.oclc.org/ooxml/wordprocessingml/main',
]);
const MAX_XML_BYTES=16*1024*1024;

// Read only Word text parts in memory. Never extract ZIP paths to disk or
// follow document relationships, external links, embedded files or macros.
// The recruitment worker additionally bounds the whole archive and its heap.
export async function extractDocxText(buffer) {
  const zip=await JSZip.loadAsync(buffer);
  if(!zip.file('word/document.xml'))throw new Error('DOCX document body is missing');
  const names=['word/document.xml',...Object.keys(zip.files).filter(name=>
    /^word\/(?:footnotes|endnotes|header\d+|footer\d+)\.xml$/.test(name)).sort()];
  const parts=[];
  for(const name of names) {
    const entry=zip.file(name);
    if(!entry)continue;
    const bytes=await entry.async('uint8array');
    if(bytes.byteLength>MAX_XML_BYTES)throw new Error('DOCX text part is too large');
    const xml=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    if(/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml))throw new Error('DOCX entities and DTDs are unsupported');
    const doc=new DOMParser({onError(level,message){
      if(level!=='warning')throw new Error('Invalid DOCX XML: '+message);
    }}).parseFromString(xml,'application/xml');
    const output=[],stack=[{node:doc.documentElement}];
    while(stack.length) {
      const {node,after}=stack.pop();
      if(after){output.push(after);continue;}
      if(!node)continue;
      const word=WORD_NAMESPACES.has(node.namespaceURI),tag=node.localName;
      if(word&&['del','instrText'].includes(tag))continue;
      if(word&&tag==='t'){output.push(node.textContent);continue;}
      if(word&&['br','cr'].includes(tag)){output.push('\n');continue;}
      if(word&&tag==='tab'){output.push('\t');continue;}
      const separator=word?({p:'\n\n',tc:'\t',tr:'\n'}[tag]):null;
      if(separator)stack.push({after:separator});
      for(let child=node.lastChild;child;child=child.previousSibling)stack.push({node:child});
    }
    parts.push(output.join(''));
  }
  return parts.join('\n\n');
}
