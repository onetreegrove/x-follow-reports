<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { fetchReport, fetchReports } from "./api/reports";
import ReportReader from "./components/ReportReader.vue";
import ReportSidebar from "./components/ReportSidebar.vue";
import ReportToolbar from "./components/ReportToolbar.vue";
import { resolveVisibleSelection } from "./reportSelection";
import { getStoredThemePreference, resolveTheme, setStoredThemePreference } from "./theme";
import type { ThemePreference } from "./theme";
import type { ReportDetail, ReportSummary } from "./types/report";

const reports = ref<ReportSummary[]>([]);
const selectedId = ref<string>();
const selectedReport = ref<ReportDetail>();
const sidebarCollapsed = ref(false);
const listLoading = ref(false);
const detailLoading = ref(false);
const listError = ref<string>();
const detailError = ref<string>();
const isMobileViewport = ref(false);
const themePreference = ref<ThemePreference>("system");
const systemPrefersDark = ref(false);

const mobileDrawerOpen = computed(() => isMobileViewport.value && !sidebarCollapsed.value);
const activeTheme = computed(() => resolveTheme(themePreference.value, systemPrefersDark.value));
let mobileMediaQuery: MediaQueryList | undefined;
let themeMediaQuery: MediaQueryList | undefined;
let activeAbortController: AbortController | null = null;

// Selected report summary for toolbar breadcrumbs
const selectedSummary = computed(() => {
  return reports.value.find((r) => r.id === selectedId.value);
});

// Navigation indices (reports are sorted by time desc, so index+1 is older, index-1 is newer)
const selectedIndex = computed(() => {
  if (!selectedId.value) return -1;
  return reports.value.findIndex((r) => r.id === selectedId.value);
});

const hasPrev = computed(() => {
  return selectedIndex.value !== -1 && selectedIndex.value < reports.value.length - 1;
});

const hasNext = computed(() => {
  return selectedIndex.value > 0;
});

function goPrev() {
  if (hasPrev.value) {
    selectReport(reports.value[selectedIndex.value + 1].id);
  }
}

function goNext() {
  if (hasNext.value) {
    selectReport(reports.value[selectedIndex.value - 1].id);
  }
}

async function loadReports() {
  listLoading.value = true;
  listError.value = undefined;
  try {
    reports.value = await fetchReports();
    // Resolve initial selection from URL or first report
    const url = new URL(window.location.href);
    const reportParam = url.searchParams.get("report");
    selectedId.value = resolveVisibleSelection(reports.value, reportParam || selectedId.value);
  } catch (err) {
    listError.value = err instanceof Error ? err.message : "报告列表加载失败";
  } finally {
    listLoading.value = false;
  }
}

async function loadDetail(id: string) {
  if (activeAbortController) {
    activeAbortController.abort();
  }
  const controller = new AbortController();
  activeAbortController = controller;

  detailLoading.value = true;
  detailError.value = undefined;
  try {
    selectedReport.value = await fetchReport(id, controller.signal);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return; // Ignore aborted requests
    }
    detailError.value = err instanceof Error ? err.message : "报告详情加载失败";
  } finally {
    if (activeAbortController === controller) {
      detailLoading.value = false;
      activeAbortController = null;
    }
  }
}

function selectReport(id: string) {
  selectedId.value = id;
  if (mobileMediaQuery?.matches) sidebarCollapsed.value = true;
}

function closeSidebar() {
  sidebarCollapsed.value = true;
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" && mobileDrawerOpen.value) {
    closeSidebar();
    return;
  }

  // Ignore key shortcuts if user is typing in forms/selects
  const activeEl = document.activeElement;
  if (activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "SELECT" || activeEl.tagName === "TEXTAREA")) {
    return;
  }

  if (event.key === "ArrowDown" || event.key.toLowerCase() === "j") {
    event.preventDefault();
    goPrev();
  } else if (event.key === "ArrowUp" || event.key.toLowerCase() === "k") {
    event.preventDefault();
    goNext();
  }
}

function syncSidebarForViewport(event?: MediaQueryListEvent | MediaQueryList) {
  isMobileViewport.value = Boolean(event?.matches);
  sidebarCollapsed.value = isMobileViewport.value;
}

function syncSystemTheme(event?: MediaQueryListEvent | MediaQueryList) {
  systemPrefersDark.value = Boolean(event?.matches);
}

function updateThemePreference(preference: ThemePreference) {
  themePreference.value = preference;
  setStoredThemePreference(window.localStorage, preference);
}

watch(selectedId, (id) => {
  if (id) {
    void loadDetail(id);
    const url = new URL(window.location.href);
    url.searchParams.set("report", id);
    window.history.replaceState({}, "", url.pathname + url.search);
  } else {
    selectedReport.value = undefined;
    const url = new URL(window.location.href);
    url.searchParams.delete("report");
    window.history.replaceState({}, "", url.pathname + url.search);
  }
});

watch(reports, (visibleReports) => {
  const url = new URL(window.location.href);
  const reportParam = url.searchParams.get("report");
  const nextId = resolveVisibleSelection(visibleReports, reportParam || selectedId.value);
  if (nextId !== selectedId.value) {
    selectedId.value = nextId;
    if (!nextId) selectedReport.value = undefined;
  }
});

watch(
  activeTheme,
  (theme) => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  },
  { immediate: true }
);

onMounted(() => {
  void loadReports();
  themePreference.value = getStoredThemePreference(window.localStorage);
  themeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  syncSystemTheme(themeMediaQuery);
  themeMediaQuery.addEventListener("change", syncSystemTheme);
  mobileMediaQuery = window.matchMedia("(max-width: 820px)");
  syncSidebarForViewport(mobileMediaQuery);
  mobileMediaQuery.addEventListener("change", syncSidebarForViewport);
  window.addEventListener("keydown", handleKeydown);
});

onBeforeUnmount(() => {
  mobileMediaQuery?.removeEventListener("change", syncSidebarForViewport);
  themeMediaQuery?.removeEventListener("change", syncSystemTheme);
  window.removeEventListener("keydown", handleKeydown);
});
</script>

<template>
  <div class="appShell" :class="{ sidebarCollapsed }">
    <ReportSidebar
      :reports="reports"
      :selected-id="selectedId"
      :collapsed="sidebarCollapsed"
      :loading="listLoading"
      :error="listError"
      @select="selectReport"
      @toggle-collapse="sidebarCollapsed = !sidebarCollapsed"
    />
    <button
      v-if="mobileDrawerOpen"
      class="drawerOverlay"
      type="button"
      aria-label="关闭侧边栏遮罩"
      @click="closeSidebar"
    ></button>
    <section class="mainPanel">
      <ReportToolbar
        :loading="listLoading"
        :sidebar-collapsed="sidebarCollapsed"
        :mobile="isMobileViewport"
        :theme-preference="themePreference"
        :active-theme="activeTheme"
        :current-report="selectedSummary"
        @update:theme-preference="updateThemePreference"
        @refresh="loadReports"
        @toggle-sidebar="sidebarCollapsed = !sidebarCollapsed"
      />
      <ReportReader
        :report="selectedReport"
        :loading="detailLoading"
        :error="detailError"
        :has-prev="hasPrev"
        :has-next="hasNext"
        empty-message="暂无报告"
        @prev="goPrev"
        @next="goNext"
      />
    </section>
  </div>
</template>
