# ADF Inline Tags and Table Cell Improvements Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify `adfToMarkdown` to emit inline `<adf>` tags exclusively, add test coverage for inline `<adf>` in single-line Markdown elements (headings, list items, table cells), implement table cell complex-content fallback, and cover ordered list items 99/100.

**Architecture:** Three changes to `lib/index.ts`: (1) change block fallback from `<adf>\n…\n</adf>` to `<adf>…</adf>`, (2) replace inline cell-rendering logic with a `cellContentToMarkdown` helper that wraps non-paragraph block nodes in `<adf>…</adf>` tags, (3) no changes needed for inline fallback (already uses `<adf>…</adf>`). Tests expand `adf-to-markdown.test.ts` and add fixtures.

**Tech Stack:** TypeScript, AVA 6, `tsimp`, ESM modules. No new dependencies.

**Context:** This plan continues work from `docs/superpowers/plans/2026-03-23-adf-to-markdown.md`. Tasks 0–5b are complete and committed on branch `feat/adf-to-markdown`. This plan covers the remaining incomplete tasks (5c, 5d) plus the new inline-tag work.

---

## File map

| File | Change |
|---|---|
| `lib/index.ts` | Modify `blockNodeToMarkdown` default case; add `cellContentToMarkdown` helper; update table cell loop to use helper |
| `lib/test/adf-to-markdown.test.ts` | Update `"unknown block node falls back to adf tag"` assertion; add inline-`<adf>`-in-heading/list/cell tests; add 100-item ordered list test |
| `lib/test/fixtures/nested-list.json` | No change needed — triple-digit list test uses inline ADF, not a fixture |

---

## Task 1: Switch block fallback to inline `<adf>` format

**Files:**
- Modify: `lib/index.ts:860-861`
- Modify: `lib/test/adf-to-markdown.test.ts:577-585`

The current block default emits a multi-line tag. The inline extension in `markdownToAdf` already handles single-line tags, and `parseAdfTag` trims content before parsing, so the round-trip is identical. Switching to inline format also avoids the newline-collapse bug in table cells (current code calls `.replace(/\n+/g, " ")` on cell content — a multi-line `<adf>` tag in a cell gets mangled; inline style survives intact).

- [ ] **Step 1: Update the unit test assertion to expect inline format**

In `lib/test/adf-to-markdown.test.ts`, find the test `"unknown block node falls back to adf tag"` (line 577) and change the assertion:

```typescript
// Before:
t.is(result, `<adf>\n${JSON.stringify(node)}\n</adf>`);

// After:
t.is(result, `<adf>${JSON.stringify(node)}</adf>`);
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd lib && npx ava test/adf-to-markdown.test.ts -- "unknown block node falls back to adf tag"
```

Expected: FAIL — assertion mismatch (result has newlines, expected does not).

- [ ] **Step 3: Change the block fallback in `lib/index.ts`**

At line 861, change:

```typescript
// Before:
default:
  return `<adf>\n${JSON.stringify(node)}\n</adf>`;

// After:
default:
  return `<adf>${JSON.stringify(node)}</adf>`;
```

- [ ] **Step 4: Verify single-line `<adf>` block parsing works**

`<adf>` is not a known HTML tag name, so marked uses its rule 7 (a complete HTML tag on its own line, preceded and followed by a blank line) to tokenize it as an `html` block token. The existing tests in `adf-passthrough.test.ts` use only the multi-line form. Add a test to `lib/test/adf-passthrough.test.ts` to cover the single-line form:

```typescript
test("passes through a minimal ADF node using single-line (inline-style) tag", (t) => {
  t.deepEqual(markdownToAdf('<adf>{"type":"rule"}</adf>'), {
    version: 1,
    type: "doc",
    content: [{ type: "rule" }],
  });
});
```

Run: `cd lib && npx ava test/adf-passthrough.test.ts -- "single-line"`
Expected: PASS. If this fails, investigate marked's block HTML tokenizer before proceeding — the rest of Task 1 depends on this behaviour.

- [ ] **Step 5: Run the full test suite**

```bash
cd lib && npm test
```

Expected: all tests pass. The `round-trip: adf-passthrough` test will pass because `parseAdfTag` handles both formats — the intermediate Markdown changes but the round-trip result is identical.

