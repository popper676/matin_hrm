import { useLanguage } from '../../context/LanguageContext';

export default function ConfirmDeleteModal({ isOpen, onClose, onConfirm, itemName, warning, blockedReason }) {
  const { t } = useLanguage();
  if (!isOpen) return null;

  const isBlocked = !!blockedReason;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface-800 border border-rose-500/30 rounded-2xl w-full max-w-sm m-4 p-6 shadow-2xl shadow-rose-900/20 text-center animate-slide-in">
        <div className="w-16 h-16 bg-rose-500/10 text-rose-500 flex items-center justify-center rounded-full mx-auto mb-4">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-white mb-2">
          {isBlocked ? t('common.modal.cannotDelete') : t('common.modal.areYouSure')}
        </h2>
        <p className="text-sm text-slate-400 mb-4">
          {isBlocked ? (
            <span className="text-amber-300">{blockedReason}</span>
          ) : (
            <>{t('common.modal.aboutToDelete')} <strong className="text-white">{itemName || t('common.modal.thisItem')}</strong> {t('common.modal.cannotBeUndone')}</>
          )}
        </p>
        {!isBlocked && warning && (
          <p className="text-xs text-amber-300/90 mb-4 rounded-lg p-3 bg-amber-500/10 border border-amber-500/20 text-left">
            {warning}
          </p>
        )}
        <div className="flex justify-center gap-3">
          <button onClick={onClose} className="px-6 py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 font-semibold rounded-xl transition-colors">
            {isBlocked ? t('common.actions.close') : t('common.actions.cancel')}
          </button>
          {!isBlocked && (
            <button onClick={onConfirm} className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl transition-colors shadow-lg shadow-rose-600/20">
              {t('common.modal.yesDelete')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
