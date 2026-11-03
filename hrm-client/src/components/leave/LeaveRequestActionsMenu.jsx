import Icon from '../common/Icon';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export default function LeaveRequestActionsMenu({ isOpen, onToggle, onClose, items }) {
  const ref = useRef(null);
  const [menuPos, setMenuPos] = useState(null);

  useEffect(() => {
    if (!isOpen) {
      setMenuPos(null);
      return;
    }
    const updatePos = () => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const menuHeight = 280;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < menuHeight && rect.top > menuHeight;
      setMenuPos({
        top: openUp ? rect.top - 4 : rect.bottom + 4,
        left: Math.max(8, rect.right - 220),
        transform: openUp ? 'translateY(-100%)' : 'none',
      });
    };
    updatePos();
    window.addEventListener('resize', updatePos);
    window.addEventListener('scroll', updatePos, true);
    return () => {
      window.removeEventListener('resize', updatePos);
      window.removeEventListener('scroll', updatePos, true);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (ref.current?.contains(e.target)) return;
      const portal = document.getElementById('leave-actions-menu-portal');
      if (portal?.contains(e.target)) return;
      onClose();
    };
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', esc);
    };
  }, [isOpen, onClose]);

  const visible = items.filter(i => i.show !== false);

  const menu = isOpen && visible.length > 0 && menuPos && createPortal(
    <div
      id="leave-actions-menu-portal"
      className="fixed z-[200] min-w-[220px] py-1 rounded-xl shadow-2xl border border-white/10 overflow-hidden"
      style={{ top: menuPos.top, left: menuPos.left, transform: menuPos.transform, background: 'var(--bg-800, #1e2235)' }}
    >
      {visible.map(item => (
        <button
          key={item.id}
          type="button"
          disabled={item.disabled}
          onClick={() => { item.onClick(); onClose(); }}
          className={`w-full text-left px-4 py-2.5 text-xs font-medium transition-colors flex items-center gap-2 ${
            item.danger
              ? 'text-rose-400 hover:bg-rose-500/10 disabled:opacity-40'
              : item.primary
                ? 'text-indigo-300 hover:bg-indigo-500/10 disabled:opacity-40'
                : 'text-slate-300 hover:bg-white/5 disabled:opacity-40'
          }`}
        >
          {item.icon && <span className="text-sm flex-shrink-0">{typeof item.icon === 'string' ? <Icon name={item.icon} size={16}/> : item.icon}</span>}
          <span>{item.label}</span>
        </button>
      ))}
    </div>,
    document.body
  );

  return (
    <>
      <div ref={ref}>
        <button
          type="button"
          onClick={onToggle}
          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          title="More actions"
          aria-label="More actions"
          aria-expanded={isOpen}
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
          </svg>
        </button>
      </div>
      {menu}
    </>
  );
}

export function buildLeaveRequestMenuItems(request, handlers, { isAdmin, t }) {
  const items = [
    {
      id: 'details',
      label: t('hrm.leave.actions.details'),
      icon: '📋',
      onClick: () => handlers.onDetails(request),
    },
  ];

  if (!isAdmin) return items;

  if (request.status === 'Pending' && !request.approval_id) {
    items.push(
      { id: 'approve', label: t('hrm.leave.actions.approve'), icon: '✓', primary: true, onClick: () => handlers.onApprove(request) },
      { id: 'reject', label: t('hrm.leave.actions.reject'), icon: '✕', danger: true, onClick: () => handlers.onReject(request) },
    );
  }

  if(request.approval_id&&handlers.onApprovals)items.push({id:'approvals',label:'View approval route',icon:'active',onClick:()=>handlers.onApprovals(request)});
  if (request.can_start_coverage) {
    items.push({ id: 'start-cov', label: t('hrm.leave.actions.startCov'), icon: '▶', primary: true, onClick: () => handlers.onStartCoverage(request) });
  }
  if (request.can_view_coverage_history) {
    items.push({
      id: 'view-cov',
      label: request.coverage_handover_is_terminal ? t('hrm.leave.actions.covHistory') : t('hrm.leave.actions.openCov'),
      icon: '📤',
      onClick: () => handlers.onViewCoverage(request),
    });
  }
  if (request.can_start_return) {
    items.push({ id: 'start-ret', label: t('hrm.leave.actions.startRet'), icon: '↩', primary: true, onClick: () => handlers.onStartReturn(request) });
  }
  if (request.can_view_return_history) {
    items.push({
      id: 'view-ret',
      label: request.return_handover_is_terminal ? t('hrm.leave.actions.retHistory') : t('hrm.leave.actions.openRet'),
      icon: '📥',
      onClick: () => handlers.onViewReturn(request),
    });
  }

  items.push({
    id: 'delete',
    label: t('hrm.leave.actions.delete'),
    icon: '🗑',
    danger: true,
    disabled: request.can_delete_leave === false,
    onClick: () => handlers.onDelete(request),
  });

  return items;
}
