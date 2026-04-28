# LLM Chat Knowledge Pack

Task: `task-a72bdedf`

The LLM chat assistant is informational-only. Its Cordum-specific knowledge is
loaded from local files at service boot and substituted into the system prompt:

- `{{api_summary}}` is filled from the Cordum OpenAPI 3 spec.
- `{{cordum_io_summary}}` is filled from checked-in docs-site Markdown/MDX.

There is no runtime internet fetch, vector-store dependency, or query-time RAG
in this first pass.

## Runtime contract

`core/llmchat/knowledge` exposes three PromptLoader-shaped components:

- `APISubstituter`: reads OpenAPI YAML and emits compact endpoint summaries.
- `SiteSubstituter`: reads Markdown/MDX docs and emits curated prose/code
  sections.
- `Loader`: wraps the file-backed system prompt loader, resolves both
  placeholders once, caches the resolved prompt for the service lifetime, and
  enforces the combined prompt budget.

`cmd/cordum-llm-chat` warm-loads the knowledge pack during boot. If source files
are missing, malformed, or over budget, the service refuses to start instead of
silently falling back to generic answers.

## Configuration

| Environment variable | Default | Purpose |
| --- | --- | --- |
| `LLMCHAT_KNOWLEDGE_PACK_ENABLED` | `true` | Enables knowledge-pack substitution. |
| `LLMCHAT_KNOWLEDGE_API_SPEC_PATH` | `/etc/cordum/openapi.yaml` | Local OpenAPI 3 YAML path. |
| `LLMCHAT_KNOWLEDGE_SITE_PATH` | `/etc/cordum/site-content` | Local docs-site content root. |
| `LLMCHAT_KNOWLEDGE_INCLUDE_GLOBS` | `concepts/*.md,getting-started/*.md,operations/*.md` | Optional slash-form relative globs to ingest. |
| `LLMCHAT_KNOWLEDGE_EXCLUDE_GLOBS` | `concepts/adr/**` | Optional slash-form relative globs to skip. |
| `LLMCHAT_KNOWLEDGE_MAX_PROMPT_TOKENS` | `24000` | Hard ceiling for the final resolved system prompt. |

Compose mounts:

- `./docs/api/openapi/cordum-api.yaml:/etc/cordum/openapi.yaml:ro`
- `./docs-site/docs:/etc/cordum/site-content:ro`

Helm defaults use the same in-container paths baked into the `llm-chat` image.
For custom content, build an image containing equivalent files or mount
read-only volumes and set the paths above.

## Curation rules

### API summary

The API substituter keeps:

- `METHOD /path`
- summary or operation ID
- auth requirement (`public` when `security: []`)
- required parameters
- key request/response schema names and schema descriptions
- rate-limit metadata (`HTTP 429`, `Retry-After`, or rate-limit headers)

It drops verbose examples and full schema bodies. The target is <= 8K estimated
tokens; if the full render is too large it switches to a compact render and
fails closed above 12K.

### Site summary

The site substituter walks `.md` and `.mdx` files in stable order, then places
required grounding docs ahead of large background docs before applying the
token budget. The current priority set is:

- `concepts/enterprise.md` for Enterprise/license entitlement answers.
- `concepts/glossary.md` for Cordum-specific epic and task definitions.
- `operations/llm-chat-knowledge-pack.md` for operator-facing knowledge-pack
  configuration.

It strips frontmatter, import/export lines, JSX/MDX layout tags, JSX comments,
and HTML comments while preserving headings, prose, and fenced code blocks. The
target is <= 6K estimated tokens; it truncates deterministically at line
boundaries and fails closed above 9K. Regression tests load the real default
docs corpus and fail if the resolved prompt loses `/api/v1/jobs`, Enterprise
license content, or the Cordum epic/task definitions.

## Redaction

Both substituters pass rendered text through `core/mcp/DefaultRedactor()` before
the content enters the system prompt. This catches high-confidence secret shapes
such as AWS keys, Stripe live keys, JWTs, and PEM private keys if they appear in
API examples or docs.

## Verification

Minimum local checks:

```bash
go test ./core/llmchat/knowledge -count=3
go test ./cmd/cordum-llm-chat -count=1
docker compose -f docker-compose.yml config -q
helm template cordum cordum-helm \
  --set secrets.apiKey=dummy \
  --set redis.auth.password=dummy >/tmp/cordum-helm.yaml
```

Recommended smoke prompts against a running local Ollama backend:

1. `what does GET /api/v1/jobs return?` — answer should include
   `/api/v1/jobs`.
2. `what's the Enterprise tier license entitlement?` — answer should cite
   Enterprise features and signed-license/tier enforcement from the docs.
3. `what's the difference between an epic and a task?` — answer should include
   the Cordum glossary definitions: an epic is a planning container for a
   delivery stream, and a task is the executable unit inside an epic with DoD,
   rails, assignment, review status, and QA history.
