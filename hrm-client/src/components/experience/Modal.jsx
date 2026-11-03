import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import Icon from "../common/Icon";
export default function Modal({
  open,
  onClose,
  title,
  description,
  children,
  wide = false,
  busy = false,
}) {
  const ref = useRef(null),
    close = useRef(onClose),
    titleId = useId(),
    pending = useRef(busy);
  close.current = onClose;
  pending.current = busy;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement,
      overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = setTimeout(() => {
      if (ref.current?.contains(document.activeElement)) return;
      const first = ref.current?.querySelector(
        "input:not([type=hidden]):not(:disabled),select:not(:disabled),textarea:not(:disabled)",
      ) || ref.current?.querySelector("button:not(:disabled)");
      first?.focus({ preventScroll: true });
    }, 10);
    const handler = (e) => {
      if (e.key === "Escape" && !pending.current) close.current();
      if (e.key === "Tab") {
        const nodes = [
            ...ref.current.querySelectorAll(
              'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
            ),
          ].filter((n) => n.offsetParent !== null),
          first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      clearTimeout(timer);
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, [open]);
  if (!open) return null;
  return createPortal(
    <div className="uyf-app uyf-shell ux-modal-layer">
      <button
        type="button"
        tabIndex={-1}
        className="ux-modal-scrim"
        onClick={() => !busy && onClose()}
        aria-label="Close dialog"
      />
      <section
        ref={ref}
        className={`ux-modal ${wide ? "ux-modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header>
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            aria-label="Close dialog"
          >
            <Icon name="close" size={19} />
          </button>
        </header>
        {children}
      </section>
    </div>,
    document.body,
  );
}