- [ ] **Step 6: Commit**

```bash
git add lib/index.ts lib/test/adf-to-markdown.test.ts
git commit
```

---

## Task 2: Test inline `<adf>` tags in single-line Markdown elements

**Files:**
- Modify: `lib/test/adf-to-markdown.test.ts`

These tests verify that an unknown inline node (which `adfToMarkdown` emits as `<adf>…</adf>`) embedded within headings, list items, blockquotes, and table cells survives a full ADF→MD→ADF round-trip. They also serve as regression tests for the inline-tag-in-block-context parsing path in `markdownToAdf`.

- [ ] **Step 1: Write the failing tests**

Add to the unit tests section of `lib/test/adf-to-markdown.test.ts` (after the `"unknown inline node falls back to adf tag"` test, around line 600):

```typescript
test("unknown inline node in heading falls back to inline adf tag", (t) => {
  const mention = { type: "mention", attrs: { id: "u1", text: "@Alice", accessLevel: "" } };
  const result = adfToMarkdown({
    version: 1,
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 2 },
        content: [
          { type: "text", text: "Hello " },
          mention,
        ],
      },
    ],
  });
  t.is(result, `## Hello <adf>${JSON.stringify(mention)}</adf>`);
});

test("unknown inline node in bullet list item falls back to inline adf tag", (t) => {
  const status = { type: "status", attrs: { text: "Done", color: "green" } };
  const result = adfToMarkdown({
    version: 1,
    type: "doc",
    content: [
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [
                  { type: "text", text: "Item " },
                  status,
                ],
              },
            ],
          },
        ],
      },
    ],
  });
  t.is(result, `- Item <adf>${JSON.stringify(status)}</adf>`);
});

test("unknown inline node in ordered list item falls back to inline adf tag", (t) => {
  const date = { type: "date", attrs: { timestamp: "1704067200000" } };
  const result = adfToMarkdown({
    version: 1,
    type: "doc",
    content: [
      {
        type: "orderedList",
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [
                  { type: "text", text: "Due " },
                  date,
                ],
              },
            ],
          },
        ],
      },
    ],
  });
  t.is(result, `1. Due <adf>${JSON.stringify(date)}</adf>`);
});

test("unknown inline node in blockquote falls back to inline adf tag", (t) => {
  const emoji = { type: "emoji", attrs: { shortName: ":tada:", text: "🎉" } };
  const result = adfToMarkdown({
    version: 1,
    type: "doc",
    content: [
      {
        type: "blockquote",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Congrats " },
              emoji,
            ],
          },
        ],
      },
    ],
  });
  t.is(result, `> Congrats <adf>${JSON.stringify(emoji)}</adf>`);
});

test("round-trip: unknown inline node in heading", (t) => {
  const mention = { type: "mention", attrs: { id: "u1", text: "@Alice", accessLevel: "" } };
  const adf = {
    version: 1 as const,
    type: "doc" as const,
    content: [
      {
        type: "heading",
        attrs: { level: 2 },
        content: [
          { type: "text", text: "Hello " },
          mention,
        ],
      },
    ],
  };
  const md = adfToMarkdown(adf);
  t.deepEqual(normalizeAdfForTesting(markdownToAdf(md)), normalizeAdfForTesting(adf));
});

