<script setup lang="ts">
import type { ReportKind } from "../types/report";

defineProps<{ query: string; selectedKinds: Set<ReportKind>; loading: boolean; sidebarCollapsed: boolean }>();
const emit = defineEmits<{
  "update:query": [value: string];
  toggleKind: [kind: ReportKind];
  refresh: [];
  toggleSidebar: [];
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
    <input
      class="search"
      :value="query"
      placeholder="搜索标题、正文、账号..."
      @input="emit('update:query', ($event.target as HTMLInputElement).value)"
    />
    <div class="kindFilters">
      <button
        v-for="kind in kinds"
        :key="kind"
        :class="{ active: selectedKinds.has(kind) }"
        @click="emit('toggleKind', kind)"
      >
        {{ kind }}
      </button>
    </div>
    <button class="iconButton" :disabled="loading" title="刷新" @click="emit('refresh')">刷新</button>
  </header>
</template>
