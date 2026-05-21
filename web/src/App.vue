<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { fetchReport, fetchReports } from "./api/reports";
import ReportReader from "./components/ReportReader.vue";
import ReportSidebar from "./components/ReportSidebar.vue";
import ReportToolbar from "./components/ReportToolbar.vue";
import { filterReports } from "./reportFilters";
import type { ReportDetail, ReportKind, ReportSummary } from "./types/report";

const reports = ref<ReportSummary[]>([]);
const selectedId = ref<string>();
const selectedReport = ref<ReportDetail>();
const query = ref("");
const selectedKinds = ref(new Set<ReportKind>());
const sidebarCollapsed = ref(false);
const listLoading = ref(false);
const detailLoading = ref(false);
const error = ref<string>();

const filteredReports = computed(() => filterReports(reports.value, query.value, selectedKinds.value));
let mobileMediaQuery: MediaQueryList | undefined;

async function loadReports() {
  listLoading.value = true;
  error.value = undefined;
  try {
    reports.value = await fetchReports();
    if (!selectedId.value && reports.value[0]) selectedId.value = reports.value[0].id;
  } catch (err) {
    error.value = err instanceof Error ? err.message : "报告列表加载失败";
  } finally {
    listLoading.value = false;
  }
}

async function loadDetail(id: string) {
  detailLoading.value = true;
  error.value = undefined;
  try {
    selectedReport.value = await fetchReport(id);
  } catch (err) {
    error.value = err instanceof Error ? err.message : "报告详情加载失败";
  } finally {
    detailLoading.value = false;
  }
}

function toggleKind(kind: ReportKind) {
  const next = new Set(selectedKinds.value);
  if (next.has(kind)) next.delete(kind);
  else next.add(kind);
  selectedKinds.value = next;
}

function selectReport(id: string) {
  selectedId.value = id;
  if (mobileMediaQuery?.matches) sidebarCollapsed.value = true;
}

function syncSidebarForViewport(event?: MediaQueryListEvent | MediaQueryList) {
  sidebarCollapsed.value = Boolean(event?.matches);
}

watch(selectedId, (id) => {
  if (id) void loadDetail(id);
});

onMounted(() => {
  void loadReports();
  mobileMediaQuery = window.matchMedia("(max-width: 820px)");
  syncSidebarForViewport(mobileMediaQuery);
  mobileMediaQuery.addEventListener("change", syncSidebarForViewport);
});

onBeforeUnmount(() => {
  mobileMediaQuery?.removeEventListener("change", syncSidebarForViewport);
});
</script>

<template>
  <div class="appShell" :class="{ sidebarCollapsed }">
    <ReportSidebar
      :reports="filteredReports"
      :selected-id="selectedId"
      :collapsed="sidebarCollapsed"
      @select="selectReport"
      @toggle-collapse="sidebarCollapsed = !sidebarCollapsed"
    />
    <section class="mainPanel">
      <ReportToolbar
        :query="query"
        :selected-kinds="selectedKinds"
        :loading="listLoading"
        :sidebar-collapsed="sidebarCollapsed"
        @update:query="query = $event"
        @toggle-kind="toggleKind"
        @refresh="loadReports"
        @toggle-sidebar="sidebarCollapsed = !sidebarCollapsed"
      />
      <ReportReader :report="selectedReport" :loading="detailLoading" :error="error" />
    </section>
  </div>
</template>
