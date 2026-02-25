import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { InstrumentCard, InstrumentCardBody } from "@/components/ui/InstrumentCard";
import { Button } from "@/components/ui/Button";
import { Activity, ArrowLeft } from "lucide-react";

export default function PoliciesAnalyticsPage() {
  const navigate = useNavigate();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Policy Analytics"
        subtitle="Decision metrics and trends"
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
              <Activity className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-semibold font-display text-foreground mb-1">Policy Analytics</h3>
            <p className="text-xs text-muted-foreground max-w-md">
              Visualize policy evaluation trends, deny rates, and rule hit frequencies.
            </p>
          </div>
        </InstrumentCardBody>
      </InstrumentCard>
    </div>
  );
}
