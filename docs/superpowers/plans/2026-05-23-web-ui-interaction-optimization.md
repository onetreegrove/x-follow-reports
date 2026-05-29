# Web UI Interaction Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the `web/` report reader UI by fixing filter/selection consistency, making report navigation more informative, completing mobile drawer behavior, and adding focused accessibility/search feedback.

**Architecture:** Keep the existing Vue 3 component structure. Add one small pure selection helper for testable state logic, then update `App.vue`, `ReportSidebar.vue`, `ReportToolbar.vue`, `ReportReader.vue`, and `styles.css` without changing API contracts.

**Tech Stack:** Vue 3 Composition API, TypeScript, Vite, Vitest, `@vue/server-renderer`.

---

## Scope

First-round scope:

- Sync current report selection with filtered report results.
- Show clear no-result and list-error states.
- Add title/count metadata to sidebar report items.
- Add mobile drawer overlay, click-outside close, and Escape close.
- Add search clear, result counts, `aria-pressed`, `aria-current`, and `:focus-visible`.

Deferred scope:

- Markdown table/code/blockquote styling.
- Retaining previous report while next detail loads.
- Full default-open branch rewrite for selected historical reports.
- Desktop collapsed sidebar redesign.

## File Map

- `web/src/reportSelection.ts`: new pure helper for resolving the visible selected report id.
- `web/src/reportSelection.test.ts`: unit tests for selection/filter consistency.
- `web/src/App.vue`: orchestrates list/detail errors, empty messages, drawer overlay events, and filtered selection sync.
- `web/src/components/ReportSidebar.vue`: shows richer report item labels and sidebar loading/error/empty states.
- `web/src/components/ReportSidebar.test.ts`: SSR tests for richer labels and accessibility state.
- `web/src/components/ReportToolbar.vue`: adds clear-search, result count text, and pressed state semantics.
- `web/src/components/ReportToolbar.test.ts`: SSR tests for toolbar count, clear button, and ARIA.
- `web/src/components/ReportReader.vue`: accepts an explicit empty message.
- `web/src/styles.css`: styles report item metadata, toolbar count/clear button, focus states, empty states, and mobile drawer overlay.

---

### Task 1: Add Filtered Selection Resolution

**Files:**
- Create: `web/src/reportSelection.ts`
- Create: `web/src/reportSelection.test.ts`
- Modify: `web/src/App.vue`

- [ ] **Step 1: Write the failing helper tests**

Create `web/src/reportSelection.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveVisibleSelection } from "./reportSelection";
import type { ReportSummary } from "./types/report";

const reports: ReportSummary[] = [
  {
    id: "newest",
    title: "AI 开发者晚报",
    kind: "晚报",
    date: "2026-05/23",
    path: "2026-05/23/152731-晚报.md",
    excerpt: "",
    createdAtMs: 3
  },
  {
    id: "morning",
    title: "AI 开发者早报",
    kind: "早报",
    date: "2026-05/23",
    path: "2026-05/23/090000-早报.md",
    excerpt: "",
    createdAtMs: 2
  }
];

describe("resolveVisibleSelection", () => {
  it("keeps the selected report when it is still visible", () => {
    expect(resolveVisibleSelection(reports, "morning")).toBe("morning");
  });

  it("selects the first visible report when the current report is filtered out", () => {
    expect(resolveVisibleSelection([reports[0]], "morning")).toBe("newest");
  });

  it("clears selection when no reports are visible", () => {
    expect(resolveVisibleSelection([], "morning")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the helper test and confirm it fails**

Run:

```bash
cd /Users/justonetree/wwwroot/x-follow/web
pnpm vitest run src/reportSelection.test.ts
```

Expected: FAIL because `./reportSelection` does not exist.

- [ ] **Step 3: Implement the helper**

Create `web/src/reportSelection.ts`:

```ts
import type { ReportSummary } from "./types/report";

