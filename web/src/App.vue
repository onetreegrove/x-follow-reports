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

async function loadReports() {
  listLoading.value = true;
  listError.value = undefined;
  try {
    reports.value = await fetchReports();
    selectedId.value = resolveVisibleSelection(reports.value, selectedId.value);
  } catch (err) {
    listError.value = err instanceof Error ? err.message : "报告列表加载失败";
  } finally {
    listLoading.value = false;
  }
}

async function loadDetail(id: string) {
  detailLoading.value = true;
  detailError.value = undefined;
  try {
    selectedReport.value = await fetchReport(id);
  } catch (err) {
    detailError.value = err instanceof Error ? err.message : "报告详情加载失败";
  } finally {
    detailLoading.value = false;
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
  if (event.key === "Escape" && mobileDrawerOpen.value) closeSidebar();
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
  if (id) void loadDetail(id);
});

watch(reports, (visibleReports) => {
  const nextId = resolveVisibleSelection(visibleReports, selectedId.value);
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
        :theme-preference="themePreference"
        :active-theme="activeTheme"
        @update:theme-preference="updateThemePreference"
        @refresh="loadReports"
        @toggle-sidebar="sidebarCollapsed = !sidebarCollapsed"
      />
      <ReportReader
        :report="selectedReport"
        :loading="detailLoading"
        :error="detailError"
        empty-message="暂无报告"
      />
    </section>
  </div>
</template>
