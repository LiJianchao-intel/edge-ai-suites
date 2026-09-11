<template>
  <div class="chatbot-wrap" :class="{ 'is-empty': !messagesLength }">
    <div class="chat-topbar">
      <ChatHistoryPanel
        :session-list="sessionList"
        :selected-session-id="selectedSessionId"
        @select="handleSessionClick"
        @delete="handleSessionDelete"
      />
    </div>

    <div class="message-box" ref="scrollContainer" v-if="messagesLength">
      <div class="intel-markdown">
        <div ref="messageComponent">
          <div
            v-for="(msg, index) in messagesList"
            :key="`session-${currentSessionId}-${index}`"
          >
            <MessageItem
              :message-key="`session-${currentSessionId}-${index}`"
              :message="msg"
              :inResponse
              :collapse-think-by-default="index < historyMessageCount"
              :message-Index="index"
              :last-query="isLastQuery(index)"
              :last-response="isLastResponse(index)"
              @preview="handleImagePreview"
              @stop="isUserScrolling = true"
              @regenerate="handleRegenerate"
              @resend="handleDelete"
            />
          </div>
        </div>
      </div>
    </div>
    <div class="initial-input" v-else>
      <div class="text-wrap">{{ $t("chat.tip2") }}</div>
      <div class="tip-wrap">
        <img :src="lightBulb" alt="" />{{ $t("chat.tip3") }}
      </div>
    </div>
    <div class="input-wrap" ref="inputRef">
      <div class="bottom-wrap" v-if="showScrollToBottomBtn">
        <div class="to-bottom" @click="scrollToBottom">
          <ArrowDownOutlined />
        </div>
      </div>
      <a-textarea
        v-model:value.trim="inputKeywords"
        @keydown.enter="handleEnter"
        :placeholder="$t('chat.tip4')"
        :bordered="false"
        :auto-size="{ minRows: 1, maxRows: 4 }"
      />
      <div class="button-wrap">
        <div class="flex-left">
          <span
            :class="{
              'think-btn': true,
              'is-deep': isThink,
              'is-disabled': isAgent,
            }"
            @click="handleThinkChange"
          >
            <SvgIcon name="icon-deep-think" :size="16" inherit />
            {{ $t(`chat.${isThink ? "reason" : "think"}`) }}
          </span>
          <span
            :class="{ 'think-btn': true, 'is-deep': enableKB }"
            @click="handleKBChange"
          >
            <SvgIcon name="icon-kb" :size="16" inherit />
            {{ $t("knowledge.title") }}
          </span>
        </div>

        <div class="send-btn">
          <a-tooltip placement="top" :arrow="false" :title="$t('chat.new')">
            <span class="common-btn">
              <SvgIcon
                name="icon-newChat"
                :size="30"
                :style="{ color: 'var(--color-primary-second)' }"
                @click="handleNewChat"
              />
            </span>
          </a-tooltip>
          <a-tooltip
            placement="top"
            :arrow="false"
            :title="$t('generation.title')"
          >
            <span class="common-btn">
              <SvgIcon
                name="icon-setting1"
                :size="30"
                :style="{ color: 'var(--color-primary-second)' }"
                @click="handleConfig"
              />
            </span>
          </a-tooltip>
          <a-divider type="vertical" />
          <a-button
            v-if="!inResponse"
            type="primary"
            :disabled="inResponse || notInput"
            @click="handleSendMessage"
          >
            <SvgIcon name="icon-send" inherit />
          </a-button>
          <a-button v-else type="primary" @click="handleStopChat">
            <SvgIcon name="icon-stop" inherit />
          </a-button>
        </div>
      </div>
    </div>
  </div>
  <a-image
    :style="{ display: 'none' }"
    :preview="{
      visible: imgVisible,
      onVisibleChange: handleImageVisible,
    }"
    :src="imageSrc"
  />
</template>

<script lang="ts" setup name="Chatbot">
import {
  getHistorySessionList,
  getSessionDetailById,
  requestSessionDelete,
} from "@/api/ragChat";
import lightBulb from "@/assets/svgs/lightBulb.svg";
import router from "@/router";
import { ragChatbotAppStore } from "@/store/ragChatbot";
import { ragSessionAppStore } from "@/store/ragSession";
import emitter from "@/utils/mitt";
import { Local } from "@/utils/storage";
import { ArrowDownOutlined } from "@ant-design/icons-vue";
import { message, Modal } from "ant-design-vue";
import { throttle } from "lodash";
import { computed, nextTick, ref } from "vue";
import { useI18n } from "vue-i18n";
import { IMessage } from "../type";
import ChatHistoryPanel from "./ChatHistoryPanel.vue";
import MessageItem from "./MessageItem.vue";
import { handleMessageSend, StreamController } from "./SseService";

