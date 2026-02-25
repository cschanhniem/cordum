import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useConfigStore } from "@/state/config";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { toast } from "sonner";
import { KeyRound, ArrowRight } from "lucide-react";

export default function LoginPage() {
  const navigate = useNavigate();
  const login = useConfigStore((s) => s.login);
  const [apiUrl, setApiUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!apiKey.trim()) {
      toast.error("API key is required");
      return;
    }
    setLoading(true);
    try {
      // Attempt to validate the key by fetching user info
      const baseUrl = apiUrl.trim() || "/api/v1";
      const res = await fetch(`${baseUrl}/auth/me`, {
        headers: { Authorization: `Bearer ${apiKey.trim()}` },
      });
      if (res.ok) {
        const user = await res.json();
        login(apiKey.trim(), user);
        toast.success("Connected to Cordum");
        navigate("/");
      } else {
        // Still allow login with just the key
        login(apiKey.trim(), {
          id: "local",
          username: "operator",
          email: "",
          display_name: "Operator",
          roles: ["admin"],
          tenant: "default",
        });
        toast.success("Connected");
        navigate("/");
      }
    } catch {
      // Allow login anyway for local dev
      login(apiKey.trim(), {
        id: "local",
        username: "operator",
        email: "",
        display_name: "Operator",
        roles: ["admin"],
        tenant: "default",
      });
      toast.success("Connected (offline mode)");
      navigate("/");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 rounded-xl bg-cordum flex items-center justify-center mb-4">
            <span className="text-lg font-bold text-[#0f1518] font-display">C</span>
          </div>
          <h1 className="text-xl font-bold font-display text-foreground">Cordum</h1>
          <p className="text-sm text-muted-foreground mt-1">Agent Control Plane</p>
        </div>

        {/* Form */}
        <div className="space-y-4 p-6 rounded-lg border border-border bg-card" style={{ boxShadow: "var(--shadow-md)" }}>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              API Endpoint
            </label>
            <Input
              placeholder="http://localhost:8080/api/v1"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              API Key
            </label>
            <Input
              type="password"
              placeholder="Enter your API key"
              icon={<KeyRound className="w-3.5 h-3.5" />}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            />
          </div>
          <Button variant="primary" className="w-full" loading={loading} onClick={handleLogin}>
            Connect <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Need help? Check the{" "}
          <a href="https://cordum.io/docs" className="text-cordum hover:text-cordum-light transition-colors">
            documentation
          </a>
        </p>
      </div>
    </div>
  );
}
