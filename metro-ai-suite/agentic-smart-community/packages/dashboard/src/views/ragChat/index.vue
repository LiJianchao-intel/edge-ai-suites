<template>
  <div class="rag-layout-shell">
    <div class="rag-layout">
      <div class="layout-panel center-panel rag-graph-panel">
        <RagGraph />
      </div>
      <div class="layout-panel right-panel rag-chat-panel">
        <RagChatqna />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { RagChatqna, RagGraph } from "./components";
</script>

<style scoped lang="less">
.rag-layout-shell {
  width: 100%;
  height: 100%;
  min-width: 900px;
  padding: 12px;
  overflow-x: auto;
  overflow-y: hidden;
  background: var(--surface-app-bg);
}

.rag-layout {
  height: 100%;
  min-width: 876px;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 4fr) minmax(0, 3fr);
  gap: 12px;
}

.layout-panel {
  min-width: 0;
  min-height: 0;
  height: 100%;
}

.right-panel {
  overflow: hidden;
  border: 1px solid var(--border-primary);
  background: var(--surface-panel-bg);
}

.rag-graph-panel,
.rag-chat-panel {
  border-radius: 12px;
}
</style>