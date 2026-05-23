<script setup lang="ts">
import type { ThemeName, ThemePreference } from "../theme";
import type { ReportKind } from "../types/report";

defineProps<{
  query: string;
  selectedKinds: Set<ReportKind>;
  loading: boolean;
  sidebarCollapsed: boolean;
  themePreference: ThemePreference;
  activeTheme: ThemeName;
  totalCount: number;
  visibleCount: number;
}>();
const emit = defineEmits<{
  "update:query": [value: string];
  "update:themePreference": [value: ThemePreference];
  toggleKind: [kind: ReportKind];
  refresh: [];
  toggleSidebar: [];
  clearSearch: [];
}>();
const kinds: ReportKind[] = ["早报", "午报", "晚报"];
const themeOptions: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "跟随系统" },
  { value: "light", label: "亮色" },
  { value: "dark", label: "暗色" }
];

function themeLabel(option: ThemePreference, activeTheme: ThemeName) {
  if (option !== "system") return themeOptions.find((item) => item.value === option)?.label ?? option;
  return `跟随系统（${activeTheme === "dark" ? "暗色" : "亮色"}）`;
}
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
    <label class="themeControl">
      <span class="themeControlLabel">主题</span>
      <select
        class="themeSelect"
        :value="themePreference"
        aria-label="主题设置"
        @change="emit('update:themePreference', ($event.target as HTMLSelectElement).value as ThemePreference)"
      >
        <option v-for="option in themeOptions" :key="option.value" :value="option.value">
          {{ themeLabel(option.value, activeTheme) }}
        </option>
      </select>
    </label>
    <button class="iconButton" :disabled="loading" title="刷新" @click="emit('refresh')">刷新</button>
  </header>
</template>
