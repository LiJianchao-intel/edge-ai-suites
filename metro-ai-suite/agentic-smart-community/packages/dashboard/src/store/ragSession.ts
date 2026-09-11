import { defineStore } from "pinia";

export const ragSessionAppStore = defineStore("ragSession", {
  state: () => ({
    responseSession: "",
    currentSession: "",
  }),
  persist: {
    key: "ragSessionInfo",
    storage: sessionStorage,
  },
  actions: {
    setResponseSessionId(sessionId: string) {
      this.responseSession = sessionId;
    },
    setSessionId(sessionId: string) {
      this.currentSession = sessionId;
    },
  },
});

export const getRagChatSessionId = () => {
  const sessionStore = ragSessionAppStore();
  if (sessionStore.currentSession) return sessionStore.currentSession;

  const sessionId = crypto.randomUUID();
  sessionStore.setSessionId(sessionId);
  return sessionId;
};
