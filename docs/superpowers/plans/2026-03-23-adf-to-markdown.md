# ADF to Markdown Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `adfToMarkdown(adf)` function to `lib/index.ts` that converts Atlassian Document Format JSON to GitHub-flavoured Markdown, with lossless round-trip fidelity for all node types produced by the existing `markdownToAdf` function.

**Architecture:** Mirror the existing switch/case structure — two internal dispatcher functions (`blockNodeToMarkdown` and `inlineNodesToMarkdown`) called from a top-level `adfToMarkdown` export. Unknown node types fall back to an `<adf>` passthrough block so they survive the round-trip losslessly. The function is designed for trusted Atlassian API input and degrades gracefully rather than throwing.

**Tech Stack:** TypeScript, AVA 6, `tsimp`, ESM modules. No new dependencies.

---

## File map

| Action | Path | Purpose |
|--------|------|---------|
| Modify | `lib/index.ts` | Add `adfToMarkdown` export + internal helpers |
| Modify | `lib/test/fixtures/code-blocks.json` | Add codeBlock entry whose content contains a backtick-only line |
| Create | `lib/test/test-helpers.ts` | Shared test utilities (UUID normalization for task list fixtures) |
| Modify | `lib/test/gfm-markdown.test.ts` | Import `normalizeAdfForTesting` from `test-helpers.ts` instead of defining it inline |
| Create | `lib/test/adf-to-markdown.test.ts` | Unit tests + round-trip macro tests |

---

## Task 0: Extract `normalizeAdfForTesting` into `lib/test/test-helpers.ts`

**Files:**
- Create: `lib/test/test-helpers.ts`
- Modify: `lib/test/gfm-markdown.test.ts`

`normalizeAdfForTesting` is currently defined inline in `gfm-markdown.test.ts`. It has enough complexity (recursive traversal, stateful counters) that having it duplicated across test files would make divergence easy to miss. Extract it to a shared helper module now, before the new test file is created.

- [ ] **Step 1: Create `lib/test/test-helpers.ts`**

```typescript
/**
 * Shared test utility functions for marklassian tests.
 */

/**
 * Replaces randomly-generated UUIDs on taskList and taskItem nodes with
 * deterministic IDs so fixtures can be compared with t.deepEqual.
 */
export function normalizeAdfForTesting(adf: any): any {
  const normalized = JSON.parse(JSON.stringify(adf));
  let taskListCounter = 0;
  let taskItemCounter = 0;

  function traverse(node: any) {
    if (node.type === "taskList" && node.attrs?.localId) {
      node.attrs.localId = `test-task-list-id${taskListCounter > 0 ? `-${taskListCounter}` : ""}`;
      taskListCounter++;
    }
    if (node.type === "taskItem" && node.attrs?.localId) {
      taskItemCounter++;
      node.attrs.localId = `test-task-item-id-${taskItemCounter}`;
    }
    if (node.content && Array.isArray(node.content)) {
      node.content.forEach(traverse);
    }
  }

  if (normalized.content) normalized.content.forEach(traverse);
  return normalized;
}
```

- [ ] **Step 2: Update `gfm-markdown.test.ts` to import from `test-helpers.ts`**

Replace the inline `normalizeAdfForTesting` definition (lines 12–36) with:

```typescript
import { normalizeAdfForTesting } from "./test-helpers.js";
```

- [ ] **Step 3: Run tests to confirm nothing broke**

Run: `npm test` from `lib/`
Expected: all existing tests pass

- [ ] **Step 4: Commit**

```bash
git add lib/test/test-helpers.ts lib/test/gfm-markdown.test.ts
git commit
```

---

## Task 1: Extend `code-blocks.json` fixture with a triple-backtick content entry

**Files:**
- Modify: `lib/test/fixtures/code-blocks.json`

The existing fixture has three `codeBlock` entries. Add a fourth whose `text` contains triple backticks, so the ADF→MD converter's quadruple-fence logic is covered by the round-trip test automatically.

