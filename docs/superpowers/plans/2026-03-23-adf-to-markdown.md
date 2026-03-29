# ADF to Markdown Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `adfToMarkdown(adf)` function to `lib/index.ts` that converts Atlassian Document Format JSON to GitHub-flavoured Markdown, with lossless round-trip fidelity for all node types produced by the existing `markdownToAdf` function.

**Architecture:** Mirror the existing switch/case structure — two internal dispatcher functions (`blockNodeToMarkdown` and `inlineNodesToMarkdown`) called from a top-level `adfToMarkdown` export. Unknown node types fall back to an `<adf>` passthrough block so they survive the round-trip losslessly. The function is designed for trusted Atlassian API input and degrades gracefully rather than throwing.

**Tech Stack:** TypeScript, AVA 6, `tsimp`, ESM modules. No new dependencies.

---

## Status

Tasks 0–4 are **complete** (committed on branch `feat/adf-to-markdown`). Remaining work is tracked below.

---

## ✅ Task 0: Extract `normalizeAdfForTesting` into `lib/test/test-helpers.ts` — DONE

## ✅ Task 1: Extend `code-blocks.json` fixture — DONE

## ✅ Task 2: Implement `adfToMarkdown` in `lib/index.ts` — DONE

## ✅ Task 3: Write unit tests for `adfToMarkdown` — DONE

## ✅ Task 4: Add round-trip tests using `test.macro()` — DONE

---

## Task 5: Remaining work

### 5a: Special characters — simple cases ✅ DONE

Plain text nodes containing `*`, `_`, `` ` ``, `~`, `\`, `[` were not escaped, causing them to be interpreted as Markdown formatting on round-trip.

**Fix (committed):** `inlineNodesToMarkdown` now escapes `[\\*_\`~\[]` in text nodes with no marks.

**New fixture:** `lib/test/fixtures/special-chars-simple.json` — the round-trippable subset of `special-chars.json` (excludes em-marked asterisk/underscore nodes). Round-trip test enabled.

**New unit tests:** individual assertion + round-trip test for each escape pattern (`*`, `_`, `` ` ``, `~~`, `\`, `[`), plus a "marked text is not double-escaped" guard.

### 5b: Special characters — complex cases (em-marked `*`/`_`) ✅ DONE

Fixed `inlineNodesToMarkdown` to escape `*` and `_` in marked (em/strong) text nodes. Fixed `blockNodeToMarkdown` paragraph case to escape a leading `#` character to prevent round-trip as a heading. Removed `special-chars-simple.json` (redundant). Updated `special-chars.json` fixture with self-documenting hash edge-case paragraphs. Round-trip test for full `special-chars` fixture enabled and passing.

### 5c: Tables — complex cell content 🔲 TODO

GFM table cells only support inline content (plain text + marks). Cells containing block-level content (newlines that imply multiple paragraphs, unordered lists, etc.) cannot be represented in a GFM pipe table.

**Requirements:**
- Test all inline content that `marked` supports in table cells (bold, italic, code, links, strikethrough) — these should render inline in the cell
- Test block-level content that `marked` cannot represent in a cell (bullet list, multiple paragraphs, etc.) — these should fall back to `<adf>` **within the cell** (not the whole table)
- Update `blockNodeToMarkdown` `table` case and/or the cell-rendering logic to detect and fall back appropriately

### 5d: Ordered lists — items 99 and 100 🔲 TODO

The existing ordered list test/fixture only covers items up to single- and double-digit numbers. Expand to include items at positions 99 and 100 to ensure the implementation handles triple-digit numbering correctly.

**Requirements:**
- Add a unit test with a 100-item (or 99-starting) ordered list asserting correct numbering
- Extend the `nested-list.json` fixture (or create a dedicated fixture) to include a list that includes items numbered 99 and 100

---

## Task 6: Final verification and finishing

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
