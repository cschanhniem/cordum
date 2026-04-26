package eval

import (
	"testing"
)

// TestCasesParseable walks the entire cases/ corpus and asserts every
// YAML file (a) parses without error, (b) has all required fields,
// (c) has its file name aligned with case.name. Runs in default
// `go test ./...` so a contributor adding a malformed case can't ship
// it past CI without noticing.
func TestCasesParseable(t *testing.T) {
	t.Parallel()
	cases, err := LoadAllCases("cases")
	if err != nil {
		t.Fatalf("LoadAllCases: %v", err)
	}
	if len(cases) == 0 {
		t.Fatal("zero cases under tests/eval/cases/; corpus must not be empty")
	}

	categoryCounts := map[string]int{}
	for _, c := range cases {
		categoryCounts[c.Category]++
	}

	// Per task DoD #2: minimum 5 cases per category across 6 categories.
	requiredCategories := []string{
		"read_only",
		"filtered_reads",
		"preapproved_mutations",
		"approval_gated_mutations",
		"multi_turn",
		"guardrail_triggers",
	}
	for _, cat := range requiredCategories {
		if got := categoryCounts[cat]; got < 5 {
			t.Errorf("category %q has %d cases, want >= 5 (task DoD #2)", cat, got)
		}
	}
}

// TestCasesUniqueNames asserts no two cases share a name. The harness
// assumes Case.Name is the unique identifier when writing per-case
// JSON results.
func TestCasesUniqueNames(t *testing.T) {
	t.Parallel()
	cases, err := LoadAllCases("cases")
	if err != nil {
		t.Fatalf("LoadAllCases: %v", err)
	}
	seen := map[string]string{} // name → first category
	for _, c := range cases {
		if prev, ok := seen[c.Name]; ok {
			t.Errorf("duplicate case name %q (first under %q, then under %q)",
				c.Name, prev, c.Category)
		}
		seen[c.Name] = c.Category
	}
}
