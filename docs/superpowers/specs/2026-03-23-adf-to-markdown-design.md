# Design spec: `adfToMarkdown` — ADF to Markdown conversion

**Date:** 2026-03-23
**Status:** Approved

---

## Context and use case

The primary use case is a coding agent editing Confluence pages:

1. Agent reads a Confluence page via the Atlassian API (returns ADF JSON)
2. Agent converts ADF → Markdown for human review
3. Human approves (or requests changes to) the Markdown
4. Tooling converts Markdown → ADF transparently, then writes back to Confluence

This is the reverse of the existing `markdownToAdf` function. The existing MD→ADF path already handles new page creation (where the user only ever sees Markdown). The ADF→MD path is needed specifically for the read-modify-review-write cycle on existing pages.

**Scope:** This spec covers only the ADF→Markdown conversion in `marklassian`. Atlassian API integration is out of scope.

---

## API

```typescript
export function adfToMarkdown(adf: AdfDocument | AdfNode[]): string
```

Accepts either a full `AdfDocument` (the shape returned by the Atlassian API) or a bare `AdfNode[]` (for partial/nested conversion). Returns a well-formed GitHub-flavoured Markdown string suitable for passing back through `markdownToAdf`.

Lives in `lib/index.ts`, exported alongside `markdownToAdf`.

---

## Architecture

Mirrors the existing switch/case structure of the MD→ADF direction. No new patterns introduced.

```
adfToMarkdown(adf)
  └─ blockNodesToMarkdown(nodes[])         ← joins block outputs with \n\n
       └─ blockNodeToMarkdown(node, ctx)   ← switch/case on node.type
            └─ inlineNodesToMarkdown(nodes[])  ← handles text nodes + marks
```

`ctx` carries list context (indent level, ordered/unordered, task) needed to emit correct prefixes for nested lists.

---

## Node mapping

### Block nodes

| ADF type | Markdown output |
|---|---|
| `doc` | join `content` children with `\n\n` |
| `heading` | `#` × `attrs.level` + space + inline content |
| `paragraph` | inline content (no wrapping) |
| `blockquote` | each child line prefixed with `> ` |
| `bulletList` | each `listItem` as `- ` + content |
| `orderedList` | each `listItem` as `N. ` (N starts at `attrs.order ?? 1`); nested items indented 2 spaces |
| `listItem` | paragraph content unwrapped; nested lists indented 2 spaces |
| `taskList` | each `taskItem` as `- [ ] ` or `- [x] ` + content |
| `taskItem` | `- [ ]`/`- [x]` based on `attrs.state === "DONE"`; nested lists indented 2 spaces |
| `codeBlock` | fenced with backticks + `attrs.language` (see codeBlock note below) |
| `table` | GFM pipe table |
| `tableRow` | pipe-delimited cells |
| `tableHeader` / `tableCell` | inline content, whitespace-trimmed |
| `mediaSingle` | delegates to its `media` child |
| `media` | `![attrs.alt](attrs.url)` |
| `rule` | `---` |
| *unknown* | `<adf>` block containing compact JSON (see fallback below) |

### Inline nodes and marks

| ADF type / mark | Markdown output |
|---|---|
| `text` (no marks) | `node.text` |
| `text` + `em` | `*text*` |
| `text` + `strong` | `**text**` |
| `text` + `strike` | `~~text~~` |
| `text` + `code` | `` `text` `` |
| `text` + `link` | `[text](href)` |
| `text` + `strong` + `em` | `***text***` |
| `text` + `strong` + `link` | `[**text**](href)` |
| `text` + `em` + `link` | `[*text*](href)` |
| `hardBreak` | two trailing spaces + `\n` |
| *unknown inline* | `<adf>` block containing compact JSON |

Mark application order (inside-out): `link` wraps all → `strong` → `em` → `strike` → `code`.

### codeBlock fence depth

