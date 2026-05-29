<script setup lang="ts">
interface Heading {
  id: string;
  text: string;
  level: number;
}

defineProps<{
  headings: Heading[];
  activeId?: string;
}>();

const emit = defineEmits<{
  select: [id: string];
}>();
</script>

<template>
  <nav class="tocColumn" aria-label="目录">
    <div class="tocTitle">目录</div>
    <ul v-if="headings.length > 0" class="tocList">
      <li v-for="item in headings" :key="item.id" class="tocItem">
        <a
          :href="`#${item.id}`"
          class="tocLink"
          :class="{
            active: item.id === activeId,
            h2: item.level === 2,
            h3: item.level === 3
          }"
          @click.prevent="emit('select', item.id)"
        >
          {{ item.text }}
        </a>
      </li>
    </ul>
    <div v-else class="sidebarState" style="padding: 0; text-align: left;">
      暂无章节
    </div>
  </nav>
</template>
