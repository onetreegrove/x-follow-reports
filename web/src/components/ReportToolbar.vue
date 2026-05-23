<script setup lang="ts">
import type { ThemeName, ThemePreference } from "../theme";

defineProps<{
  loading: boolean;
  sidebarCollapsed: boolean;
  themePreference: ThemePreference;
  activeTheme: ThemeName;
}>();
const emit = defineEmits<{
  "update:themePreference": [value: ThemePreference];
  refresh: [];
  toggleSidebar: [];
}>();
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
    <div class="toolbarSpacer"></div>
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
