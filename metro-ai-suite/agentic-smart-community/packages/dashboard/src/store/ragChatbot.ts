import { defineStore } from "pinia";

const initialState = {
  agent: {
    name: "",
    type: "",
    index: 0,
  },
  sessionId: "",
  configuration: {
    top_n: 30,
    k: 200,
    temperature: 0.01,
    top_p: 0.95,
    top_k: 10,
    repetition_penalty: 1.03,
    max_tokens: 2048,
    stream: true,
    chat_template_kwargs: {
      enable_thinking: false,
      enable_rag_retrieval: true,
    },
  },
};

export const ragChatbotAppStore = defineStore("ragChatbot", {
  state: () => initialState,
  persist: {
    key: "ragChatbotConfiguration",
    storage: localStorage,
  },
  actions: {
    setChatbotConfiguration(configuration: EmptyObjectType) {
      this.configuration = { ...this.configuration, ...configuration };
    },
    setAgent(agent: EmptyObjectType) {
      this.agent = { ...this.agent, ...agent };
    },
    setSessionId(id: string) {
      this.sessionId = id;
    },
  },
});