export function resolveVisibleSelection(reports: ReportSummary[], selectedId?: string): string | undefined {
  if (selectedId && reports.some((report) => report.id === selectedId)) return selectedId;
  return reports[0]?.id;
}
```

- [ ] **Step 4: Run the helper test and confirm it passes**

Run:

```bash
cd /Users/justonetree/wwwroot/x-follow/web
pnpm vitest run src/reportSelection.test.ts
```

Expected: PASS.

- [ ] **Step 5: Integrate selection sync in `App.vue`**

In `web/src/App.vue`, add the import:

```ts
import { resolveVisibleSelection } from "./reportSelection";
```

Replace the current `loadReports()` selection assignment:

```ts
if (!selectedId.value && reports.value[0]) selectedId.value = reports.value[0].id;
```

with:

```ts
selectedId.value = resolveVisibleSelection(filteredReports.value, selectedId.value);
```

Add this watcher after the existing `watch(selectedId, ...)` block:

```ts
watch(filteredReports, (visibleReports) => {
  const nextId = resolveVisibleSelection(visibleReports, selectedId.value);
  if (nextId !== selectedId.value) {
    selectedId.value = nextId;
    if (!nextId) selectedReport.value = undefined;
  }
});
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
cd /Users/justonetree/wwwroot/x-follow/web
pnpm test
```

Expected: all tests pass.

---

### Task 2: Split List/Detail Errors and Add Clear Empty States

**Files:**
- Modify: `web/src/App.vue`
- Modify: `web/src/components/ReportSidebar.vue`
- Modify: `web/src/components/ReportSidebar.test.ts`
- Modify: `web/src/components/ReportReader.vue`

- [ ] **Step 1: Extend sidebar tests for list error and empty state**

In `web/src/components/ReportSidebar.test.ts`, update `renderSidebar` to accept optional overrides:

```ts
function renderSidebar(collapsed: boolean, overrides: Partial<InstanceType<typeof ReportSidebar>["$props"]> = {}) {
  return renderToString(
    createSSRApp({
      render: () =>
        h(ReportSidebar, {
          reports,
          selectedId: "morning",
          collapsed,
          loading: false,
          error: undefined,
          ...overrides
        })
    })
  );
}
```

Add tests:

```ts
it("shows a sidebar error when the report list fails", async () => {
  const html = await renderSidebar(false, { error: "报告列表加载失败" });

  expect(html).toContain("报告列表加载失败");
  expect(html).toContain("sidebarState error");
});

it("shows an empty sidebar state when no reports match", async () => {
  const html = await renderSidebar(false, { reports: [] });

  expect(html).toContain("没有匹配报告");
  expect(html).toContain("sidebarState");
});
```

- [ ] **Step 2: Run sidebar tests and confirm they fail**

Run:

```bash
cd /Users/justonetree/wwwroot/x-follow/web
pnpm vitest run src/components/ReportSidebar.test.ts
```

Expected: FAIL because `ReportSidebar` does not accept `loading` / `error` and does not render these states.

- [ ] **Step 3: Update `ReportSidebar.vue` props and template**

Change props in `web/src/components/ReportSidebar.vue`:

```ts
const props = defineProps<{
  reports: ReportSummary[];
  selectedId?: string;
  collapsed?: boolean;
  loading?: boolean;
  error?: string;
}>();
```

Inside the expanded template, directly after `<div class="brand">X Reports</div>`, add:

```vue
<div v-if="loading" class="sidebarState">正在加载报告列表...</div>
<div v-else-if="error" class="sidebarState error">{{ error }}</div>
<div v-else-if="tree.length === 0" class="sidebarState">没有匹配报告</div>
```

Wrap the existing `details v-for="month in tree"` block with:

```vue
<template v-else>
  <!-- existing month/day/kind details block stays here -->
</template>
```

- [ ] **Step 4: Split error state in `App.vue`**

Replace:

```ts
const error = ref<string>();
```

with:

```ts
const listError = ref<string>();
const detailError = ref<string>();
```

Update `loadReports()`:

```ts
listLoading.value = true;
listError.value = undefined;
try {
  reports.value = await fetchReports();
  selectedId.value = resolveVisibleSelection(filteredReports.value, selectedId.value);
} catch (err) {
  listError.value = err instanceof Error ? err.message : "报告列表加载失败";
} finally {
  listLoading.value = false;
}
```

Update `loadDetail()`:

```ts
detailLoading.value = true;
detailError.value = undefined;
try {
  selectedReport.value = await fetchReport(id);
} catch (err) {
  detailError.value = err instanceof Error ? err.message : "报告详情加载失败";
} finally {
  detailLoading.value = false;
}
```

Pass list state to `ReportSidebar`:

```vue
:loading="listLoading"
:error="listError"
```

Pass detail state to `ReportReader`:

```vue
:error="detailError"
```

- [ ] **Step 5: Add explicit empty message in reader**

In `web/src/components/ReportReader.vue`, change props:

```ts
const props = defineProps<{ report?: ReportDetail; loading: boolean; error?: string; emptyMessage?: string }>();
```

Replace:

```vue
<div v-else-if="!report" class="state">暂无报告</div>
```

with:

```vue
<div v-else-if="!report" class="state">{{ emptyMessage || "暂无报告" }}</div>
```

In `App.vue`, add:

```ts
const hasActiveFilters = computed(() => Boolean(query.value.trim()) || selectedKinds.value.size > 0);
const readerEmptyMessage = computed(() => (hasActiveFilters.value ? "没有找到匹配报告" : "暂无报告"));
```

Pass it:

```vue
<ReportReader
  :report="selectedReport"
  :loading="detailLoading"
  :error="detailError"
  :empty-message="readerEmptyMessage"
