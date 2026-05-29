<script setup lang="ts">
import MarkdownIt from "markdown-it";
import sanitizeHtml from "sanitize-html";
import { computed, nextTick, ref, watch } from "vue";
import type { ReportDetail } from "../types/report";
import ReportToc from "./ReportToc.vue";

const props = defineProps<{
  report?: ReportDetail;
  loading: boolean;
  error?: string;
  emptyMessage?: string;
  hasPrev?: boolean;
  hasNext?: boolean;
}>();

const emit = defineEmits<{
  prev: [];
  next: [];
}>();

const md = new MarkdownIt({ html: false, linkify: true, typographer: true });

const html = computed(() => {
  if (!props.report) return "";
  return sanitizeHtml(md.render(props.report.markdown), {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["h1", "h2", "h3", "img"]),
    allowedAttributes: {
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt", "title", "loading"]
    },
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noreferrer" }),
      img: (tagName, attribs) => {
        return {
          tagName: "img",
          attribs: {
            ...attribs,
            loading: "lazy"
          }
        };
      }
    }
  });
});

// Table of Contents & Reading Progress
const headings = ref<{ id: string; text: string; level: number }[]>([]);
const activeHeadingId = ref<string>("");
const readingProgress = ref(0);
const hasHeadings = computed(() => headings.value.length > 0);

// Reset and extract headings when HTML changes
watch(html, () => {
  headings.value = [];
  activeHeadingId.value = "";
  readingProgress.value = 0;

  if (!props.report) return;

  nextTick(() => {
    const articleEl = document.querySelector(".markdown");
    if (!articleEl) return;

    // Reset container scroll to top on content change
    const readerEl = document.querySelector(".reader");
    if (readerEl) readerEl.scrollTop = 0;

    const headingEls = articleEl.querySelectorAll("h2, h3");
    const list: { id: string; text: string; level: number }[] = [];
    headingEls.forEach((el, index) => {
      const id = `heading-${index}`;
      el.id = id;
      list.push({
        id,
        text: el.textContent || "",
        level: el.tagName.toLowerCase() === "h2" ? 2 : 3
      });
    });
    headings.value = list;
    if (list.length > 0) activeHeadingId.value = list[0].id;
  });
});

function handleScroll(e: Event) {
  const container = e.target as HTMLElement;
  const scrollTop = container.scrollTop;
  const scrollHeight = container.scrollHeight;
  const clientHeight = container.clientHeight;
  const totalScroll = scrollHeight - clientHeight;

  if (totalScroll > 0) {
    readingProgress.value = Math.min(100, Math.max(0, (scrollTop / totalScroll) * 100));
  } else {
    readingProgress.value = 0;
  }

  const headingElements = container.querySelectorAll("h2[id], h3[id]");
  let currentActiveId = "";
  const containerTop = container.getBoundingClientRect().top;

  for (const el of headingElements) {
    const rect = el.getBoundingClientRect();
    if (rect.top - containerTop <= 120) {
      currentActiveId = el.id;
    } else {
      break;
    }
  }

  if (currentActiveId) {
    activeHeadingId.value = currentActiveId;
  } else if (headingElements.length > 0) {
    activeHeadingId.value = headingElements[0].id;
  }
}

function scrollToHeading(id: string) {
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    activeHeadingId.value = id;
  }
}
</script>

<template>
  <div class="readerColumns" :class="{ noToc: !hasHeadings }">
    <!-- Reading Progress Bar -->
    <div class="readingProgressContainer">
      <div class="readingProgressBar" :style="{ width: readingProgress + '%' }"></div>
    </div>

    <!-- Main Content Reader -->
    <main class="reader" @scroll="handleScroll">
      <div v-if="loading" class="state">
        <article style="border: none; box-shadow: none;">
          <div class="skeleton skeletonMeta" style="width: 150px; height: 16px;"></div>
          <div class="skeleton skeletonTitle" style="width: 70%; height: 32px; margin-bottom: 24px;"></div>
          <div class="skeleton skeletonMeta" style="width: 250px; height: 12px; margin-bottom: 40px;"></div>
          <div class="skeleton skeletonText" style="width: 100%; height: 16px;"></div>
          <div class="skeleton skeletonText" style="width: 95%; height: 16px;"></div>
          <div class="skeleton skeletonText" style="width: 98%; height: 16px;"></div>
          <div class="skeleton skeletonText short" style="width: 60%; height: 16px; margin-bottom: 30px;"></div>
          <div class="skeleton skeletonText" style="width: 92%; height: 16px;"></div>
          <div class="skeleton skeletonText" style="width: 96%; height: 16px;"></div>
          <div class="skeleton skeletonText short" style="width: 40%; height: 16px;"></div>
        </article>
      </div>

      <div v-else-if="error" class="state error">
        <div class="stateIcon">⚠️</div>
        <div class="stateTitle">加载出错</div>
        <div class="stateDesc">{{ error }}</div>
      </div>

      <div v-else-if="!report" class="state">
        <div class="stateIcon">📰</div>
        <div class="stateTitle">暂无报告</div>
        <div class="stateDesc">{{ emptyMessage || "请从左侧选择一份报告进行阅读" }}</div>
      </div>

      <Transition v-else name="fade" mode="out-in">
        <article>
          <header>
            <div class="meta">
              <span class="metaItem">
                <svg class="btnIcon" style="width: 14px; height: 14px;" viewBox="0 0 24 24">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
                {{ report.generatedAt || report.date }}
              </span>
              <span class="metaDot"></span>
              <span class="metaItem">
                <svg class="btnIcon" style="width: 14px; height: 14px;" viewBox="0 0 24 24">
                  <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                  <path d="M2 17l10 5 10-5"></path>
                  <path d="M2 12l10 5 10-5"></path>
                </svg>
                {{ report.kind }}
              </span>
              <span v-if="report.itemCount" class="metaDot"></span>
              <span v-if="report.itemCount" class="metaItem">
                <svg class="btnIcon" style="width: 14px; height: 14px;" viewBox="0 0 24 24">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
                {{ report.itemCount }} 条资讯
              </span>
            </div>
            <h1 class="reportTitle">{{ report.title }}</h1>
            <p class="path">{{ report.path }}</p>
          </header>

          <div class="markdown" v-html="html"></div>

          <!-- Report Prev / Next Navigation -->
          <footer class="reportNav">
            <button
              class="reportNavBtn"
              :class="{ disabled: !hasPrev }"
              :disabled="!hasPrev"
              type="button"
              title="上一篇报告"
              @click="emit('prev')"
            >
              <svg class="btnIcon" viewBox="0 0 24 24">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
              <span>上一篇</span>
            </button>
            <button
              class="reportNavBtn"
              :class="{ disabled: !hasNext }"
              :disabled="!hasNext"
              type="button"
              title="下一篇报告"
              @click="emit('next')"
            >
              <span>下一篇</span>
              <svg class="btnIcon" viewBox="0 0 24 24">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </button>
          </footer>
        </article>
      </Transition>
    </main>

    <!-- Table of Contents Sidebar -->
    <ReportToc v-if="hasHeadings" :headings="headings" :active-id="activeHeadingId" @select="scrollToHeading" />
  </div>
</template>
