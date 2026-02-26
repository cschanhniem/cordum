import { useNavigate } from "react-router-dom";
import { ShieldX, ServerCrash } from "lucide-react";
import { motion } from "framer-motion";

export function ForbiddenPage() {
  const navigate = useNavigate();
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center min-h-[60vh] text-center"
    >
      <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mb-5">
        <ShieldX className="w-8 h-8 text-red-400" />
      </div>
      <h1 className="text-xl font-display font-bold text-foreground mb-2">Access Denied</h1>
      <p className="text-sm text-muted-foreground max-w-sm mb-6">
        You don't have permission to view this page. Contact your administrator.
      </p>
      <button
        onClick={() => navigate("/")}
        className="h-9 px-5 text-xs font-medium rounded-md bg-cordum text-surface-0 hover:bg-cordum-dim transition-colors"
      >
        Go Home
      </button>
    </motion.div>
  );
}

export function ServerErrorPage() {
  const navigate = useNavigate();
  const errorId = `ERR-${Date.now().toString(36).toUpperCase()}`;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center min-h-[60vh] text-center"
    >
      <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mb-5">
        <ServerCrash className="w-8 h-8 text-red-400" />
      </div>
      <h1 className="text-xl font-display font-bold text-foreground mb-2">Something Went Wrong</h1>
      <p className="text-sm text-muted-foreground max-w-sm mb-2">
        An unexpected error occurred. Please try again or contact support.
      </p>
      <p className="text-[10px] font-mono text-muted-foreground/60 mb-6">
        Error ID: {errorId}
      </p>
      <div className="flex items-center gap-3">
        <button
          onClick={() => window.location.reload()}
          className="h-9 px-5 text-xs font-medium rounded-md bg-cordum text-surface-0 hover:bg-cordum-dim transition-colors"
        >
          Try Again
        </button>
        <button
          onClick={() => navigate("/")}
          className="h-9 px-5 text-xs font-medium rounded-md border border-border text-foreground hover:bg-surface-2 transition-colors"
        >
          Go Home
        </button>
      </div>
    </motion.div>
  );
}
