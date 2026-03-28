import { cn } from "@/lib/utils";
import BundlesPage from "@/pages/govern/BundlesPage";

export default function BundlesTab({ className }: { className?: string }) {
  return (
    <div className={cn(className)}>
      <BundlesPage hideHeader />
    </div>
  );
}