/>
```

- [ ] **Step 6: Run tests**

Run:

```bash
cd /Users/justonetree/wwwroot/x-follow/web
pnpm test
```

Expected: all tests pass.

---

### Task 3: Improve Sidebar Report Item Density and Current State

**Files:**
- Modify: `web/src/components/ReportSidebar.vue`
- Modify: `web/src/components/ReportSidebar.test.ts`
- Modify: `web/src/styles.css`

- [ ] **Step 1: Add failing SSR assertions for report metadata**

In `web/src/components/ReportSidebar.test.ts`, add `itemCount` to the `late` report fixture:

```ts
itemCount: 16,
```

Add this test:

```ts
it("renders report title, item count, and current state in each report item", async () => {
  const html = await renderSidebar(false, { selectedId: "late" });

  expect(html).toContain("AI 开发者晚报");
  expect(html).toContain("16 条");
  expect(html).toContain('aria-current="true"');
});
```

- [ ] **Step 2: Run the sidebar test and confirm it fails**

Run:

```bash
cd /Users/justonetree/wwwroot/x-follow/web
pnpm vitest run src/components/ReportSidebar.test.ts
```

Expected: FAIL because report items only render time and no `aria-current`.

- [ ] **Step 3: Update report item template**

In `web/src/components/ReportSidebar.vue`, replace the report button content:

```vue
<button
  v-for="report in kind.reports"
  :key="report.id"
  class="reportItem"
  :class="{ selected: report.id === selectedId }"
  @click="emit('select', report.id)"
>
  <span class="time">{{ report.time }}</span>
</button>
```

with:

```vue
<button
  v-for="report in kind.reports"
  :key="report.id"
  class="reportItem"
  :class="{ selected: report.id === selectedId }"
  :aria-current="report.id === selectedId ? 'true' : undefined"
  @click="emit('select', report.id)"
>
  <span class="reportItemTop">
    <span class="time">{{ report.time }}</span>
    <span v-if="report.itemCount" class="reportCount">{{ report.itemCount }} 条</span>
  </span>
  <span class="reportTitle">{{ report.title }}</span>