test("round-trip: unknown inline node in bullet list item", (t) => {
  const status = { type: "status", attrs: { text: "Done", color: "green" } };
  const adf = {
    version: 1 as const,
    type: "doc" as const,
    content: [
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [
                  { type: "text", text: "Item " },
                  status,
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  const md = adfToMarkdown(adf);
  t.deepEqual(normalizeAdfForTesting(markdownToAdf(md)), normalizeAdfForTesting(adf));
});
```

- [ ] **Step 2: Run the tests to confirm they pass (they should pass already)**

These tests exercise existing behaviour — inline nodes in headings/list items already go through `inlineNodesToMarkdown` which already emits `<adf>…</adf>`. The tests should pass without code changes.

```bash
cd lib && npx ava test/adf-to-markdown.test.ts -- "unknown inline node in heading"
```

Expected: PASS (or FAIL if there's a subtle issue — investigate before continuing).

- [ ] **Step 3: Run the full test suite**

```bash
cd lib && npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add lib/test/adf-to-markdown.test.ts
git commit
```

---

## Task 3: Table cells — complex content fallback (task 5c)

**Files:**
- Modify: `lib/index.ts` (add `cellContentToMarkdown` helper; update table case)
- Modify: `lib/test/adf-to-markdown.test.ts`

GFM table cells support inline content only. Cells with block-level nodes (bullet lists, code blocks, multiple paragraphs) cannot be represented natively. The fix: detect block-level content in a cell and emit each block node as `<adf>…</adf>` inline within the cell text, which survives the `markdownToAdf` inline parser.

A "simple" cell has a single paragraph with only inline content — render via `inlineNodesToMarkdown`.
A "complex" cell has any other structure — render each block node: paragraphs inline, others as `<adf>…</adf>`.

- [ ] **Step 1: Write the failing tests**

Add to `lib/test/adf-to-markdown.test.ts`:

```typescript
test("table cell with bullet list falls back to inline adf tag", (t) => {
  const list = {
    type: "bulletList",
    content: [
      { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "a" }] }] },
      { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "b" }] }] },
    ],
  };
  const result = adfToMarkdown({
    version: 1,
    type: "doc",
    content: [
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Col" }] }] },
            ],
          },
          {
            type: "tableRow",
            content: [
              { type: "tableCell", content: [list] },
            ],
          },
        ],
      },
    ],
  });
  // Cell with a bullet list → inline <adf> tag
  t.is(result, `| Col |\n| --- |\n| <adf>${JSON.stringify(list)}</adf> |`);
});

test("table cell with two paragraphs emits both inline separated by space", (t) => {
  const result = adfToMarkdown({
    version: 1,
    type: "doc",
    content: [
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "H" }] }] },
            ],
          },
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                content: [
                  { type: "paragraph", content: [{ type: "text", text: "First" }] },
                  { type: "paragraph", content: [{ type: "text", text: "Second" }] },
                ],
              },
            ],
          },
        ],
      },
    ],
  });
  t.is(result, "| H |\n| --- |\n| First Second |");
});

test("table cell with mixed paragraph and block node emits paragraph inline and block as adf", (t) => {
  const list = {
    type: "bulletList",
    content: [
      { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "item" }] }] },
    ],
  };
  const result = adfToMarkdown({
    version: 1,
    type: "doc",
    content: [
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "H" }] }] },
            ],
          },
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                content: [
                  { type: "paragraph", content: [{ type: "text", text: "Note:" }] },
                  list,
                ],
              },
            ],
          },
        ],
      },
    ],
  });
  t.is(result, `| H |\n| --- |\n| Note: <adf>${JSON.stringify(list)}</adf> |`);
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
cd lib && npx ava test/adf-to-markdown.test.ts -- "table cell with bullet list"
```

Expected: FAIL — current implementation collapses newlines in the multi-line block output, producing garbled content.

- [ ] **Step 3: Add `cellContentToMarkdown` helper in `lib/index.ts`**

Insert this function before `blockNodeToMarkdown` (around line 760):

```typescript
/**
 * Renders the content of a table cell to a Markdown-safe inline string.
 *
 * A "simple" cell (single paragraph) renders its inline content directly.
 * A "complex" cell (multiple block nodes, or non-paragraph block nodes)
 * renders paragraphs and mediaSingle nodes inline; other block nodes are
 * wrapped in <adf> tags. All parts joined with a single space.
 */
