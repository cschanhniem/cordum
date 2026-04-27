package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"

	capsdk "github.com/cordum-io/cap/v2/sdk/go"
	sdk "github.com/cordum/cordum/sdk/client"
)

var (
	agentUUIDPattern         = regexp.MustCompile(`(?i)^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$`)
	agentPrefixedUUIDPattern = regexp.MustCompile(`(?i)^agent-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$`)
)

type AgentRegistry interface {
	Lookup(ctx context.Context, name, tenant string) (*capsdk.AgentIdentity, error)
	SetScope(ctx context.Context, update capsdk.AgentScopeUpdate) error
}

var newAgentRegistry = newCapsdkAgentRegistry

func newCapsdkAgentRegistry(fs *flagSet) (AgentRegistry, error) {
	tr, err := sdk.BuildTLSTransportErr(fs.tlsOptions())
	if err != nil {
		return nil, fmt.Errorf("tls configuration error: %w", err)
	}
	httpClient := &http.Client{Timeout: 15 * time.Second}
	if tr != nil {
		httpClient.Transport = tr
	}
	return capsdk.NewAgentClient(capsdk.AgentClientConfig{
		BaseURL:    strings.TrimRight(*fs.gateway, "/"),
		APIKey:     *fs.apiKey,
		Tenant:     strings.TrimSpace(*fs.tenant),
		HTTPClient: httpClient,
	})
}

func runAgentCmd(args []string) {
	if len(args) < 1 {
		agentUsage()
		os.Exit(1)
	}
	switch args[0] {
	case "set-scope":
		runAgentSetScope(args[1:])
	default:
		agentUsage()
		os.Exit(1)
	}
}

func runAgentSetScope(args []string) {
	check(runAgentSetScopeE(args))
}

func runAgentSetScopeE(args []string) error {
	fs := newFlagSet("agent set-scope")
	fs.Usage = agentSetScopeUsage
	allowedRaw := fs.String("allowed-tools", "", "comma-separated AllowedTools replacement")
	preapprovedRaw := fs.String("preapproved-mutating-tools", "", "comma-separated PreapprovedMutatingTools replacement; pass an explicit empty value to revoke all")
	addRaw := fs.String("add-tool", "", "comma-separated tools to add to the existing AllowedTools set")
	removeRaw := fs.String("remove-tool", "", "comma-separated tools to remove from the existing AllowedTools set")
	idempotencyKey := fs.String("idempotency-key", "", "Idempotency-Key header value for safe retries")
	dryRun := fs.Bool("dry-run", false, "print the resulting scope update without applying it")
	fs.ParseArgs(args)

	allowedSet := flagWasProvided(fs, "allowed-tools")
	preapprovedSet := flagWasProvided(fs, "preapproved-mutating-tools")
	addSet := flagWasProvided(fs, "add-tool")
	removeSet := flagWasProvided(fs, "remove-tool")
	addTools := splitComma(*addRaw)
	removeTools := splitComma(*removeRaw)
	hasIncremental := addSet || removeSet
	if !allowedSet && !preapprovedSet && len(addTools) == 0 && len(removeTools) == 0 {
		return errors.New("no scope changes requested")
	}
	if allowedSet && hasIncremental {
		return errors.New("--allowed-tools is mutually exclusive with --add-tool/--remove-tool")
	}
	if fs.NArg() != 1 {
		return errors.New("agent name or id required")
	}

	agentNameOrID := strings.TrimSpace(fs.Arg(0))
	if agentNameOrID == "" {
		return errors.New("agent name or id required")
	}
	isID := isAgentID(agentNameOrID)
	if isID && hasIncremental {
		return errors.New("--add-tool/--remove-tool require agent name lookup; use --allowed-tools with an agent id")
	}
	if isID && !preapprovedSet {
		return errors.New("cannot preserve preapproved mutating tools for agent id without lookup; pass --preapproved-mutating-tools explicitly")
	}

	var existing *capsdk.AgentIdentity
	agentID := agentNameOrID
	registry, err := newAgentRegistry(fs)
	if err != nil {
		return err
	}
	if !isID {
		found, err := registry.Lookup(context.Background(), agentNameOrID, strings.TrimSpace(*fs.tenant))
		if err != nil {
			if errors.Is(err, capsdk.ErrAgentNotFound) {
				return fmt.Errorf("agent not found: %w", err)
			}
			return err
		}
		if found == nil {
			return errors.New("agent not found")
		}
		existing = found
		agentID = found.ID
	}

	update := capsdk.AgentScopeUpdate{
		AgentID:        agentID,
		IdempotencyKey: strings.TrimSpace(*idempotencyKey),
	}
	if allowedSet {
		update.AllowedTools = splitCommaPreserveExplicitEmpty(*allowedRaw)
	} else if hasIncremental {
		if existing == nil {
			return errors.New("--add-tool/--remove-tool require agent name lookup")
		}
		update.AllowedTools = mergeAllowedTools(existing.AllowedTools, addTools, removeTools)
	}
	if preapprovedSet {
		update.PreapprovedMutatingTools = splitCommaPreserveExplicitEmpty(*preapprovedRaw)
	} else if existing != nil {
		// capsdk.SetScope always sends preapproved_mutating_tools, so
		// preserve the current value unless the operator explicitly replaces it.
		update.PreapprovedMutatingTools = append([]string{}, existing.PreapprovedMutatingTools...)
	}

	if *dryRun {
		printJSON(agentScopeDryRun{
			AgentID:                  update.AgentID,
			AgentName:                agentNameForDryRun(agentNameOrID, existing),
			AllowedTools:             update.AllowedTools,
			PreapprovedMutatingTools: update.PreapprovedMutatingTools,
			IdempotencyKey:           update.IdempotencyKey,
			DryRun:                   true,
		})
		return nil
	}
	if err := registry.SetScope(context.Background(), update); err != nil {
		return err
	}
	fmt.Printf("Agent scope updated: %s\n", agentID)
	return nil
}

