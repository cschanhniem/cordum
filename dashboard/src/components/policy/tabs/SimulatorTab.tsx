import { cn } from "@/lib/utils";
import SimulatorPage from "@/pages/govern/SimulatorPage";

export default function SimulatorTab({ className }: { className?: string }) {
  return (
    <div className={cn(className)}>
      <SimulatorPage hideHeader />
    </div>
  );
}
