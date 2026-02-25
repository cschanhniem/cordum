import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { ArrowLeft } from "lucide-react";

export default function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <div className="text-6xl font-bold font-display text-cordum/20 mb-4">404</div>
      <h1 className="text-xl font-bold font-display text-foreground mb-2">Page Not Found</h1>
      <p className="text-sm text-muted-foreground mb-6">The page you're looking for doesn't exist or has been moved.</p>
      <Button variant="primary" size="sm" onClick={() => navigate("/")}>
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Dashboard
      </Button>
    </div>
  );
}
