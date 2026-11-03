
export default function ConfirmModal({ isOpen, onClose, onConfirm, title, message, confirmText, confirmStyle = 'danger' }) {
  if (!isOpen) return null;

  const getStyleClass = () => {
    switch(confirmStyle) {
      case 'danger': return 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20';
      case 'success': return 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20';
      case 'primary': return 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/20';
      default: return 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/20';
    }
  };

  const getIconColorClass = () => {
    switch(confirmStyle) {
      case 'danger': return 'bg-rose-500/10 text-rose-500';
      case 'success': return 'bg-emerald-500/10 text-emerald-500';
      case 'primary': return 'bg-indigo-500/10 text-indigo-500';
      default: return 'bg-indigo-500/10 text-indigo-500';
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface-800 border border-white/10 rounded-2xl w-full max-w-sm m-4 p-6 shadow-2xl animate-slide-in text-center">
        <div className={`w-16 h-16 flex items-center justify-center rounded-full mx-auto mb-4 ${getIconColorClass()}`}>
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-white mb-2">{title}</h2>
        <p className="text-sm text-slate-400 mb-6">{message}</p>
        
        <div className="flex justify-center gap-3">
          <button onClick={onClose} className="px-6 py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 font-semibold rounded-xl transition-colors">
            Cancel
          </button>
          <button 
            onClick={() => { onConfirm(); onClose(); }} 
            className={`px-6 py-2.5 text-white font-bold rounded-xl transition-colors shadow-lg ${getStyleClass()}`}
          >
            {confirmText || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