Always emit triple backticks (` ``` `), **except** when `node.content[0].text` contains ` ``` `, in which case emit quadruple backticks (` ```` `). This ensures the output is always valid, re-parseable Markdown.

**Known limitation and asymmetry:** `markdownToAdf` always produces a `codeBlock` node regardless of the original fence depth; that depth information is not stored in ADF. So the MD→ADF direction cannot preserve fence depth. This asymmetry is acceptable: the use case involves reading ADF from Confluence (where fence depth is irrelevant) and the ADF→MD output only needs to be valid Markdown that round-trips back to the same ADF. Atlassian does not support nested code block macros, so the quadruple-backtick case will not arise from Confluence content in practice — the logic is a defensive measure for content created outside Confluence.

### `<adf>` fallback

Any block or inline node type not in the tables above is serialised as:

```
<adf>{"type":"panel","attrs":{...},"content":[...]}</adf>
```

Compact JSON (no pretty-print). This is the same format that `markdownToAdf`'s `parseAdfTag` already parses, so the round-trip is lossless for these nodes.

---

## Error handling

**Principle:** Graceful degradation, never throw. The input is trusted (Atlassian API output), not arbitrary user input, so the goal is to produce useful output rather than surface validation errors.

This philosophy will be documented as a code comment on the `adfToMarkdown` function itself, along with the assumed use case, so future maintainers understand why the lenient approach is intentional.

| Condition | Behaviour |
|---|---|
| Unknown block node type | Emit `<adf>` fallback |
| Unknown inline node type | Emit `<adf>` fallback |
| Missing/null `text` on `text` node | Treat as empty string |
| Missing `attrs` on `heading` | Default `level: 1` |
| `mediaSingle` with no `media` child | Emit nothing (skip silently) |
| Empty `content` array | Emit empty string |

---

## Testing

**Framework:** AVA 6, TypeScript via `tsimp`, ESM — consistent with existing tests.

### New test file: `test/adf-to-markdown.test.ts`

Covers all block types, all mark types and combinations, nested lists, task lists, tables, mediaSingle, rule, codeBlock (including the triple-backtick-in-content case), and `<adf>` fallback for unknown nodes.

### Round-trip tests

A dedicated section in `adf-to-markdown.test.ts` using AVA's `test.macro()` pattern. The assertion logic lives in a single macro with a title function; one `test(roundTripMacro, fixtureName)` call per fixture keeps each fixture as a named, independently-reported test.

All fixtures are included — including `adf-passthrough`. The passthrough fixture is especially important: a silent regression in the `<adf>` fallback path would lose content without erroring, making it very hard to diagnose without explicit coverage.

For each fixture:
1. Import the fixture JSON (the ADF output from `markdownToAdf`)
2. Convert ADF → Markdown via `adfToMarkdown`
3. Convert Markdown → ADF via `markdownToAdf`
4. Assert final ADF equals the fixture ADF

Exact Markdown string fidelity is not required — only ADF round-trip fidelity matters. The existing `normalizeAdfForTesting` UUID helper is reused for task list fixtures.

### New fixture entry: quadruple-backtick code fence

Add a fourth `codeBlock` entry to `test/fixtures/code-blocks.json` whose `text` contains ` ``` `. The `adf-to-markdown` unit tests assert that this entry emits a quadruple-backtick fence. The round-trip macro covers it automatically since `code-blocks` is already in the fixture list.

---

## Out of scope

- Atlassian API integration
- ADF node types not produced by `markdownToAdf`: `panel`, `expand`, `layoutSection`, `inlineCard`, `status`, `date`, `mention`, `emoji`, `subsup`, `underline`, `textColor`, `backgroundColor` — these are handled by the `<adf>` fallback
- File-based media (`type: "file"`) — only `type: "external"` is supported (mirrors MD→ADF)
- Table column alignment attrs — not stored in ADF from MD→ADF, not emitted in ADF→MD
