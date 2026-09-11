<template>
  <a-popover v-model:open="open" trigger="click" placement="bottomRight">
    <template #content>
      <div class="session-popover">
        <div class="session-popover-title">{{ $t("chat.history") }}</div>
        <div class="session-popover-list">
          <template v-if="sessionList.length">
            <div
              v-for="session in sessionList"
              :key="session.id"
              :class="[
                'session-popover-item',
                { selected: selectedSessionId === session.id },
              ]"
              @click="handleSelect(session)"
            >
              <div class="session-popover-main">
                <MessageOutlined />
                <span :title="session.name">{{ session.name }}</span>
              </div>
              <a-button
                v-if="false"
                type="text"
                size="small"
                class="session-delete-btn"
                @click.stop="handleDelete(session)"
              >
                <DeleteFilled />
              </a-button>
            </div>
          </template>
          <a-empty v-else :description="$t('chat.noSessions')" :image="false" />
        </div>
      </div>
    </template>

    <a-tooltip :title="$t('chat.history')" placement="left">
      <a-badge :dot="sessionList.length > 0" status="processing">
        <button
          class="session-entry-btn"
          type="button"
          :aria-label="$t('chat.history')"
        >
          <ClockCircleOutlined />
        </button>
      </a-badge>
    </a-tooltip>
  </a-popover>
</template>

<script setup lang="ts">
import {
  ClockCircleOutlined,
  DeleteFilled,
  MessageOutlined,
} from "@ant-design/icons-vue";
import { ref } from "vue";

type SessionItem = {
  id: string;
  name: string;
};

defineProps<{
  sessionList: SessionItem[];
  selectedSessionId: string;
}>();

const emit = defineEmits<{
  select: [session: SessionItem];
  delete: [session: SessionItem];
}>();

const open = ref(false);

const handleSelect = (session: SessionItem) => {
  emit("select", session);
  open.value = false;
};

const handleDelete = (session: SessionItem) => {
  emit("delete", session);
};
</script>

<style scoped lang="less">
.session-entry-btn {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid color-mix(in srgb, var(--color-primary) 72%, transparent);
  background: linear-gradient(
    160deg,
    var(--color-primary-second),
    var(--color-primary)
  );
  color: var(--color-white);
  box-shadow: 0 8px 18px
    color-mix(in srgb, var(--color-primary) 36%, transparent);
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    transform: translateY(-1px);
    border-color: var(--color-primary-hover);
    background: linear-gradient(
      160deg,
      var(--color-primary-hover),
      var(--color-primary-second)
    );
    box-shadow: 0 10px 24px
      color-mix(in srgb, var(--color-primary-hover) 42%, transparent);
  }
}

:deep(.ant-badge-status-processing) {
  background-color: var(--color-warning);
  box-shadow: 0 0 0 1px var(--bg-content-color);
}

:deep(.ant-popover-inner) {
  padding: 10px;
  border-radius: 12px;
  background: var(--bg-card-color);
}

.session-popover {
  width: min(360px, 70vw);

  .session-popover-title {
    font-size: var(--font-size-13);
    color: var(--font-tip-color);
    margin-bottom: 8px;
  }

  .session-popover-list {
    max-height: 360px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-right: 2px;
  }

  .session-popover-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px;
    border-radius: 8px;
    border: 1px solid transparent;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
      background: var(--color-second-primaryBg);
    }

    &.selected {
      border-color: color-mix(in srgb, var(--color-primary) 35%, transparent);
      background: color-mix(
        in srgb,
        var(--color-primaryBg) 50%,
        var(--bg-card-color)
      );
    }
  }

  .session-popover-main {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    flex: 1;

    span {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: var(--font-main-color);
      font-size: var(--font-size-13);
    }
  }

  .session-delete-btn {
    color: var(--font-tip-color);
    padding: 0;

    &:hover {
      color: var(--color-error);
    }
  }
}

@media (max-width: 768px) {
  .session-popover {
    width: min(92vw, 360px);
  }
}
</style>