const { t } = useI18n();
const route = useRoute();
const chatbotStore = ragChatbotAppStore();
const sessionStore = ragSessionAppStore();
const emit = defineEmits(["config"]);
const ENV_URL = import.meta.env;

let streamController = ref<StreamController | null>(null);
const messagesList = ref<IMessage[]>([]);
const inputKeywords = ref<string>("");
const scrollContainer = ref<HTMLElement | null>(null);
const messageComponent = ref<HTMLElement | null>(null);
const inResponse = ref<boolean>(false);
const imgVisible = ref<boolean>(false);
const imageSrc = ref<string>("");
const isUserScrolling = ref(false);
const showScrollToBottomBtn = ref(false);
const resizeObserverRef = ref<ResizeObserver | null>(null);
const enableKB = ref<boolean>(true);
const isCreatingNewSession = ref(false);
const shouldIgnoreRouteChange = ref(false);
const sessionList = ref<Array<{ id: string; name: string }>>([]);
const historyMessageCount = ref(0);
let throttledHandleScroll: ReturnType<typeof throttle> | null = null;

const handleEnvUrl = () => ENV_URL.VITE_RAG_CHAT_URL || "/v1/chatqna";

const handleMessageDisplay = (data: any) => {
  if (inResponse.value) {
    isUserScrolling.value = false;
    const regex = /code:0000(.*)/s;
    const match = data.match(regex);
    if (match) {
      messagesList.value.pop();
      messagesList.value[messagesList.value?.length - 1].errorMessage =
        match[1].trim();
      return;
    }

    messagesList.value[messagesList.value?.length - 1].content = data;
  }
};

const notInput = computed(() => {
  return inputKeywords.value.trim() === "";
});

const messagesLength = computed(() => {
  return messagesList.value?.length;
});

const lastQueryIndex = computed(() => {
  for (let i = messagesList.value.length - 1; i >= 0; i--) {
    if (messagesList.value[i].role === "user") {
      return i;
    }
  }
  return -1;
});

const lastResponseIndex = computed(() => {
  for (let i = messagesList.value.length - 1; i >= 0; i--) {
    if (messagesList.value[i].role === "assistant") {
      return i;
    }
  }
  return -1;
});

const isAgent = computed(() => {
  return !!chatbotStore.agent.name;
});

const isThink = computed({
  get() {
    const { enable_thinking = true } =
      chatbotStore.configuration?.chat_template_kwargs;
    return enable_thinking;
  },
  set(value: boolean) {
    chatbotStore.setChatbotConfiguration({
      chat_template_kwargs: {
        ...chatbotStore.configuration?.chat_template_kwargs,
        enable_thinking: value,
      },
    });
  },
});

const isLastQuery = (index: number) => index === lastQueryIndex.value;
const isLastResponse = (index: number) => index === lastResponseIndex.value;

const handleStreamEnd = () => {
  handleStopDisplay();
  updateSessionId();
  sessionStore.setResponseSessionId("");
  querySessionList();
};

const toggleConnection = () => {
  if (inResponse.value) {
    if (streamController.value) {
      streamController.value.cancel();
    }

    streamController.value = handleMessageSend(
      handleEnvUrl(),
      formatFormParam(),
      handleMessageDisplay,
      handleStreamEnd,
    );
  }
};

// Format parameter
const formatFormParam = () => {
  const { configuration = {} } = Local.get("ragChatbotConfiguration") || {};
  return Object.assign({}, configuration, {
    messages: inputKeywords.value,
  });
};

const handleEnter = (e: any) => {
  e.preventDefault();
  if (inResponse.value) {
    return;
  }
  handleSendMessage();
};

const handleSendMessage = async () => {
  if (!inputKeywords.value.trim()) return;

  messagesList.value.push(
    {
      role: "user",
      content: inputKeywords.value,
    },
    {
      role: "assistant",
      content: "",
      query: inputKeywords.value,
    },
  );

  inResponse.value = true;
  toggleConnection();
  emitter.emit("graph-search-start");
  inputKeywords.value = "";
  scrollToBottom();

  const { currentSession = "" } = sessionStore;
  sessionStore.setResponseSessionId(currentSession);
};