</button>
```

- [ ] **Step 4: Add CSS for denser report items**

In `web/src/styles.css`, add after `.reportItem.selected`:

```css
.reportItemTop {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.reportCount {
  color: #64748b;
  font-size: 11px;
  line-height: 1.35;
  white-space: nowrap;
}

.reportTitle {
  display: block;
  margin-top: 3px;
  color: #172033;
  font-size: 12px;
  font-weight: 650;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reportItem.selected .reportTitle,
.reportItem.selected .time,
.reportItem.selected .reportCount {
  color: #174ea6;
}
```

- [ ] **Step 5: Run sidebar tests**

Run:

```bash
cd /Users/justonetree/wwwroot/x-follow/web
pnpm vitest run src/components/ReportSidebar.test.ts
```

Expected: PASS.

---

### Task 4: Add Toolbar Search Feedback, Clear Action, and Filter Semantics

**Files:**
- Modify: `web/src/components/ReportToolbar.vue`
- Modify: `web/src/components/ReportToolbar.test.ts`
- Modify: `web/src/App.vue`
- Modify: `web/src/styles.css`

- [ ] **Step 1: Extend toolbar tests**

In `web/src/components/ReportToolbar.test.ts`, update `renderToolbar`:

```ts
function renderToolbar(sidebarCollapsed: boolean, overrides: Record<string, unknown> = {}) {
  return renderToString(
    createSSRApp({
      render: () =>
        h(ReportToolbar, {
          query: "",
          selectedKinds: new Set<ReportKind>(),
          loading: false,
          sidebarCollapsed,
          totalCount: 12,
          visibleCount: 4,
          ...overrides
        })
    })
  );
}
```

Add tests:

```ts
it("renders result counts", async () => {
  const html = await renderToolbar(true);

  expect(html).toContain("显示 4 / 12");
});

it("renders a clear search button only when query is present", async () => {
  const emptyHtml = await renderToolbar(true, { query: "" });
  const queryHtml = await renderToolbar(true, { query: "claude" });

  expect(emptyHtml).not.toContain('aria-label="清空搜索"');
  expect(queryHtml).toContain('aria-label="清空搜索"');
});

it("marks active kind filters with aria-pressed", async () => {
  const html = await renderToolbar(true, { selectedKinds: new Set<ReportKind>(["晚报"]) });

  expect(html).toContain('aria-pressed="true"');
  expect(html).toContain('aria-pressed="false"');
});
```

- [ ] **Step 2: Run toolbar tests and confirm they fail**

Run:

```bash
cd /Users/justonetree/wwwroot/x-follow/web
pnpm vitest run src/components/ReportToolbar.test.ts
```

Expected: FAIL because count, clear button, and `aria-pressed` are missing.

- [ ] **Step 3: Update toolbar props and emits**

In `web/src/components/ReportToolbar.vue`, change props:

```ts
defineProps<{
  query: string;
  selectedKinds: Set<ReportKind>;
  loading: boolean;
  sidebarCollapsed: boolean;
  totalCount: number;
  visibleCount: number;
}>();
```

Add an emit:

```ts
clearSearch: [];
```

- [ ] **Step 4: Update toolbar template**

Wrap the search input in a container:

```vue
<div class="searchWrap">
  <input
    class="search"
    :value="query"
    aria-label="搜索报告"
    placeholder="搜索标题、正文、账号..."
    @input="emit('update:query', ($event.target as HTMLInputElement).value)"
  />
  <button
    v-if="query"
    class="clearSearchButton"
    type="button"
    aria-label="清空搜索"
    title="清空搜索"
    @click="emit('clearSearch')"
  >
    ×
  </button>
</div>
<span class="resultCount">显示 {{ visibleCount }} / {{ totalCount }}</span>
```

Add `aria-pressed` to kind filter buttons:

```vue
:aria-pressed="selectedKinds.has(kind)"
```

- [ ] **Step 5: Wire toolbar props and clear action in `App.vue`**

In the `ReportToolbar` usage, add:

```vue
:total-count="reports.length"
:visible-count="filteredReports.length"
@clear-search="query = ''"
```

- [ ] **Step 6: Add toolbar CSS**

In `web/src/styles.css`, replace `.search` flex ownership with:

```css
.searchWrap {
  position: relative;
  flex: 1;
  min-width: 180px;
}

.search {
  width: 100%;
  border: 1px solid #cbd5e1;
  background: #fff;
  border-radius: 8px;
  padding: 10px 38px 10px 12px;
  min-width: 0;
}

.clearSearchButton {
  position: absolute;
  top: 50%;
  right: 6px;
  width: 28px;
  height: 28px;
  transform: translateY(-50%);
  border: 0;
  background: transparent;
  color: #64748b;
  cursor: pointer;
}

.resultCount {
  color: #64748b;
  font-size: 13px;
  white-space: nowrap;
}
```

In the mobile media query, replace `.search` layout rule with:

```css
.searchWrap {
  min-width: 0;
  flex: 1 1 calc(100% - 52px);
}

.resultCount {
  order: 2;
  width: 100%;
}

.kindFilters {
  order: 3;
  width: 100%;
}

.iconButton {
  order: 4;
  width: 100%;
}
```

- [ ] **Step 7: Run toolbar and full tests**

Run:

```bash
cd /Users/justonetree/wwwroot/x-follow/web
pnpm vitest run src/components/ReportToolbar.test.ts
pnpm test
```

Expected: all tests pass.

---

### Task 5: Complete Mobile Drawer Overlay and Keyboard Close

**Files:**
- Modify: `web/src/App.vue`
- Modify: `web/src/styles.css`

- [ ] **Step 1: Add drawer computed state and Escape handler in `App.vue`**

Add after existing computed values:

```ts
const mobileDrawerOpen = computed(() => mobileMediaQuery?.matches && !sidebarCollapsed.value);
```

Add:

```ts
function closeSidebar() {
  sidebarCollapsed.value = true;
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" && mobileDrawerOpen.value) closeSidebar();
}
```

In `onMounted`, add:

```ts
window.addEventListener("keydown", handleKeydown);
```

In `onBeforeUnmount`, add:

```ts
window.removeEventListener("keydown", handleKeydown);
```

- [ ] **Step 2: Add overlay markup**

In `web/src/App.vue`, directly after `<ReportSidebar ... />`, add:

```vue
<button
  v-if="mobileDrawerOpen"
  class="drawerOverlay"
  type="button"
  aria-label="关闭侧边栏"
  @click="closeSidebar"
></button>
```

Keep the existing toolbar toggle behavior:

```vue
@toggle-sidebar="sidebarCollapsed = !sidebarCollapsed"
```

- [ ] **Step 3: Add overlay CSS**

In `web/src/styles.css`, add outside media query:

```css
.drawerOverlay {
  display: none;
}
```

Inside `@media (max-width: 820px)`, add:

```css
.drawerOverlay {
  position: fixed;
  inset: 0;
  display: block;
  border: 0;
  background: rgba(15, 23, 42, 0.28);
  cursor: pointer;
  z-index: 10;
}

.sidebar {
  z-index: 20;
}

.toolbar {
  z-index: 2;
}
```

Ensure `.drawerOverlay` appears behind `.sidebar` and above the page content.

- [ ] **Step 4: Run tests**

Run:

```bash
cd /Users/justonetree/wwwroot/x-follow/web
pnpm test
```

Expected: all tests pass.

---

### Task 6: Add Focus Visible and Final Visual Verification

**Files:**
- Modify: `web/src/styles.css`

- [ ] **Step 1: Add global focus styles**

In `web/src/styles.css`, add after the `button, input` rule:

```css
button:focus-visible,
input:focus-visible,
summary:focus-visible {
  outline: 2px solid #2563eb;
  outline-offset: 2px;
}
```

- [ ] **Step 2: Run full test suite**

Run:

```bash
cd /Users/justonetree/wwwroot/x-follow/web
pnpm test
```

Expected: all tests pass.

- [ ] **Step 3: Start the dev server**

Run:

```bash
cd /Users/justonetree/wwwroot/x-follow/web
pnpm dev
```

Expected:

```text
VITE ready
Local: http://127.0.0.1:5173/
Report API listening on http://127.0.0.1:8787
```

- [ ] **Step 4: Browser-check desktop**

Open `http://127.0.0.1:5173/` at desktop width.

Verify:

- Sidebar report items show time, title, and item count when available.
- Search count reads like `显示 N / M`.
- Active filter buttons remain visually selected.
- Keyboard tab focus is visible on search, buttons, summaries, and report items.

- [ ] **Step 5: Browser-check mobile**

Set viewport to `390x844`.

Verify:

- Toolbar remains usable.
- Tapping the menu opens the sidebar.
- A dim overlay appears over content.
- Tapping overlay closes the sidebar.
- Pressing Escape closes the sidebar.
- Selecting a report closes the sidebar.

- [ ] **Step 6: Stop the dev server**

Stop the `pnpm dev` process.

- [ ] **Step 7: Final status check**

Run:

```bash
cd /Users/justonetree/wwwroot/x-follow
git status --short
```

Expected: only intended `web/` and plan/doc files are modified.

---

## Acceptance Criteria

- Filtering and search never leave the reader showing a report that is absent from the filtered sidebar.
- Empty filter results show a clear empty state in both navigation and reader area.
- Sidebar report items are identifiable without clicking.
- Mobile drawer has overlay, click-outside close, and Escape close.
- Search can be cleared in one click and displays visible/total counts.
- Filter buttons expose `aria-pressed`; selected report exposes `aria-current`.
- Keyboard focus is visible.
- `pnpm test` passes.
- Desktop and mobile browser verification pass.

## Self-Review

- Spec coverage: Covers the recommended first-round items from `docs/web-ui-interaction-optimization-report.md`: selection sync, richer sidebar items, mobile drawer overlay/close, search clear/count, and accessibility basics.
- Deferred coverage: Leaves Markdown full styling, advanced loading retention, path disclosure, and selected-branch expansion for later because they are not required for first-round state correctness.
- Placeholder scan: No task uses undefined placeholder steps.
- Type consistency: New props are listed with concrete names and wired through `App.vue` to the receiving components.
