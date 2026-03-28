import { WorkflowStudio } from "@/components/workflow-studio/WorkflowStudio";

/**
 * WorkflowStudioPage
 *
 * The studio needs a full-bleed canvas (no padding, full viewport height).
 * AppShell wraps children in:
 *   <main class="flex-1 overflow-y-auto dot-grid">
 *     <motion.div class="p-6">{children}</motion.div>
 *   </main>
 *
 * We use negative margin to cancel the p-6 (1.5rem) padding, and set an
 * explicit height so ReactFlow's canvas doesn't collapse to 0px.
 * The top bar is h-12 (3rem).
 */
export default function WorkflowStudioPage() {
  return (
    <div
      className="-m-6 overflow-hidden"
      style={{ height: "calc(100vh - 3rem)" }}
    >
      <WorkflowStudio />
    </div>
  );
}
