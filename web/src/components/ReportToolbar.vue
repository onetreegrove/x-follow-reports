<script setup lang="ts">
import type { ReportKind } from "../types/report";

defineProps<{
  query: string;
  selectedKinds: Set<ReportKind>;
  loading: boolean;
  sidebarCollapsed: boolean;
  totalCount: number;
  visibleCount: number;
}>();
const emit = defineEmits<{
  "update:query": [value: string];
  toggleKind: [kind: ReportKind];
  refresh: [];
  toggleSidebar: [];
  clearSearch: [];
}>();
const kinds: ReportKind[] = ["早报", "午报", "晚报"];
</script>

<template>
  <header class="toolbar">
    <button
      class="mobileSidebarButton"
      type="button"
      :aria-label="sidebarCollapsed ? '打开侧边栏' : '关闭侧边栏'"
      :title="sidebarCollapsed ? '打开侧边栏' : '关闭侧边栏'"
      @click="emit('toggleSidebar')"
    >
      {{ sidebarCollapsed ? "☰" : "×" }}
    </button>
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
    <div class="kindFilters">
      <button
        v-for="kind in kinds"
        :key="kind"
        :class="{ active: selectedKinds.has(kind) }"
        :aria-pressed="selectedKinds.has(kind)"
        @click="emit('toggleKind', kind)"
      >
        {{ kind }}
      </button>
    </div>
    <button class="iconButton" :disabled="loading" title="刷新" @click="emit('refresh')">刷新</button>
  </header>
</template>