- [ ] **Step 1: Add the new fixture entry**

Append a fourth object to the `content` array in `lib/test/fixtures/code-blocks.json`:

```json
{
  "type": "codeBlock",
  "attrs": {
    "language": "markdown"
  },
  "content": [
    {
      "type": "text",
      "text": "An example:\n```\ncode here\n```"
    }
  ]
}
```

- [ ] **Step 2: Verify existing MD→ADF test still passes**

Run: `npm test` from `lib/`

The `Converts code blocks correctly` test will now fail because the fixture has a fourth entry the Markdown doesn't produce — that's expected and correct. We need to update the test Markdown to match.

Update the Markdown in `core-markdown.test.ts` `Converts code blocks correctly` test to include a fourth code block:

`````markdown
````markdown
An example:
```
code here
```
````
`````

- [ ] **Step 3: Run tests to confirm pass**

Run: `npm test` from `lib/`
Expected: all existing tests pass

- [ ] **Step 4: Commit**

```bash
git add lib/test/fixtures/code-blocks.json lib/test/core-markdown.test.ts
git commit
```

---

## Task 2: Implement `adfToMarkdown` in `lib/index.ts`

**Files:**
- Modify: `lib/index.ts`

Add the function after the existing `markdownToAdf` export. The implementation has three internal helpers:

- `inlineNodesToMarkdown(nodes)` — converts inline `text` nodes with marks to Markdown strings
- `blockNodeToMarkdown(node, ctx)` — switch/case on `node.type`, returns a Markdown string; `ctx` carries `{ indent: number }` for nested list indentation
- `blockNodesToMarkdown(nodes, ctx?)` — maps blocks through `blockNodeToMarkdown` and joins with `\n\n`

### Key implementation details

