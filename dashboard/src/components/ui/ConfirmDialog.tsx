import { useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, X } from "lucide-react";
import { useDialogA11y } from "@/hooks/useDialogA11y";

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string | ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
  confirmText?: string; // If set, user must type this to confirm
  loading?: boolean;
  icon?: React.ElementType;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  confirmText,
  loading = false,
  icon: Icon = AlertTriangle,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState("");
  const canConfirm = confirmText ? typed === confirmText : true;

  const handleConfirm = () => {
    if (!canConfirm || loading) return;
    onConfirm();
    setTyped("");
  };

  const handleClose = () => {
    if (loading) return;
    setTyped("");
    onClose();
  };

  const dialogRef = useDialogA11y(handleClose);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
            onClick={handleClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[101] w-full max-w-md"
          >
            <div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="confirm-dialog-title"
              aria-describedby="confirm-dialog-desc"
              className="bg-surface-1 border border-border rounded-xl shadow-2xl overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-start gap-3 px-5 pt-5 pb-3">
                <div className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${
                  variant === "destructive" ? "bg-red-500/15" : "bg-amber-500/15"
                }`}>
                  <Icon className={`w-5 h-5 ${
                    variant === "destructive" ? "text-red-400" : "text-amber-400"
                  }`} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 id="confirm-dialog-title" className="text-sm font-display font-semibold text-foreground">{title}</h3>
                  <div id="confirm-dialog-desc" className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</div>
                </div>
                <button
                  onClick={handleClose}
                  className="shrink-0 p-1 rounded-md hover:bg-surface-2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Confirm text input */}
              {confirmText && (
                <div className="px-5 pb-3">
                  <p className="text-[11px] text-muted-foreground mb-1.5">
                    Type <code className="font-mono text-foreground bg-surface-2 px-1 py-0.5 rounded text-[10px]">{confirmText}</code> to confirm
                  </p>
                  <input
                    type="text"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    placeholder={confirmText}
                    className="w-full h-9 px-3 text-xs bg-surface-0 border border-border rounded-md text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-cordum font-mono"
                  />
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-surface-0/50">
                <button
                  onClick={handleClose}
                  disabled={loading}
                  className="h-8 px-4 text-xs font-medium rounded-md border border-border text-foreground hover:bg-surface-2 transition-colors disabled:opacity-50"
                >
                  {cancelLabel}
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={!canConfirm || loading}
                  className={`h-8 px-4 text-xs font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    variant === "destructive"
                      ? "bg-red-500 text-white hover:bg-red-600"
                      : "bg-cordum text-surface-0 hover:bg-cordum-dim"
                  }`}
                >
                  {loading ? (
                    <span className="flex items-center gap-1.5">
                      <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-25" />
                        <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                      </svg>
                      Processing...
                    </span>
                  ) : confirmLabel}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
