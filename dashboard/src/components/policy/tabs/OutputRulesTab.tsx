import { cn } from "@/lib/utils";
import OutputRulesPage from "@/pages/govern/OutputRulesPage";

export default function OutputRulesTab({ className }: { className?: string }) {
  return (
    <div className={cn(className)}>
      <OutputRulesPage hideHeader />
    </div>
  );
}
