<script setup lang="ts">
import type { ThemeName, ThemePreference } from "../theme";
import type { ReportSummary } from "../types/report";

defineProps<{
  loading: boolean;
  sidebarCollapsed: boolean;
  mobile: boolean;
  themePreference: ThemePreference;
  activeTheme: ThemeName;
  currentReport?: ReportSummary;
}>();

const emit = defineEmits<{
  "update:themePreference": [value: ThemePreference];
  refresh: [];
  toggleSidebar: [];
}>();

const themeOptions: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "亮色" },
  { value: "dark", label: "暗色" },
  { value: "system", label: "系统" }
];
</script>

<template>
  <header class="toolbar">
    <!-- Collapsed Toggle Button -->
    <button
      v-if="sidebarCollapsed"
      class="sidebarToggleIconBtn"
      type="button"
      aria-label="展开侧边栏"
      title="展开侧边栏"
      @click="emit('toggleSidebar')"
    >
      <svg class="btnIcon" viewBox="0 0 24 24">
        <line x1="3" y1="12" x2="21" y2="12"></line>
        <line x1="3" y1="6" x2="21" y2="6"></line>
        <line x1="3" y1="18" x2="21" y2="18"></line>
      </svg>
    </button>

    <!-- Breadcrumb display -->
    <div v-if="currentReport" class="toolbarBreadcrumb">
      <span>{{ currentReport.date }}</span>
      <span class="breadcrumbSeparator">/</span>
      <span>{{ currentReport.kind }}</span>
      <span class="breadcrumbSeparator">/</span>
      <span class="currentReportTitle">{{ currentReport.title }}</span>
    </div>

    <div class="toolbarSpacer"></div>

    <!-- Segmented Theme Controls -->
    <div class="themeControlGroup">
      <button
        v-for="option in themeOptions"
        :key="option.value"
        class="themeBtn"
        :class="{ active: themePreference === option.value }"
        type="button"
        :title="option.label"
        @click="emit('update:themePreference', option.value)"
      >
        <svg v-if="option.value === 'light'" class="btnIcon" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="5"></circle>
          <line x1="12" y1="1" x2="12" y2="3"></line>
          <line x1="12" y1="21" x2="12" y2="23"></line>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
          <line x1="1" y1="12" x2="3" y2="12"></line>
          <line x1="21" y1="12" x2="23" y2="12"></line>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
          <line x1="18.36" y1="4.22" x2="19.78" y2="5.64"></line>
        </svg>
        <svg v-else-if="option.value === 'dark'" class="btnIcon" viewBox="0 0 24 24">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
        </svg>
        <svg v-else class="btnIcon" viewBox="0 0 24 24">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
          <line x1="8" y1="21" x2="16" y2="21"></line>
          <line x1="12" y1="17" x2="12" y2="21"></line>
        </svg>
        <span>{{ option.label }}</span>
      </button>
    </div>

    <!-- Refresh button with SVG icon -->
    <button class="iconButton" :disabled="loading" title="刷新报告列表" @click="emit('refresh')">
      <svg class="btnIcon" viewBox="0 0 24 24" :class="{ 'animateSpin': loading }">
        <path d="M21.5 2v6h-6"></path>
        <path d="M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
      </svg>
      <span>刷新</span>
    </button>
  </header>
</template>

<style scoped>
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.animateSpin {
  animation: spin 1s linear infinite;
}
</style>
