import { GlobalYamlPane } from "@/components/policy/global/GlobalYamlPane";
import type { GlobalPolicyParseIssue } from "@/types/policy";

interface InputRulesYamlPaneProps {
  yaml: string;
  editable: boolean;
  activeRuleId?: string | null;
  parseIssues: GlobalPolicyParseIssue[];
  onChange: (nextYaml: string) => void;
}

export function InputRulesYamlPane({
  yaml,
  editable,
  activeRuleId,
  parseIssues,
  onChange,
}: InputRulesYamlPaneProps) {
  return (
    <div className="space-y-3">
      {!editable && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          YAML is read-only for viewer role.
        </div>
      )}
      <GlobalYamlPane
        yaml={yaml}
        editable={editable}
        activeRuleId={activeRuleId}
        parseIssues={parseIssues}
        onChange={onChange}
      />
    </div>
  );
}
