<script setup lang="ts">
import { computed } from "vue";
import { buildReportTree } from "../reportTree";
import type { ReportSummary } from "../types/report";

const props = defineProps<{ reports: ReportSummary[]; selectedId?: string; collapsed?: boolean }>();
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
</script>

<template>
  <aside class="sidebar" :class="{ collapsed }">
    <button
      class="sidebarToggle"
      type="button"
      :aria-label="collapsed ? '展开侧边栏' : '收起侧边栏'"
      :title="collapsed ? '展开侧边栏' : '收起侧边栏'"
      @click="emit('toggle-collapse')"
    >
      <span class="sidebarToggleIcon" aria-hidden="true">{{ collapsed ? ">" : "<" }}</span>
    </button>
    <template v-if="!collapsed">
      <div class="brand">X Reports</div>
      <details v-for="month in tree" :key="month.month" class="monthGroup" :open="monthHasToday(month.month)">
        <summary class="monthLabel">{{ month.month }}</summary>
        <details
          v-for="day in month.days"
          :key="`${month.month}-${day.day}`"
          class="dayGroup"
          :open="isToday(month.month, day.day)"
        >
          <summary class="dayLabel">{{ day.day }}</summary>
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
              @click="emit('select', report.id)"
            >
              <span class="time">{{ report.time }}</span>
            </button>
          </details>
        </details>
      </details>
    </template>
  </aside>
</template>
