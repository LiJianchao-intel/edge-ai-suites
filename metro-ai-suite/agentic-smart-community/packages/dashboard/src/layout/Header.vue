<!-- SPDX-FileCopyrightText: (C) 2026 Intel Corporation -->
<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <div class="header-wrap">
    <div class="brand-wrap">
      <h1 class="header-title">{{ t("headerTitle") }}</h1>
    </div>
    <a-menu
      mode="horizontal"
      :selected-keys="selectedKeys"
      class="header-nav"
      @click="handleMenuClick"
    >
      <a-menu-item key="/home">
        <span class="nav-item-content">
          <HomeOutlined :style="{ fontSize: '16px' }" />
          <span>{{ t("smartCommunity.monitorWorkspace") }}</span>
        </span>
      </a-menu-item>
      <a-menu-item key="/rag-chat">
        <span class="nav-item-content">
          <SvgIcon name="icon-okf" :size="20" inherit />
          <span>{{ t("smartCommunity.graphWorkspace") }}</span>
        </span>
      </a-menu-item>
    </a-menu>
    <div class="setting-wrap">
      <a-dropdown>
        <div @click.prevent>
          <div class="lang-icon">
            <SvgIcon
              class="iconfont"
              :name="
                currentLanguage === 'en_US' ? 'icon-lan-en1' : 'icon-lang-zh'
              "
              :size="22"
            />
          </div>
        </div>
        <template #overlay>
          <a-menu @click="handleLanguageChange">
            <a-menu-item key="zh_CN" :disabled="currentLanguage === 'zh_CN'"
              >简体中文</a-menu-item
            >
            <a-menu-item key="en_US" :disabled="currentLanguage === 'en_US'"
              >English</a-menu-item
            >
          </a-menu>
        </template>
      </a-dropdown>
      <div class="theme-switch" @click="handleThemeChange">
        <div class="icon-wrap" :class="{ 'slider-on': isDark }">
          <img v-if="!isDark" :src="LightIcon" alt="Sun" class="icon" />
          <img v-else :src="DarkIcon" alt="Moon" class="icon" />
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup name="Header">
import DarkIcon from "@/assets/svgs/dark-icon.svg";
import LightIcon from "@/assets/svgs/light-icon.svg";
import SvgIcon from "@/components/SvgIcon.vue";
import { themeAppStore } from "@/store/theme";
import { HomeOutlined } from "@ant-design/icons-vue";
import type { MenuInfo } from "ant-design-vue/es/menu/src/interface";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";

const { locale, t } = useI18n();
const route = useRoute();
const router = useRouter();
const themeStore = themeAppStore();
const emit = defineEmits(["change-theme"]);
const isDark = ref<boolean>(false);

const currentLanguage = computed(() => locale.value);
const selectedKeys = computed(() => [
  route.path.startsWith("/rag-chat") ? "/rag-chat" : "/home",
]);

const handleMenuClick = ({ key }: MenuInfo) => {
  const nextPath = String(key);

  if (route.path !== nextPath) {
    router.push(nextPath);
  }
};

const handleLanguageChange = ({ key }: MenuInfo) => {
  const nextLanguage = String(key);

  if (nextLanguage === locale.value) {
    return;
  }

  locale.value = nextLanguage;
  themeStore.toggleLanguage(nextLanguage);
  window.location.reload();
};
const handleThemeChange = () => {
  isDark.value = !isDark.value;
  const theme = isDark.value ? "dark" : "light";
  const body = document.documentElement as HTMLElement;
  body.setAttribute("data-theme", theme);
  themeStore.toggleTheme(theme);
};
onMounted(() => {
  isDark.value = themeStore.theme === "dark";
});
</script>

<style scoped lang="less">
@keyframes logoAnimation {
  0% {
    transform: scale(0);
  }
  80% {
    transform: scale(1.2);
  }
  100% {
    transform: scale(1);
  }
}
.header-wrap {
  height: 100%;
  margin: auto;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 22px;
  color: var(--font-main-color);
}

.brand-wrap {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;

  .brand-mark {
    width: 4px;
    height: 24px;
    flex: 0 0 4px;
    border-radius: 2px;
    background: var(--color-primary);
  }

  .header-title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--header-font-family);
    font-size: 20px;
    font-weight: 600;
    line-height: 24px;
  }
}

.header-nav {
  min-width: 0;
  justify-self: center;
  display: flex;
  justify-content: center;
  border-bottom: none;
  background: transparent;
}

.nav-item-content {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

:deep(.header-nav.intel-menu-horizontal) {
  line-height: 56px;
  border-bottom: none;
  background: transparent;
}

:deep(.header-nav .intel-menu-item) {
  padding: 0 22px;
  color: var(--font-text-color);
  font-size: var(--font-size-14);
  font-weight: 600;
}

:deep(.header-nav .intel-menu-item:hover) {
  color: var(--color-primary);
  background: transparent;
}

:deep(.header-nav .intel-menu-item-selected) {
  color: var(--color-primary);
  background: transparent;
  box-shadow: none;
}

:deep(.header-nav.intel-menu-horizontal > .intel-menu-item::after) {
  bottom: 4px;
  border-bottom: 2px solid transparent;
}

:deep(.header-nav.intel-menu-horizontal > .intel-menu-item-selected::after) {
  border-bottom-color: var(--color-primary);
}
.theme-switch {
  position: relative;
  width: 44px;
  height: 24px;
  border: 1px solid var(--border-main-color);
  border-radius: 12px;
  background-color: var(--surface-card-bg-strong);
  cursor: pointer;
  overflow: hidden;
}

.icon-wrap {
  position: absolute;
  top: 0;
  left: 0;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  transition: transform 0.3s ease;
}

.slider-on {
  transform: translateX(20px);
}

.icon {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 18px;
  height: 18px;
  transition: opacity 0.3s ease;
}
.setting-wrap {
  .flex-end;
  justify-self: end;
  gap: 14px;
  .lang-icon {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    cursor: pointer;
    color: var(--font-tip-color);
    border-radius: 6px;
    transition:
      color 0.18s ease,
      background 0.18s ease;

    &:hover {
      color: var(--color-primary);
      background: var(--surface-card-bg-hover);
    }

    &:hover i {
      display: inline-block;
      animation: logoAnimation 0.3s ease-in-out;
    }
  }
}

@media (max-width: 960px) {
  .header-wrap {
    gap: 12px;
  }

  .brand-wrap .header-title {
    font-size: 17px;
  }

  :deep(.header-nav .intel-menu-item) {
    padding: 0 12px;
  }
}
</style>
