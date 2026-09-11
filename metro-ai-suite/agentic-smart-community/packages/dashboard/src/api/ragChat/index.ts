import request from "../request";

export const getHistorySessionList = () => {
  return request({
    url: "/v1/sessions",
    method: "get",
  });
};

export const getSessionDetailById = (SessionId: String) => {
  return request({
    url: `v1/session/${SessionId}`,
    method: "get",
  });
};

export const requestSessionDelete = (SessionId: String) => {
  return request({
    url: `/v1/session/${SessionId}`,
    method: "delete",
    showLoading: true,
    showSuccessMsg: true,
    successMsg: "request.session.deleteSucc",
  });
};

export const getKnowledgeBaseList = () => {
  return request({
    url: "/v1/knowledge",
    method: "get",
  });
};

export const getOKFDirectory = (kbName: string) => {
  return request({
    url: `/v1/${kbName}/okf/`,
    method: "get",
    showLoading: true,
  });
};

export const getOKFContent = (kbName: string, filePath: string) => {
  return request({
    url: `/v1/okf/${kbName}`,
    method: "get",
    params: {
      file_path: filePath,
    },
  });
};

export const getFullGraph = () => {
  return request({
    url: "/v1/graph/ut_hsgm_container/overview",
    method: "get",
  });
};

export const getRetrieveTrace = () => {
  return request({
    url: "/v1/graph_retrieve/trace",
    method: "get",
  });
};