type agentScopeDryRun struct {
	AgentID                  string   `json:"agent_id"`
	AgentName                string   `json:"agent_name,omitempty"`
	AllowedTools             []string `json:"allowed_tools,omitempty"`
	PreapprovedMutatingTools []string `json:"preapproved_mutating_tools,omitempty"`
	IdempotencyKey           string   `json:"idempotency_key,omitempty"`
	DryRun                   bool     `json:"dry_run"`
}

func agentNameForDryRun(input string, existing *capsdk.AgentIdentity) string {
	if existing != nil {
		return existing.Name
	}
	if isAgentID(input) {
		return ""
	}
	return input
}

func flagWasProvided(fs *flagSet, name string) bool {
	provided := false
	fs.Visit(func(f *flag.Flag) {
		if f.Name == name {
			provided = true
		}
	})
	return provided
}

func splitCommaPreserveExplicitEmpty(value string) []string {
	items := splitComma(value)
	if items == nil {
		return []string{}
	}
	return items
}

func mergeAllowedTools(existing []string, add []string, remove []string) []string {
	removeSet := make(map[string]struct{}, len(remove))
	for _, item := range remove {
		removeSet[item] = struct{}{}
	}
	out := make([]string, 0, len(existing)+len(add))
	seen := map[string]struct{}{}
	for _, item := range existing {
		item = strings.TrimSpace(item)
		if item == "" {
			continue
		}
		if _, drop := removeSet[item]; drop {
			continue
		}
		if _, ok := seen[item]; ok {
			continue
		}
		seen[item] = struct{}{}
		out = append(out, item)
	}
	for _, item := range add {
		item = strings.TrimSpace(item)
		if item == "" {
			continue
		}
		if _, ok := seen[item]; ok {
			continue
		}
		seen[item] = struct{}{}
		out = append(out, item)
	}
	if out == nil {
		return []string{}
	}
	return out
}

func isAgentID(value string) bool {
	value = strings.TrimSpace(value)
	return agentUUIDPattern.MatchString(value) || agentPrefixedUUIDPattern.MatchString(value)
}

func agentUsage() {
	fmt.Print(`Usage:
  cordumctl agent set-scope <name|agent-id> [flags]

Subcommands:
  set-scope    Replace or edit an existing AgentIdentity scope via capsdk.AgentClient.SetScope

Preapproval note: AgentSpec registration cannot grant preapproved mutating
tools at create time. Register the agent first, then use set-scope to grant or
revoke PreapprovedMutatingTools.
`)
}

func agentSetScopeUsage() {
	fmt.Print(`Usage:
  cordumctl agent set-scope <name|agent-id> [--allowed-tools t1,t2]
  cordumctl agent set-scope <name|agent-id> [--preapproved-mutating-tools t1,t2]
  cordumctl agent set-scope <name> [--add-tool t] [--remove-tool t]

Flags:
  --allowed-tools                 comma-separated AllowedTools replacement; mutually exclusive with --add-tool/--remove-tool
  --preapproved-mutating-tools    comma-separated PreapprovedMutatingTools replacement; explicit empty value revokes all
  --add-tool                      add a tool to the existing AllowedTools set
  --remove-tool                   remove a tool from the existing AllowedTools set
  --idempotency-key               pass through as Idempotency-Key header
  --dry-run                       print resulting JSON without calling SetScope
  --gateway, --api-key, --tenant, --cacert, --insecure inherit the standard cordumctl connection flags

Preapproval note: AgentSpec creation cannot grant preapproved mutating tools;
this command wraps SetScope after the agent exists.
`)
}
