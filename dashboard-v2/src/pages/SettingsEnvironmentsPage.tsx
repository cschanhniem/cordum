import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { InstrumentCard, InstrumentCardBody } from "@/components/ui/InstrumentCard";
import { Button } from "@/components/ui/Button";
import { Globe, ArrowLeft } from "lucide-react";

export default function SettingsEnvironmentsPage() {
  const navigate = useNavigate();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Environments"
        subtitle="Manage deployment environments"
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate(-1 as any)}>
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </Button>
        }
      />
      <InstrumentCard>
        <InstrumentCardBody className="py-16">
          <div className="flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-xl bg-cordum/10 flex items-center justify-center text-cordum mb-4">
              <Globe className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-semibold font-display text-foreground mb-1">Environments</h3>
            <p className="text-xs text-muted-foreground max-w-md">
              Configure and manage staging, production, and custom environments.
            </p>
          </div>
        </InstrumentCardBody>
      </InstrumentCard>
    </div>
  );
}