**`inlineNodesToMarkdown`:** Iterate nodes; for each `text` node, apply marks in order: wrap with `` ` `` for `code`, `~~` for `strike`, `*` for `em`, `**` for `strong`, then `[text](href)` for `link` (link is outermost). `hardBreak` → `  \n` (two spaces + newline).

**Mark wrapping order** (innermost → outermost): `code` → `strike` → `em` → `strong` → `link`.

Example: `strong` + `em` → `***text***`. `strong` + `link` → `[**text**](href)`.

**`blockNodeToMarkdown` cases:**

| Case | Output |
|------|--------|
| `heading` | `${'#'.repeat(level)} ${inlineNodesToMarkdown(node.content)}` |
| `paragraph` | `inlineNodesToMarkdown(node.content)` |
| `blockquote` | prefix each line of children with `> ` |
| `bulletList` | each `listItem` as `${indent}- ${itemContent}` |
| `orderedList` | each `listItem` as `${indent}${n}. ${itemContent}`, n starts at `attrs.order ?? 1` |
| `listItem` | unwrap paragraph children; nested lists recurse with `indent + 2` |
| `taskList` | each `taskItem` as `${indent}- [x] ` or `${indent}- [ ] ` |
| `taskItem` | inline content directly (no paragraph wrapper, matching how `markdownToAdf` produces them) |
| `codeBlock` | fence length = `Math.max(3, longestBacktickOnlyLine + 1)`; language attr (omit if `"text"`) |
| `table` | GFM pipe table; first row is header row + `| --- |` separator |
| `mediaSingle` | delegate to `media` child |
| `media` | `![${attrs.alt ?? ''}](${attrs.url})` |
| `rule` | `---` |
| *unknown* | `<adf>${JSON.stringify(node)}</adf>` |

**`blockquote` line-prefix detail:** call `blockNodesToMarkdown` on children, split result by `\n`, prefix each line with `> `, rejoin with `\n`.

**`listItem` unwrapping detail:** a `listItem`'s children are `paragraph` nodes (containing inline content) and nested list nodes. For each child: if `paragraph`, emit `inlineNodesToMarkdown(child.content)`; if a list type, recurse `blockNodeToMarkdown` with `indent + 2`.

**`taskItem` content detail:** taskItem children are inline nodes directly (no paragraph wrapper) — emit `inlineNodesToMarkdown(node.content)`.

**`table` structure detail:** The first `tableRow`'s cells are `tableHeader` type. Emit that row, then a separator row (`| --- | --- |` with one `---` column per header), then the remaining rows. Each cell's content may contain `paragraph` or `mediaSingle` nodes — call `blockNodesToMarkdown` on the cell's content and trim whitespace.

**`codeBlock` fence detail:**
```typescript
const text = node.content?.[0]?.text ?? '';
// Per the CommonMark spec (and marked's implementation), only a line
// consisting entirely of backticks can close a fenced code block — a
// backtick sequence embedded mid-line is safe and does not need to be
// accounted for here.
const longestBacktickLine = (text.match(/^`+$/gm) ?? [])
  .reduce((max, s) => Math.max(max, s.length), 0);
const fenceLength = Math.max(3, longestBacktickLine + 1);
const fence = '`'.repeat(fenceLength);
const lang = node.attrs?.language && node.attrs.language !== 'text'
  ? node.attrs.language
  : '';
return `${fence}${lang}\n${text}\n${fence}`;
```

**Graceful degradation (no throwing):**
- Missing `attrs` on `heading` → default `level: 1`
- Missing `text` on `text` node → `''`
- `mediaSingle` with no `media` child → `''`
- Unknown node type → `<adf>` fallback
- Empty/missing `content` → `''`

**Use case comment:** Add a JSDoc comment on `adfToMarkdown` documenting the error handling philosophy only (not the use case — that belongs in the PR description).

**Internal function JSDocs:** Add a brief JSDoc to each internal helper indicating its purpose:
- `inlineNodesToMarkdown` — "Converts an array of inline ADF nodes to a Markdown string, applying marks inside-out."
- `blockNodesToMarkdown` — "Converts an array of block ADF nodes to Markdown, joining blocks with a blank line."
- `blockNodeToMarkdown` — "Converts a single block ADF node to a Markdown string. Unknown node types fall back to an `<adf>` passthrough block."
- `listItemToMarkdown` — "Renders a listItem node with the given indent and prefix (e.g. `- ` or `1. `)."
- `taskItemToMarkdown` — "Renders a taskItem node with the appropriate checkbox prefix."

**Fence asymmetry comment:** Add an inline comment on the `codeBlock` case (already shown in Step 4 code below).

- [ ] **Step 1: Add `adfToMarkdown` export signature and JSDoc to `lib/index.ts`** (no implementation yet — just the exported function stub returning `''`)

```typescript
/**
 * Converts an Atlassian Document Format (ADF) document or node array to
 * GitHub-flavored Markdown.
 *
 * Never throws. Input is assumed to be trusted Atlassian API output. Unknown
 * node types are serialized as <adf> passthrough blocks so they survive the
 * round-trip losslessly. Missing or malformed fields fall back to safe defaults.
 */
export function adfToMarkdown(adf: AdfDocument | AdfNode[]): string {
  const nodes = Array.isArray(adf) ? adf : adf.content ?? [];
  return blockNodesToMarkdown(nodes);
}
```

- [ ] **Step 2: Implement `inlineNodesToMarkdown`**

Add before `adfToMarkdown`:

```typescript
/**
 * Converts an array of inline ADF nodes to a Markdown string, applying
 * marks inside-out.
 */
function inlineNodesToMarkdown(nodes?: AdfNode[]): string {
  if (!nodes) return '';
  return nodes
    .map((node) => {
      if (node.type === 'hardBreak') return '  \n';
      if (node.type !== 'text') {
        // Unknown inline node — fall back to <adf> passthrough
        return `<adf>${JSON.stringify(node)}</adf>`;
      }
      let text = node.text ?? '';
      const marks = node.marks ?? [];
      const hasCode = marks.some((m) => m.type === 'code');
      const hasStrike = marks.some((m) => m.type === 'strike');
      const hasEm = marks.some((m) => m.type === 'em');
      const hasStrong = marks.some((m) => m.type === 'strong');
      const linkMark = marks.find((m) => m.type === 'link');
      // Apply marks inside-out: code → strike → em → strong → link
      if (hasCode) text = `\`${text}\``;
      if (hasStrike) text = `~~${text}~~`;
      if (hasEm) text = `*${text}*`;
      if (hasStrong) text = `**${text}**`;
      if (linkMark) text = `[${text}](${linkMark.attrs?.href ?? ''})`;
      return text;
    })
    .join('');
}
```

- [ ] **Step 3: Implement `blockNodesToMarkdown` and a skeleton `blockNodeToMarkdown`**

Add before `adfToMarkdown`. This step establishes the scaffolding only — `bulletList`, `orderedList`, `taskList`, and `listItem` cases are intentionally omitted here and added in full in Step 4 (which replaces this skeleton).

```typescript
/**
 * Converts an array of block ADF nodes to Markdown, joining blocks with a
 * blank line.
 */
function blockNodesToMarkdown(nodes: AdfNode[], indent = 0): string {
  return nodes
    .map((node) => blockNodeToMarkdown(node, indent))
    .filter((s) => s !== '')
    .join('\n\n');
}

/**
 * Converts a single block ADF node to a Markdown string. Unknown node types
 * fall back to an <adf> passthrough block.
 */
function blockNodeToMarkdown(node: AdfNode, indent = 0): string {
  switch (node.type) {
    case 'heading': {
      const level = node.attrs?.level ?? 1;
      return `${'#'.repeat(level)} ${inlineNodesToMarkdown(node.content)}`;
    }

    case 'paragraph':
      return inlineNodesToMarkdown(node.content);

    case 'blockquote': {
      const inner = blockNodesToMarkdown(node.content ?? []);
      return inner
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n');
    }

    // ... remaining cases added in step 4
    default:
      return `<adf>${JSON.stringify(node)}</adf>`;
  }
}
```

> **Note to implementer:** Step 4 replaces this skeleton entirely with the full implementation including all list, task, codeBlock, table, media, and rule cases. Do not attempt to add missing cases here — proceed directly to Step 4.

- [ ] **Step 4: Add list, task, codeBlock, table, media, and rule cases**

Replace/expand `blockNodeToMarkdown` with the full implementation. Key helpers:

**`listItemToMarkdown(item, indent, prefix)`** — takes a `listItem` node, an indent level, and the prefix string (`- ` or `1. ` etc.):

```typescript
/**
 * Renders a listItem node with the given indent and prefix (e.g. "- " or "1. ").
 */
function listItemToMarkdown(item: AdfNode, indent: number, prefix: string): string {
  const pad = ' '.repeat(indent);
  const lines: string[] = [];
  for (const child of item.content ?? []) {
    if (child.type === 'paragraph') {
      lines.push(`${pad}${prefix}${inlineNodesToMarkdown(child.content)}`);
      // After first paragraph, subsequent paragraphs in same item use blank prefix
      // (in practice markdownToAdf never produces multi-paragraph listItems)
    } else if (
      child.type === 'bulletList' ||
      child.type === 'orderedList' ||
      child.type === 'taskList'
    ) {
      lines.push(blockNodeToMarkdown(child, indent + 2));
    }
  }
  return lines.join('\n');
}
```

**`taskItemToMarkdown(item, indent)`**:

```typescript
/**
 * Renders a taskItem node with the appropriate checkbox prefix.
 */
function taskItemToMarkdown(item: AdfNode, indent: number): string {
  const pad = ' '.repeat(indent);
  const checked = item.attrs?.state === 'DONE';
  const checkbox = checked ? '- [x] ' : '- [ ] ';
  const lines: string[] = [];
  // taskItem content is inline nodes directly (no paragraph wrapper)
  const inlineContent = (item.content ?? []).filter(
    (c) => c.type === 'text' || c.type === 'hardBreak'
  );
  const nestedLists = (item.content ?? []).filter(
    (c) => c.type === 'bulletList' || c.type === 'orderedList' || c.type === 'taskList'
  );
  lines.push(`${pad}${checkbox}${inlineNodesToMarkdown(inlineContent)}`);
  for (const nested of nestedLists) {
    lines.push(blockNodeToMarkdown(nested, indent + 2));
  }
  return lines.join('\n');
}
```

Full switch cases to add:

```typescript
case 'bulletList':
  return (node.content ?? [])
    .map((item) => listItemToMarkdown(item, indent, '- '))
    .join('\n');

case 'orderedList': {
  const start = node.attrs?.order ?? 1;
  return (node.content ?? [])
    .map((item, i) => listItemToMarkdown(item, indent, `${start + i}. `))
    .join('\n');
}

case 'taskList':
  return (node.content ?? [])
    .map((item) => taskItemToMarkdown(item, indent))
    .join('\n');

case 'codeBlock': {
  // Atlassian does not support nested code block macros, so an extended
  // fence will not arise from Confluence content in practice. This is a
  // defensive measure for content created outside Confluence.
  // Note: markdownToAdf does not preserve fence depth in ADF, so the
  // MD→ADF direction cannot mirror this behavior.
  //
  // Per the CommonMark spec (and marked's implementation), only a line
  // consisting entirely of backticks can close a fenced code block — a
  // backtick sequence embedded mid-line is safe and does not need to be
  // accounted for here.
  const text = node.content?.[0]?.text ?? '';
  const longestBacktickLine = (text.match(/^`+$/gm) ?? [])
    .reduce((max, s) => Math.max(max, s.length), 0);
  const fenceLength = Math.max(3, longestBacktickLine + 1);
  const fence = '`'.repeat(fenceLength);
  const lang =
    node.attrs?.language && node.attrs.language !== 'text'
      ? node.attrs.language
      : '';
  return `${fence}${lang}\n${text}\n${fence}`;
}

case 'table': {
  const rows = node.content ?? [];
  const output: string[] = [];
  let separatorEmitted = false;
  for (const row of rows) {
    const cells = row.content ?? [];
    const isHeaderRow = cells.length > 0 && cells[0]?.type === 'tableHeader';
    const cellTexts = cells.map((cell) => {
      const content = blockNodesToMarkdown(cell.content ?? []).trim();
      return content || ' ';
    });
    output.push(`| ${cellTexts.join(' | ')} |`);
    if (isHeaderRow && !separatorEmitted) {
      output.push(`| ${cells.map(() => '---').join(' | ')} |`);
      separatorEmitted = true;
    }
  }
  return output.join('\n');
}

case 'mediaSingle': {
  const media = (node.content ?? []).find((c) => c.type === 'media');
  if (!media) return '';
  return blockNodeToMarkdown(media, indent);
}

case 'media':
  return `![${node.attrs?.alt ?? ''}](${node.attrs?.url ?? ''})`;

case 'rule':
  return '---';
```

- [ ] **Step 5: Run tests (expect all existing tests to still pass — no new tests yet)**

Run: `npm test` from `lib/`
Expected: all existing tests pass

- [ ] **Step 6: Commit**

```bash
git add lib/index.ts
git commit
```

---

## Task 3: Write unit tests for `adfToMarkdown`

**Files:**
- Create: `lib/test/adf-to-markdown.test.ts`

Follow the existing test file pattern exactly: `import anyTest, { type TestFn } from "ava"`, cast `const test = anyTest as unknown as TestFn<void>`.

The test file has two sections:
1. **Unit tests** — verify specific node/mark conversions by constructing ADF directly and asserting the Markdown string output
2. **Round-trip tests** — use `test.macro()` to parametrise over all fixture files

### Section 1: Unit tests

Cover each of the following. Write one `test(...)` call per behaviour:

| Test title | Input ADF fragment | Expected output |
|---|---|---|
| `heading level 1` | `{type:'heading',attrs:{level:1},content:[{type:'text',text:'Hello'}]}` | `# Hello` |
| `heading level 3` | level 3 | `### Hello` |
| `heading missing attrs defaults to level 1` | no `attrs` | `# Hello` |
| `paragraph` | `{type:'paragraph',content:[{type:'text',text:'Hello'}]}` | `Hello` |
| `bold text` | `text` node with `strong` mark | `**bold**` |
| `italic text` | `em` mark | `*italic*` |
| `strikethrough text` | `strike` mark | `~~strike~~` |
| `inline code` | `code` mark | `` `code` `` |
| `link` | `link` mark with `href` | `[text](https://example.com)` |
| `bold italic combined` | `strong` + `em` marks | `***text***` |
| `bold link` | `strong` + `link` marks | `[**text**](https://example.com)` |
| `italic link` | `em` + `link` marks | `[*text*](https://example.com)` |
| `hard break` | `hardBreak` inline node | `  \n` (two spaces + newline) |
| `blockquote` | blockquote wrapping a paragraph | `> text` |
| `bullet list` | two items | `- Item 1\n- Item 2` |
| `ordered list` | two items, order 1 | `1. Item 1\n2. Item 2` |
| `ordered list custom start` | order 3 | `3. Item 1\n4. Item 2` |
| `nested bullet list` | item with nested bulletList child | `- Parent\n  - Child` |
| `task list unchecked` | taskItem state TODO | `- [ ] Task` |
| `task list checked` | taskItem state DONE | `- [x] Task` |
| `code block` | language typescript | ` ```typescript\ncode\n``` ` |
| `code block language text omitted` | language "text" | ` ```\ncode\n``` ` |
| `code block with backtick-only line in content uses longer fence` | content contains a line that is only ` ``` ` | output uses a 4-backtick fence |
| `table` | 1 header row + 1 data row | GFM table string with separator |
| `mediaSingle` | external media | `![alt](url)` |
| `rule` | `{type:'rule'}` | `---` |
| `unknown block node falls back to adf tag` | `{type:'panel',attrs:{panelType:'info'}}` | `<adf>{"type":"panel",...}</adf>` |
| `unknown inline node falls back to adf tag` | text node with unknown type sibling | `<adf>...</adf>` |
| `accepts AdfDocument directly` | full `{version:1,type:'doc',content:[...]}` | correct output |
| `accepts AdfNode array directly` | bare `AdfNode[]` | correct output |
| `mediaSingle with no media child returns empty string` | mediaSingle with empty content | `''` |

- [ ] **Step 1: Create `lib/test/adf-to-markdown.test.ts` with the unit tests**

File header:

```typescript
import anyTest, { type TestFn } from "ava";
import { adfToMarkdown, markdownToAdf } from "../index";
import { normalizeAdfForTesting } from "./test-helpers.js";

// Round-trip fixture imports (used in Section 2)
import basicsAdf from "./fixtures/basics.json" with { type: "json" };
import codeBlocksAdf from "./fixtures/code-blocks.json" with { type: "json" };
import inlineCodeAdf from "./fixtures/inline-code-marks.json" with { type: "json" };
import nestedListAdf from "./fixtures/nested-list.json" with { type: "json" };
import specialCharsAdf from "./fixtures/special-chars.json" with { type: "json" };
import tableAdf from "./fixtures/table.json" with { type: "json" };
import textEdgeCasesAdf from "./fixtures/text-edge-cases.json" with { type: "json" };
import gfmTaskListAdf from "./fixtures/gfm-task-list.json" with { type: "json" };
import gfmNestedTaskListAdf from "./fixtures/gfm-nested-task-list.json" with { type: "json" };
import adfPassthroughAdf from "./fixtures/adf-passthrough.json" with { type: "json" };

const test = anyTest as unknown as TestFn<void>;
```

- [ ] **Step 2: Run the unit tests to confirm they all pass**

Run: `npm test` from `lib/`
Expected: all new unit tests pass alongside existing tests

- [ ] **Step 3: Commit**

```bash
git add lib/test/adf-to-markdown.test.ts
git commit
```

---

## Task 4: Add round-trip tests using `test.macro()`

**Files:**
- Modify: `lib/test/adf-to-markdown.test.ts`

Add a second section to `adf-to-markdown.test.ts` using AVA's `test.macro()` with a title function. One `test(roundTripMacro, fixture, fixtureName)` call per fixture file.

The macro:

```typescript
/**
 * Integration test macro: ADF → Markdown → ADF round-trip.
 *
 * Covers the Confluence read-modify-write use case: a coding agent reads a
 * page (ADF), converts to Markdown for review, then converts back to ADF
 * before writing. Asserts lossless fidelity for all fixture node types.
 */
const roundTripMacro = test.macro({
  exec(t, fixture: any, _fixtureName: string) {
    const markdown = adfToMarkdown(fixture);
    const roundTripped = markdownToAdf(markdown);
    t.deepEqual(
      normalizeAdfForTesting(roundTripped),
      normalizeAdfForTesting(fixture),
    );
  },
  title(_provided, _fixture, fixtureName: string) {
    return `round-trip: ${fixtureName}`;
  },
});

// One call per fixture — all fixtures included.
// adf-passthrough is deliberately included: a silent regression in the <adf>
// fallback path (where unknown nodes lose content without erroring) would be
// very hard to diagnose without explicit round-trip coverage.
test(roundTripMacro, basicsAdf, "basics");
test(roundTripMacro, codeBlocksAdf, "code-blocks");
test(roundTripMacro, inlineCodeAdf, "inline-code-marks");
test(roundTripMacro, nestedListAdf, "nested-list");
test(roundTripMacro, specialCharsAdf, "special-chars");
test(roundTripMacro, tableAdf, "table");
test(roundTripMacro, textEdgeCasesAdf, "text-edge-cases");
test(roundTripMacro, gfmTaskListAdf, "gfm-task-list");
test(roundTripMacro, gfmNestedTaskListAdf, "gfm-nested-task-list");
test(roundTripMacro, adfPassthroughAdf, "adf-passthrough");
```

- [ ] **Step 1: Add the round-trip macro and test calls to `adf-to-markdown.test.ts`**

- [ ] **Step 2: Run the full test suite**

Run: `npm test` from `lib/`
Expected: all round-trip tests pass

If a round-trip test fails, it indicates a conversion gap. Debug by:
1. Calling `adfToMarkdown(fixture)` and inspecting the Markdown string
2. Calling `markdownToAdf(markdown)` and diffing the result against the original fixture

- [ ] **Step 3: Commit**

```bash
git add lib/test/adf-to-markdown.test.ts
git commit
```

---

## Task 5: Final verification and finishing

- [ ] **Step 1: Run the full test suite one final time**

Run: `npm test` from `lib/`
Expected: all tests pass (existing + new unit tests + round-trip tests)

- [ ] **Step 2: Confirm `adfToMarkdown` is exported from the build**

Run: `npm run build` from `lib/`
Expected: build succeeds, no TypeScript errors

Check `lib/dist/index.d.ts` includes `export declare function adfToMarkdown(...)`.

- [ ] **Step 3: Remove spec and plan docs**

These files served their purpose during design and implementation.

Delete:
- `docs/superpowers/specs/2026-03-23-adf-to-markdown-design.md`
- `docs/superpowers/plans/2026-03-23-adf-to-markdown.md`

```bash
git rm docs/superpowers/specs/2026-03-23-adf-to-markdown-design.md \
       docs/superpowers/plans/2026-03-23-adf-to-markdown.md
git commit
```

- [ ] **Step 4: Invoke finishing-a-development-branch skill**

Use superpowers:finishing-a-development-branch to decide how to integrate the work.
