<script setup lang="ts">
import { computed } from "vue";
import { buildReportTree } from "../reportTree";
import type { ReportSummary } from "../types/report";

const props = defineProps<{
  reports: ReportSummary[];
  selectedId?: string;
  collapsed?: boolean;
  loading?: boolean;
  error?: string;
}>();
const emit = defineEmits<{ select: [id: string]; "toggle-collapse": [] }>();

const tree = computed(() => buildReportTree(props.reports));

const today = computed(() => {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const day = String(now.getDate()).padStart(2, "0");
  return { month, day };
});

function isToday(month: string, day: string) {
  return month === today.value.month && day === today.value.day;
}

function monthHasToday(month: string) {
  return month === today.value.month;
}

function getDayDisplay(monthStr: string, dayStr: string): string {
  const dateStr = `${monthStr}-${dayStr}`;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return `${dayStr}日`;
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const weekday = weekdays[date.getDay()];
  return `${dayStr}日 (${weekday})`;
}
</script>

<template>
  <aside class="sidebar" :class="{ collapsed }">
    <template v-if="!collapsed">
      <div class="sidebarHeader">
        <div class="brand">
          <span class="brandIcon">📰</span>
          <span>X Reports</span>
        </div>
        <button
          class="sidebarToggleInline"
          type="button"
          aria-label="收起侧边栏"
          title="收起侧边栏"
          @click="emit('toggle-collapse')"
        >
          <svg class="btnIcon" viewBox="0 0 24 24">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>
      </div>

      <div class="sidebarContent">
        <div v-if="loading" class="sidebarState">
          <div class="skeleton skeletonMeta" style="width: 100%; margin-bottom: 8px;"></div>
          <div class="skeleton skeletonMeta" style="width: 80%;"></div>
        </div>
        <div v-else-if="error" class="sidebarState error">{{ error }}</div>
        <div v-else-if="tree.length === 0" class="sidebarState">没有匹配报告</div>
        <template v-else>
          <details v-for="month in tree" :key="month.month" class="monthGroup" :open="monthHasToday(month.month)">
            <summary class="monthLabel">{{ month.month }}</summary>
            <details
              v-for="day in month.days"
              :key="`${month.month}-${day.day}`"
              class="dayGroup"
              :open="isToday(month.month, day.day)"
            >
              <summary class="dayLabel">{{ getDayDisplay(month.month, day.day) }}</summary>
              <details
                v-for="kind in day.kinds"
                :key="`${month.month}-${day.day}-${kind.kind}`"
                class="kindGroup"
                :open="isToday(month.month, day.day)"
              >
                <summary class="kindLabel">{{ kind.kind }}</summary>
                <button
                  v-for="report in kind.reports"
                  :key="report.id"
                  class="reportItem"
                  :class="{ selected: report.id === selectedId }"
                  :aria-current="report.id === selectedId ? 'true' : undefined"
                  :title="report.title"
                  @click="emit('select', report.id)"
                >
                  <span class="reportItemTop">
                    <span class="time">{{ report.time }}</span>
                    <span v-if="report.itemCount" class="reportCount">{{ report.itemCount }} 条</span>
                  </span>
                </button>
              </details>
            </details>
          </details>
        </template>
      </div>
    </template>
  </aside>
</template>