const handleStopDisplay = () => {
  inResponse.value = false;
};
const currentSessionId = computed(() => sessionStore.currentSession);
const selectedSessionId = computed(() => {
  const querySession = route.query?.sessionId;
  return querySession ? String(querySession) : "";
});

const querySessionList = async () => {
  try {
    const data: any = await getHistorySessionList();
    sessionList.value = Object.entries(data || {}).map(([id, name]) => ({
      id,
      name: String(name),
    }));
  } catch (error) {
    console.error(error);
  }
};

const handleSessionClick = (session: { id: string; name: string }) => {
  sessionStore.setSessionId(session.id);
  router.replace({
    query: {
      ...route.query,
      sessionId: session.id,
    },
  });
};

const handleSessionDelete = (session: { id: string; name: string }) => {
  Modal.confirm({
    title: t("common.delete"),
    content: t("chat.deleteSessionTip"),
    okText: t("common.confirm"),
    okType: "danger",
    async onOk() {
      await requestSessionDelete(session.id);
      if (selectedSessionId.value === session.id) {
        const nextQuery = { ...route.query };
        delete nextQuery.sessionId;
        sessionStore.setSessionId("");
        router.replace({ query: nextQuery });
      }
      querySessionList();
    },
  });
};

const updateSessionId = () => {
  const sessionId = route.query?.sessionId;
  const storedSessionId = sessionStore.currentSession;

  if (!sessionId && storedSessionId) {
    shouldIgnoreRouteChange.value = true;
    router.replace({
      query: {
        ...route.query,
        sessionId: storedSessionId,
      },
    });
    nextTick(() => {
      setTimeout(() => {
        shouldIgnoreRouteChange.value = false;
      }, 100);
    });
  }
};

const handleImagePreview = (url: string) => {
  imageSrc.value = url;
  handleImageVisible(true);
};

const handleImageVisible = (value: boolean = false) => {
  imgVisible.value = value;
};

const handleNewChat = () => {
  isCreatingNewSession.value = true;
  shouldIgnoreRouteChange.value = true;

  inputKeywords.value = "";
  messagesList.value = [];
  historyMessageCount.value = 0;
  emitter.emit("graph-reset");
  sessionStore.setSessionId("");
  router.replace({
    query: {},
  });
  nextTick(() => {
    setTimeout(() => {
      isCreatingNewSession.value = false;
      shouldIgnoreRouteChange.value = false;
    }, 100);
  });
};

const handleThinkChange = () => {
  if (isAgent.value) return;
  isThink.value = !isThink.value;
};

const handleKBChange = () => {
  enableKB.value = !enableKB.value;
  const { chat_template_kwargs } = chatbotStore.configuration;

  const chat_template = {
    ...chat_template_kwargs,
    enable_rag_retrieval: enableKB.value,
  };

  chatbotStore.setChatbotConfiguration({
    chat_template_kwargs: chat_template,
  });
};

const handleConfig = () => {
  emit("config");
};

const handleRegenerate = (query: string) => {
  inputKeywords.value = query;
  handleSendMessage();
};

const handleDelete = ({ index, query }: { index: number; query: string }) => {
  messagesList.value.splice(index);
  inputKeywords.value = query;
  handleSendMessage();
};

const handleStopChat = async () => {
  if (streamController.value) {
    streamController.value.cancel();
    streamController.value = null;
  }
};

const scrollToBottom = () => {
  if (!scrollContainer.value) return;

  scrollContainer.value?.scrollTo({
    top: scrollContainer.value.scrollHeight,
    behavior: "smooth",
  });
  isUserScrolling.value = false;
  showScrollToBottomBtn.value = false;
};

const handleResize = (entries: ResizeObserverEntry[]) => {
  for (const entry of entries) {
    if (!scrollContainer.value || isUserScrolling.value) return;

    scrollContainer.value?.scrollTo({
      top: entry.contentRect.height,
      behavior: "smooth",
    });
  }
};

const handleScroll = () => {
  const container = scrollContainer.value;
  if (!container) return;
  const distanceToBottom =
    container.scrollHeight - container.scrollTop - container.clientHeight;
  if (distanceToBottom > 80) {
    isUserScrolling.value = true;
    showScrollToBottomBtn.value = true;
    if (resizeObserverRef.value) resizeObserverRef.value.disconnect();
  } else {
    isUserScrolling.value = false;
    showScrollToBottomBtn.value = false;
    if (messageComponent.value && resizeObserverRef.value)
      resizeObserverRef.value.observe(messageComponent.value);
  }
};

