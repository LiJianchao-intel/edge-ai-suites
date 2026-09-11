// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

export interface IMessage {
  role: string;
  content: string;
  query?: string;
  errorMessage?: string;
}

export interface ThinkType {
  enable_thinking?: boolean;
  enable_rag_retrieval?: boolean;
}

export interface ConfigType {
  top_n: number;
  k: number;
  temperature: number;
  top_p: number;
  top_k: number;
  repetition_penalty: number;
  max_tokens: number;
  stream: boolean;
  chat_template_kwargs?: ThinkType;
}
export interface KnowledgeGraphNode {
  id: string;
  name: string;
  okf_file_path?: string;
  label?: string;
  tags?: string[];
  degree?: number;
  properties?: Record<string, unknown>;
  type?: string;
  level?: number;
}

export interface KnowledgeGraphEdge {
  id?: string;
  source: string;
  target: string;
  label?: string;
  type?: string;
  rank?: number;
  properties?: Record<string, unknown>;
}

export interface KnowledgeGraphData {
  space?: string;
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  node_count?: number;
  edge_count?: number;
}

export interface RetrieveTraceItem {
  id: string;
  name: string;
  score: number;
  hop?: number;
  coreach?: number;
  is_bridge?: boolean;
}

export interface RetrieveTracePhase {
  label: string;
  items: RetrieveTraceItem[];
}

export interface RetrieveTraceNodeReference {
  id: string;
  name?: string;
  score?: number;
}

export interface RetrieveTraceData {
  epoch: number;
  query: string;
  isComplete: boolean;
  reranked_nodes?: RetrieveTraceNodeReference[];
  phases: Record<string, RetrieveTracePhase> & {
    seeder: RetrieveTracePhase;
    score: RetrieveTracePhase;
    result: RetrieveTracePhase;
  };
  error: string | null;
}
