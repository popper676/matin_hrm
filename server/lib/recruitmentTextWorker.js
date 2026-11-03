import { parentPort, workerData } from 'node:worker_threads';
import {extractDocxText} from './docxText.js';
import { inflateRawSync } from 'node:zlib';
import { extractText, getDocumentProxy } from 'unpdf';
// Bound the expanded archive before the XML reader reads document parts.
function checkDocxArchive(buffer) {
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0 || buffer.readUInt16LE(end + 4) || buffer.readUInt16LE(end + 6))
    throw new Error('Unsupported archive');
  const count = buffer.readUInt16LE(end + 10);
  let cursor = buffer.readUInt32LE(end + 16),
    total = 0;
  if (!count || count > 512) throw new Error('Too many archive entries');
  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Invalid archive');
    const flags = buffer.readUInt16LE(cursor + 8),
      method = buffer.readUInt16LE(cursor + 10);
    const compressed = buffer.readUInt32LE(cursor + 20),
      expanded = buffer.readUInt32LE(cursor + 24);
    const local = buffer.readUInt32LE(cursor + 42);
    total += expanded;
    if (
      flags & 1 ||
      ![0, 8].includes(method) ||
      expanded > 16 * 1024 * 1024 ||
      total > 32 * 1024 * 1024 ||
      local >= cursor
    )
      throw new Error('Archive limit');
    if (buffer.readUInt32LE(local) !== 0x04034b50) throw new Error('Invalid archive entry');
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    if (start + compressed > cursor) throw new Error('Invalid archive size');
    const data = buffer.subarray(start, start + compressed);
    const actual =
      method === 0
        ? data.length
        : inflateRawSync(data, { maxOutputLength: 16 * 1024 * 1024 }).length;
    if (actual !== expanded) throw new Error('Invalid expanded size');
    cursor +=
      46 +
      buffer.readUInt16LE(cursor + 28) +
      buffer.readUInt16LE(cursor + 30) +
      buffer.readUInt16LE(cursor + 32);
  }
}
try {
  const buffer = Buffer.from(workerData.bytes);
  let text = '';
  if (workerData.type === 'txt') text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  if (workerData.type === 'docx') {
    checkDocxArchive(buffer);
    text = await extractDocxText(buffer);
  }
  if (workerData.type === 'pdf') {
    const pdf = await getDocumentProxy(new Uint8Array(buffer), {
      maxImageSize: 16777216,
      isEvalSupported: false,
    });
    try {
      if (pdf.numPages > 50) throw new Error('Use a document with at most 50 pages');
      text = (await extractText(pdf, { mergePages: true })).text;
    } finally {
      await pdf.loadingTask.destroy();
    }
  }
  text = text.replace(/\u0000/g, '').trim();
  parentPort.postMessage({
    text: text.slice(0, 50000),
    status: text.length > 50000 ? 'truncated' : text ? 'ready' : 'empty',
  });
} catch {
  parentPort.postMessage({ text: '', status: 'failed' });
}