const initResizeObserver = () => {
  if (messageComponent.value) {
    if (resizeObserverRef.value) {
      resizeObserverRef.value.disconnect();
    }

    resizeObserverRef.value = new ResizeObserver(handleResize);
    resizeObserverRef.value.observe(messageComponent.value);

    if (throttledHandleScroll) {
      scrollContainer.value?.removeEventListener(
        "scroll",
        throttledHandleScroll,
      );
    }
    throttledHandleScroll = throttle(handleScroll, 100);

    scrollContainer.value?.addEventListener("scroll", throttledHandleScroll);
  }
};

const initialSessionDetail = (messages: IMessage[]): IMessage[] => {
  return messages?.map((msg, i, arr) => {
    if (msg.role === "assistant" && i > 0 && arr[i - 1].role === "user") {
      return {
        ...msg,
        query: arr[i - 1].content,
      };
    }
    return msg;
  });
};

const handleViewSessionDetail = async (sessionId: string) => {
  try {
    const data: any = await getSessionDetailById(sessionId);
    if (!data?.session_content?.messages) {
      handleNewChat();
      message.error(t("chat.notExist"));
      return;
    }
    messagesList.value = initialSessionDetail(data?.session_content?.messages);
    historyMessageCount.value = messagesList.value.length;
    nextTick(() => {
      scrollToBottom();
    });
  } catch (error) {
    console.error(error);
  }
};

watch(
  () => messageComponent.value,
  (value) => {
    if (value) {
      nextTick(() => {
        initResizeObserver();
      });
    }
  },
  { immediate: true },
);

watch(
  () => route.query?.sessionId,
  (sessionId) => {
    if (shouldIgnoreRouteChange.value || isCreatingNewSession.value) {
      shouldIgnoreRouteChange.value = false;
      return;
    }

    if (sessionId) {
      const sessionIdStr = String(sessionId);
      handleViewSessionDetail(sessionIdStr);
      if (sessionId !== sessionStore.responseSession) {
        inResponse.value = false;
      } else {
        inResponse.value = true;
      }

      const isExist = sessionList.value.some(
        (item) => item.id === sessionIdStr,
      );
      if (!isExist) {
        querySessionList();
      }
    } else {
      messagesList.value = [];
      historyMessageCount.value = 0;
    }
  },
  { immediate: true },
);

onMounted(() => {
  const { enable_thinking = true, enable_rag_retrieval = false } =
    chatbotStore.configuration?.chat_template_kwargs;
  isThink.value = enable_thinking;
  enableKB.value = enable_rag_retrieval;
  emitter.on("new-chat", handleNewChat);
  if (!route.query?.sessionId) {
    sessionStore.setSessionId("");
  }
  querySessionList();
});

onBeforeUnmount(() => {
  if (resizeObserverRef.value) {
    resizeObserverRef.value.disconnect();
    resizeObserverRef.value = null;
  }
  if (throttledHandleScroll) {
    scrollContainer.value?.removeEventListener("scroll", throttledHandleScroll);
    throttledHandleScroll.cancel();
    throttledHandleScroll = null;
  }
});

onUnmounted(() => {
  emitter.off("new-chat", handleNewChat);
  sessionStore.setSessionId("");
});
</script>