function cellContentToMarkdown(cellContent: AdfNode[]): string {
  if (cellContent.length === 0) return " ";

  // Simple case: single paragraph — render inline content directly.
  if (cellContent.length === 1 && cellContent[0]!.type === "paragraph") {
    return inlineNodesToMarkdown(cellContent[0]!.content) || " ";
  }

  // Complex case: multiple block nodes, or non-paragraph single node.
  const parts = cellContent.map((node) => {
    if (node.type === "paragraph") {
      return inlineNodesToMarkdown(node.content);
    }
    if (node.type === "mediaSingle") {
      // Render the image inline so it survives the cell's single-line constraint.
      const media = (node.content ?? []).find((c) => c.type === "media");
      if (media) {
        return `![${media.attrs?.alt ?? ""}](${media.attrs?.url ?? ""})`;
      }
      return "";
    }
    // Block-level node that can't be inlined — emit as inline <adf> tag.
    return `<adf>${JSON.stringify(node)}</adf>`;
  });

  return parts.filter(Boolean).join(" ") || " ";
}
```

- [ ] **Step 4: Update the table case in `blockNodeToMarkdown` to use the helper**

Find the table case (around line 825–845). Replace the `cellTexts` map:

```typescript
// Before:
const cellTexts = cells.map((cell) => {
  const content = blockNodesToMarkdown(cell.content ?? [])
    .replace(/\n+/g, " ")
    .trim();
  return content || " ";
});

// After:
const cellTexts = cells.map((cell) =>
  cellContentToMarkdown(cell.content ?? [])
);
```

- [ ] **Step 5: Run the new tests**

```bash
cd lib && npx ava test/adf-to-markdown.test.ts -- "table cell"
```

Expected: all three new "table cell" tests PASS.

Note: complex cells (bullet lists, multiple paragraphs) are intentionally lossy — no fixture needed. The `<adf>` inline tags in cells survive the round-trip, but `markdownToAdf` wraps them in a `paragraph` node rather than restoring the original cell structure. This is a documented limitation.

- [ ] **Step 6: Run the full test suite**

```bash
cd lib && npm test
```

Expected: all tests pass, including `round-trip: table`. The existing `table.json` has a cell with `[mediaSingle, paragraph]` content. `cellContentToMarkdown` renders this as `"![Example Image](https://picsum.photos/400/300) Image with text in cell"` (mediaSingle → Markdown image string, paragraph → inline text, joined by space). `markdownToAdf` re-parses this via `processParagraph(cell.tokens)`: the image token is extracted as a `mediaSingle` node, and the remaining text token becomes a `paragraph` — reproducing the original `[mediaSingle, paragraph]` structure.

- [ ] **Step 7: Commit**

```bash
git add lib/index.ts lib/test/adf-to-markdown.test.ts
git commit
```

---
## Task 4: Ordered list items 99 and 100 (task 5d)

**Files:**
- Modify: `lib/test/adf-to-markdown.test.ts`

Verify that triple-digit list item numbers are formatted correctly. This is a pure test addition — no implementation change needed (the implementation uses `${start + i}. ` which handles any number).

- [ ] **Step 1: Write the test**

Add to the unit tests section of `lib/test/adf-to-markdown.test.ts`:

```typescript
test("ordered list with triple-digit items (99 and 100)", (t) => {
  const result = adfToMarkdown({
    version: 1,
    type: "doc",
    content: [
      {
        type: "orderedList",
        attrs: { order: 99 },
        content: [
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Ninety-nine" }] }] },
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "One hundred" }] }] },
        ],
      },
    ],
  });
  t.is(result, "99. Ninety-nine\n100. One hundred");
});
```

- [ ] **Step 2: Run the test**

```bash
cd lib && npx ava test/adf-to-markdown.test.ts -- "ordered list with triple-digit"
```

Expected: PASS (implementation already handles this correctly).

- [ ] **Step 3: Commit**

```bash
git add lib/test/adf-to-markdown.test.ts
git commit
```

---

## Task 5: Final verification and finishing

- [ ] **Step 1: Run the full test suite**

```bash
cd lib && npm test
```

Expected: all tests pass.

- [ ] **Step 2: Confirm `adfToMarkdown` is exported from the build**

```bash
cd lib && npm run build
```

Expected: build succeeds, no TypeScript errors. Check `lib/dist/index.d.ts` includes `export declare function adfToMarkdown(...)`.

- [ ] **Step 3: Remove spec and plan docs**

```bash
git rm docs/superpowers/specs/2026-03-23-adf-to-markdown-design.md \
       docs/superpowers/plans/2026-03-23-adf-to-markdown.md \
       docs/superpowers/plans/2026-04-20-adf-inline-tags-and-table-cells.md
git commit
```

- [ ] **Step 4: Invoke finishing-a-development-branch skill**

Use superpowers:finishing-a-development-branch to decide how to integrate the work.
