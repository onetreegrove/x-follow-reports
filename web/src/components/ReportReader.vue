<script setup lang="ts">
import MarkdownIt from "markdown-it";
import sanitizeHtml from "sanitize-html";
import { computed } from "vue";
import type { ReportDetail } from "../types/report";

const props = defineProps<{ report?: ReportDetail; loading: boolean; error?: string; emptyMessage?: string }>();
const md = new MarkdownIt({ html: false, linkify: true, typographer: true });

const html = computed(() => {
  if (!props.report) return "";
  return sanitizeHtml(md.render(props.report.markdown), {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["h1", "h2", "h3"]),
    allowedAttributes: {
      a: ["href", "name", "target", "rel"]
    },
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noreferrer" })
    }
  });
});
</script>

<template>
  <main class="reader">
    <div v-if="loading" class="state">正在加载报告...</div>
    <div v-else-if="error" class="state error">{{ error }}</div>
    <div v-else-if="!report" class="state">{{ emptyMessage || "暂无报告" }}</div>
    <article v-else>
      <div class="meta">
        <span>{{ report.generatedAt || report.date }}</span>
        <span>{{ report.kind }}</span>
        <span v-if="report.itemCount">{{ report.itemCount }} 条资讯</span>
      </div>
      <h1>{{ report.title }}</h1>
      <p class="path">{{ report.path }}</p>
      <div class="markdown" v-html="html"></div>
    </article>
  </main>
</template>
