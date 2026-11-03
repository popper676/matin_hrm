import {cleanManualHtml} from '../../utils/manualHtml.js';
import { useRef, useEffect } from 'react';

export default function RichTextEditor({ value, onChange }) {
  const editorRef = useRef(null);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = cleanManualHtml(value);
    }
  }, [value]);

  const handleInput = () => {
    if (editorRef.current) {
      onChange(cleanManualHtml(editorRef.current.innerHTML));
    }
  };

  const exec = (command, value = null) => {
    document.execCommand(command, false, value);
    editorRef.current.focus();
    handleInput();
  };

  return (
    <div className="border border-white/20 rounded-lg overflow-hidden flex flex-col h-full">
      <div className="bg-surface-850 border-b border-white/20 p-2 flex flex-wrap gap-2 items-center">
        <button type="button" onClick={() => exec('formatBlock', 'H1')} className="px-2 py-1 text-sm bg-surface-800 border border-white/10 rounded hover:bg-white/10 text-slate-300 hover:text-white font-bold">H1</button>
        <button type="button" onClick={() => exec('formatBlock', 'H2')} className="px-2 py-1 text-sm bg-surface-800 border border-white/10 rounded hover:bg-white/10 text-slate-300 hover:text-white font-bold">H2</button>
        <button type="button" onClick={() => exec('bold')} className="px-2 py-1 text-sm bg-surface-800 border border-white/10 rounded hover:bg-white/10 text-slate-300 hover:text-white font-bold">B</button>
        <button type="button" onClick={() => exec('italic')} className="px-2 py-1 text-sm bg-surface-800 border border-white/10 rounded hover:bg-white/10 text-slate-300 hover:text-white italic">I</button>
        <button type="button" onClick={() => exec('insertUnorderedList')} className="px-2 py-1 text-sm bg-surface-800 border border-white/10 rounded hover:bg-white/10 text-slate-300 hover:text-white">• List</button>
        <button type="button" onClick={() => exec('insertOrderedList')} className="px-2 py-1 text-sm bg-surface-800 border border-white/10 rounded hover:bg-white/10 text-slate-300 hover:text-white">1. List</button>
      </div>
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        onPaste={event=>{event.preventDefault();document.execCommand('insertHTML',false,cleanManualHtml(event.clipboardData.getData('text/html')||event.clipboardData.getData('text/plain').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')));handleInput();}}
        onDrop={event=>event.preventDefault()}
        className="flex-1 p-4 bg-surface-900 overflow-y-auto focus:outline-none prose prose-invert max-w-none"
        style={{ minHeight: '300px' }}
      />
    </div>
  );
}