<style scoped lang="less">
.chatbot-wrap {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  height: 100%;

  .chat-topbar {
    position: absolute;
    top: 10px;
    right: 14px;
    z-index: 12;
  }

  .initial-input {
    text-align: center;
    max-width: 720px;
    margin: 0 auto;
    padding: 24px;
    border-radius: 16px;
    background: color-mix(in srgb, var(--bg-card-color) 85%, transparent);

    .title-wrap {
      font-size: 28px;
      line-height: 36px;
      color: var(--font-main-color);
    }

    .text-wrap {
      font-size: 22px;
      font-weight: 600;
      color: var(--font-main-color);
    }

    .tip-wrap {
      font-size: var(--font-size-13);
      color: var(--font-tip-color);
      margin-top: 18px;
      .vertical-center;
      gap: 6px;

      img {
        margin-right: 4px;
      }
    }
  }

  .message-box {
    flex: 1;
    width: 100%;
    overflow-y: auto;
    position: relative;
    display: flex;
    justify-content: center;

    .intel-markdown {
      width: min(75%, 960px);
      box-sizing: border-box;
      position: relative;
      transition: all 0.2s;
      // height: 100%;
      min-height: 0;
      padding: 24px 0;
    }
  }

  .input-wrap {
    padding: 8px;
    margin: 24px 0;
    border: 1px solid var(--color-primary);
    border-radius: 16px;
    background-color: var(--input-bg);
    min-width: 500px;
    transition: all 0.2s;
    width: min(75%, 960px);
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 6px;
    position: relative;
    text-align: center;
    box-shadow: 0 10px 24px
      color-mix(in srgb, var(--bg-box-shadow) 60%, transparent);

    &:hover {
      box-shadow: 0 4px 12px var(--bg-primary-shadow);
      border: 1px solid var(--color-primary-hover);
    }
    .bottom-wrap {
      position: absolute;
      top: -40px;
      width: 100%;
      height: 32px;
      .vertical-center;
      .to-bottom {
        .vertical-center;
        width: 32px;
        height: 32px;
        cursor: pointer;
        z-index: 20;
        border-radius: 50%;
        background-color: var(--bg-card-color);
        border: 1px solid var(--border-main-color);
        box-shadow: 0px 2px 4px 0px var(--bg-box-shadow);
        &:hover {
          background-color: var(--color-second-primaryBg);
          border: 1px solid var(--color-primary-second);
          .anticon-arrow-down {
            color: var(--color-primary-second);
          }
        }
      }
    }

    textarea {
      resize: none;
    }

    .button-wrap {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 4px 10px;
      .flex-left {
        gap: 8px;
      }
      .think-btn {
        height: 24px;
        line-height: 24px;
        padding: 0 8px;
        border: 1px solid var(--border-main-color);
        color: var(--font-text-color);
        cursor: pointer;
        border-radius: 12px;
        font-size: var(--font-size-12);
        .mt-12;
        .vertical-center;
        gap: 4px;
        &:hover {
          border: 1px solid var(--color-primary-second);
          color: var(--color-primary-second);
          background-color: var(--color-primaryBg);
        }
        &.is-deep {
          border: 1px solid var(--color-primary-second);
          color: var(--color-primary-second);
          background-color: var(--color-primaryBg);
        }
        &.is-disabled,
        .is-disabled:hover {
          border: 1px solid var(--border-main-color);
          color: var(--font-text-color);
          background-color: var(--bg-main-color);
          cursor: no-drop;
        }
      }
      .send-btn {
        display: flex;

        .common-btn {
          width: 32px;
          height: 32px;
          margin-left: 6px;
          cursor: pointer;
          border-radius: 8px;
          background: color-mix(
            in srgb,
            var(--color-primaryBg) 55%,
            var(--bg-card-color)
          );
          border: 1px solid
            color-mix(
              in srgb,
              var(--color-primary-second) 48%,
              var(--border-main-color)
            );
          .vertical-center;
          transition: all 0.2s ease;

          .icon-intel {
            color: var(--color-primary-second) !important;
          }

          &:hover .icon-intel {
            color: var(--color-primary-hover) !important;
          }

          &:hover {
            background: color-mix(
              in srgb,
              var(--color-primaryBg) 78%,
              var(--bg-card-color)
            );
            border-color: var(--color-primary-hover);
          }
        }

        .icon-send {
          &:hover {
            color: var(--color-white);
          }
        }

        .intel-divider-vertical {
          height: 24px;
          margin: 0 10px 0 6px;
          top: 4px;
        }

        .intel-btn,
        .ant-btn {
          width: 32px;
          height: 32px;
          padding: 0;
          .vertical-center;

          .icon-intel {
            position: relative;
            top: 1px;
            font-size: var(--font-size-14);
          }
        }
      }

      .intel-btn-primary:disabled {
        background-color: var(--color-info);

        .icon-intel {
          color: var(--color-white) !important;
        }
      }
    }
  }

  &.is-empty {
    justify-content: center;

    .initial-input {
      margin-bottom: 14px;
    }

    .input-wrap {
      margin: 0;
    }
  }

  .error-tip {
    border: 1px solid var(--border-warning);
    background-color: var(--color-warningBg);
    color: var(--color-second-warning);
    padding: 8px 12px;
    border-radius: 0 4px 4px 0;
    margin-bottom: 12px;
    font-size: var(--font-size-12);
    .flex-between;
    &:hover {
      .card-shadow;
    }
    .message-wrap {
      flex: 1;
    }
    .close-btn {
      cursor: pointer;
      text-align: end;
      &:hover {
        color: var(--color-error);
      }
    }
  }

  @media (max-width: 768px) {
    .chat-topbar {
      top: 8px;
      right: 8px;
    }

    .input-wrap,
    .message-box .intel-markdown {
      width: 100%;
      min-width: 0;
      max-width: none;
      margin-left: 0;
      margin-right: 0;
    }
  }
}
</style>
