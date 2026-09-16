<template>
  <div ref="graphPanel" class="graph-panel">
    <header class="graph-header">
      <div>
        <h3>{{ t("graph.title") }}</h3>
        <p>{{ statusText }}</p>
      </div>
      <div class="graph-actions">
        <a-tooltip
          :title="
            isFullscreen ? t('graph.exitFullscreen') : t('graph.fullscreen')
          "
        >
          <a-button
            class="icon-button"
            :aria-label="
              isFullscreen ? t('graph.exitFullscreen') : t('graph.fullscreen')
            "
            @click="toggleFullscreen"
          >
            <FullscreenExitOutlined v-if="isFullscreen" />
            <FullscreenOutlined v-else />
          </a-button>
        </a-tooltip>
        <a-tooltip :title="t('graph.resetGraph')">
          <a-button
            class="icon-button"
            :aria-label="t('graph.resetGraph')"
            :disabled="isLoading"
            @click="resetGraph"
          >
            <ReloadOutlined />
          </a-button>
        </a-tooltip>
      </div>
    </header>

    <div
      class="progress-track"
      :class="{ searching: isRetrieving, complete: isComplete }"
      aria-hidden="true"
    >
      <span></span>
    </div>

    <div class="graph-stage">
      <div ref="graphContainer" class="graph-canvas"></div>
      <div v-if="isLoading" class="graph-overlay">
        <a-spin size="small" />
        <span>{{ t("graph.loadingGraph") }}</span>
      </div>
      <div v-else-if="errorMessage" class="graph-overlay graph-error">
        <span>{{ errorMessage }}</span>
        <a-button size="small" @click="initializeGraph">
          {{ t("common.retry") }}
        </a-button>
      </div>
      <div
        v-if="traceLegendLayers.length || hasFinalResult"
        class="graph-legend"
      >
        <span v-for="layer in traceLegendLayers" :key="layer.key">
          <i class="layer-dot" :style="getLayerLegendStyle(layer.level)"></i>
          {{ getTraceLegendLabel(layer) }}
        </span>
        <span v-if="hasFinalResult"
          ><i class="result-dot"></i>{{ t("graph.finalResult") }}</span
        >
      </div>
      <div
        v-if="!isLoading && activeKnowledgeBaseName"
        class="graph-interaction-tip"
      >
        <InfoCircleOutlined />
        <span>{{ t("graph.nodeClickTip") }}</span>
      </div>
    </div>

    <a-drawer
      v-model:open="previewState.visible"
      :title="previewState.nodeName || t('graph.knowledgeNodePreview')"
      :get-container="false"
      destroyOnClose
      width="min(520px, 92vw)"
      @close="closeNodePreview"
    >
      <div v-if="previewState.loading" class="preview-state">
        <a-spin size="small" />
        <span>{{ t("graph.loadingKnowledgeNode") }}</span>
      </div>
      <div v-else-if="previewState.error" class="preview-state preview-error">
        <span>{{ previewState.error }}</span>
        <a-button size="small" @click="retryNodePreview">
          {{ t("common.retry") }}
        </a-button>
      </div>
      <a-empty
        v-else-if="!renderedNodeMarkdown"
        :description="t('graph.knowledgeNodeEmpty')"
      />
      <article
        v-else
        class="node-markdown intel-markdown"
        v-html="renderedNodeMarkdown"
      ></article>
    </a-drawer>
  </div>
</template>

<script setup lang="ts" name="Graph">
import {
  getKnowledgeBaseList,
  getOKFContent,
  getFullGraph,
  getRetrieveTrace,
} from "@/api/ragChat";
import {
  type KnowledgeGraphData,
  type KnowledgeGraphNode,
  type RetrieveTraceData,
  type RetrieveTracePhase,
} from "../type";
import emitter from "@/utils/mitt";
import * as G6 from "@antv/g6";
import type { Graph as G6Graph } from "@antv/g6";
import {
  FullscreenExitOutlined,
  FullscreenOutlined,
  InfoCircleOutlined,
  ReloadOutlined,
} from "@ant-design/icons-vue";
import { marked } from "marked";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
} from "vue";
import { useI18n } from "vue-i18n";

type TraceLayer = {
  key: string;
  label: string;
  level: number;
  phase: RetrieveTracePhase;
};

const graphContainer = ref<HTMLDivElement | null>(null);
const graphPanel = ref<HTMLDivElement | null>(null);
const { t } = useI18n();
const isLoading = ref(true);
const isRetrieving = ref(false);
const isComplete = ref(false);
const errorMessage = ref("");
const matchedNodeCount = ref(0);
const isFullscreen = ref(false);
const traceLegendLayers = ref<TraceLayer[]>([]);
const hasFinalResult = ref(false);
const activeKnowledgeBaseName = ref("");
const previewFilePath = ref("");
const previewState = reactive({
  visible: false,
  loading: false,
  error: "",
  nodeName: "",
  markdown: "",
});

let graph: G6Graph | null = null;
let graphData: KnowledgeGraphData | null = null;
let resizeObserver: ResizeObserver | null = null;
let themeObserver: MutationObserver | null = null;
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let runToken = 0;
let previewRequestToken = 0;
let animatedTraceToken = 0;
let shouldStartAfterLoading = false;
const hiddenRootId = "seeder";
const graphFitPadding = 42;
const labelLineLength = 7;
const pollInterval = 1000;
const traceLayerRenderDelay = 180;
const defaultNodeSize = 58;
const resultNodeSize = 72;
const scoreNodeSizes = [42, 50, defaultNodeSize, 66, 74] as const;
const scoreShapeName = "node-score";
const graphLayoutConfig = {
  type: "gForce" as const,
  preventOverlap: true,
  linkDistance: 135,
  nodeStrength: 1000,
  edgeStrength: 120,
  nodeSize: 58,
  nodeSpacing: 18,
  maxIteration: 320,
  minMovement: 0.8,
  animate: false,
};
const hopLayerColors = [
  { fill: "--graph-hop-1-fill", stroke: "--graph-hop-1-stroke" },
  { fill: "--graph-hop-2-fill", stroke: "--graph-hop-2-stroke" },
  { fill: "--graph-hop-3-fill", stroke: "--graph-hop-3-stroke" },
  { fill: "--graph-hop-4-fill", stroke: "--graph-hop-4-stroke" },
] as const;

const getThemeColor = (variable: string) =>
  getComputedStyle(document.body).getPropertyValue(variable).trim();

const getBaseNodeColor = () => ({
  fill: getThemeColor("--surface-card-bg"),
  stroke: getThemeColor("--border-info"),
});

const getResultColor = () => ({
  fill: getThemeColor("--graph-result-fill"),
  stroke: getThemeColor("--graph-result-stroke"),
  shadow: getThemeColor("--graph-result-shadow"),
});

const parseHexColor = (color: string) => {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(color.trim());
  if (!match) return null;
  const [, red, green, blue] = match;
  return {
    red: parseInt(red, 16),
    green: parseInt(green, 16),
    blue: parseInt(blue, 16),
  };
};

const mixWithWhite = (color: string, weight = 0.46) => {
  const rgb = parseHexColor(color);
  if (!rgb) return color;
  const mix = (channel: number) =>
    Math.round(channel + (255 - channel) * weight)
      .toString(16)
      .padStart(2, "0");
  return `#${mix(rgb.red)}${mix(rgb.green)}${mix(rgb.blue)}`;
};

const getRadialNodeFill = (color: string) =>
  `r(0.5, 0.38, 0.72) 0:${mixWithWhite(color)} 0.72:${color} 1:${color}`;

const getSoftEdgeColor = (color: string) => {
  const normalizedColor = color.trim();
  const rgb = parseHexColor(normalizedColor);
  if (!rgb) return normalizedColor;
  return `rgba(${rgb.red}, ${rgb.green}, ${rgb.blue}, 0.68)`;
};

const getTraceEdgeColor = (
  targetModel: { traceLevel?: number; isTraceResult?: boolean },
  fallbackLevel: number,
) => {
  if (targetModel.isTraceResult) {
    return getSoftEdgeColor(getResultColor().stroke);
  }
  return getSoftEdgeColor(
    getLayerColor(targetModel.traceLevel || fallbackLevel).stroke,
  );
};

const getLayerColor = (level: number) => {
  if (level === 1) {
    return {
      fill: getThemeColor("--graph-seed-fill"),
      stroke: getThemeColor("--graph-seed-stroke"),
    };
  }
  const preset = hopLayerColors[Math.min(level - 2, hopLayerColors.length - 1)];
  return {
    fill: getThemeColor(preset.fill),
    stroke: getThemeColor(preset.stroke),
  };
};

const getLayerLegendStyle = (level: number) => {
  if (level === 1) {
    return {
      "--legend-fill": "var(--graph-seed-fill)",
      "--legend-stroke": "var(--graph-seed-stroke)",
    };
  }
  const preset = hopLayerColors[Math.min(level - 2, hopLayerColors.length - 1)];
  return {
    "--legend-fill": `var(${preset.fill})`,
    "--legend-stroke": `var(${preset.stroke})`,
  };
};

const getTraceLegendLabel = (layer: TraceLayer) =>
  layer.key === "seeder"
    ? t("graph.seedNode")
    : t("graph.hopLayer", { hop: Number(layer.key.slice(4)) });

const getNodeSize = (score?: number) => {
  if (score === undefined || !Number.isFinite(score)) return defaultNodeSize;
  const scoreLevel = Math.min(Math.max(Math.floor(score), 0), 4);
  return scoreNodeSizes[scoreLevel];
};

const renderedNodeMarkdown = computed(() => {
  if (!previewState.markdown) return "";
  return marked(previewState.markdown, {
    breaks: true,
    gfm: true,
  });
});

const getNodeFilePath = (node: KnowledgeGraphNode) => {
  const path = node?.okf_file_path;
  return typeof path === "string" ? path.trim() : "";
};

const normalizeTracePhase = (
  phase: any,
  fallbackLabel: string,
): RetrieveTracePhase => {
  return {
    label: typeof phase?.label === "string" ? phase.label : fallbackLabel,
    items: Array.isArray(phase?.items) ? phase.items : [],
  };
};

const normalizeTracePhases = (phases: any): RetrieveTraceData["phases"] => {
  const source = phases && typeof phases === "object" ? phases : {};
  return {
    ...source,
    seeder: normalizeTracePhase(source.seeder, "seeder"),
    score: normalizeTracePhase(source.score, "score"),
    result: normalizeTracePhase(source.result, "result"),
  };
};

const waitTraceRender = (duration: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, duration);
  });

const loadNodePreview = async (node: KnowledgeGraphNode) => {
  const filePath = getNodeFilePath(node);
  if (!filePath) return;

  const token = ++previewRequestToken;
  previewState.visible = true;
  previewState.loading = true;
  previewState.error = "";
  previewState.markdown = "";
  previewState.nodeName = getNodeDisplayName(node);
  previewFilePath.value = filePath;

  if (!activeKnowledgeBaseName.value) {
    previewState.loading = false;
    previewState.error = t("graph.noActiveKnowledgeBase");
    return;
  }

  try {
    const data: any = await getOKFContent(
      activeKnowledgeBaseName.value,
      filePath,
    );
    if (token !== previewRequestToken) return;
    previewState.markdown =
      typeof data === "string"
        ? data
        : (data?.content ?? data?.data?.content ?? "");
  } catch (error) {
    if (token !== previewRequestToken) return;
    console.error("Failed to load knowledge node", error);
    previewState.error = t("graph.knowledgeNodeLoadFailed");
  } finally {
    if (token === previewRequestToken) previewState.loading = false;
  }
};

const retryNodePreview = () => {
  if (!previewFilePath.value) return;
  loadNodePreview({
    id: "preview-retry",
    name: previewState.nodeName,
    okf_file_path: previewFilePath.value,
  });
};

const closeNodePreview = () => {
  previewRequestToken += 1;
  previewState.visible = false;
  previewState.loading = false;
  previewFilePath.value = "";
};

const formatScoreLabel = (score: number) => {
  const scoreText = String(score);
  const [, decimalPart = ""] = scoreText.split(".");
  return decimalPart.length > 3 ? score.toFixed(3) : scoreText;
};

const updateNodeScoreShape = (model: any, group: any) => {
  if (!group) return;
  const scoreShape = group.find(
    (shape: any) => shape.get("name") === scoreShapeName,
  );
  if (typeof model?.score !== "number" || !Number.isFinite(model.score)) {
    scoreShape?.hide();
    return;
  }

  const hasSecondLabelLine = String(model.label || "").includes("\n");
  const attributes = {
    x: 0,
    y: hasSecondLabelLine ? 13 : 9,
    text: formatScoreLabel(model.score),
    fill: getThemeColor("--graph-score-text"),
    fontSize: 9,
    fontWeight: 400,
    textAlign: "center",
    textBaseline: "middle",
  };

  if (scoreShape) {
    scoreShape.attr(attributes);
    scoreShape.show();
    return;
  }
  group.addShape("text", {
    attrs: attributes,
    name: scoreShapeName,
  });
};

G6.registerNode(
  "score-circle",
  {
    afterDraw(model, group) {
      updateNodeScoreShape(model, group);
    },
    afterUpdate(model, item) {
      if (!item) return;
      updateNodeScoreShape(model, item.getContainer());
    },
  },
  "circle",
);

const refreshGraphTheme = () => {
  if (!graph) return;
  const baseNodeColor = getBaseNodeColor();
  const resultColor = getResultColor();
  const baseEdgeColor = getThemeColor("--graph-background-edge");

  graph.getNodes().forEach((node) => {
    const model = node.getModel() as unknown as KnowledgeGraphNode & {
      traceLevel?: number;
      isTraceResult?: boolean;
    };
    const layerColor =
      model.traceLevel === undefined
        ? baseNodeColor
        : getLayerColor(model.traceLevel);
    const isBaseNode = model.traceLevel === undefined && !model.isTraceResult;
    graph?.updateItem(node, {
      style: {
        fill: model.isTraceResult
          ? getRadialNodeFill(resultColor.fill)
          : model.traceLevel
            ? getRadialNodeFill(layerColor.fill)
            : layerColor.fill,
        stroke: isBaseNode ? baseNodeColor.stroke : "transparent",
        lineWidth: isBaseNode ? 1.6 : 0,
        shadowColor:
          model.traceLevel === undefined
            ? model.isTraceResult
              ? resultColor.shadow
              : "transparent"
            : model.isTraceResult
              ? resultColor.shadow
              : layerColor.stroke,
        shadowBlur: model.isTraceResult ? 16 : model.traceLevel ? 7 : 0,
      },
      labelCfg: {
        style: {
          fill: getThemeColor("--font-text-color"),
        },
      },
    });
  });

  graph.getEdges().forEach((edge) => {
    const sourceModel = edge.getSource().getModel() as unknown as {
      id: string;
      traceLevel?: number;
    };
    const targetModel = edge.getTarget().getModel() as unknown as {
      traceLevel?: number;
      isTraceResult?: boolean;
    };
    const isTraceEdge =
      sourceModel.traceLevel !== undefined &&
      targetModel.traceLevel !== undefined &&
      Math.abs(sourceModel.traceLevel - targetModel.traceLevel) === 1;
    const edgeColor = isTraceEdge
      ? getTraceEdgeColor(targetModel, sourceModel.traceLevel || 1)
      : baseEdgeColor;
    graph?.updateItem(edge, {
      style: {
        stroke: edgeColor,
        lineWidth: isTraceEdge ? 1.8 : 1.1,
        opacity: isTraceEdge ? 1 : 0.58,
        endArrow: {
          path: G6.Arrow.triangle(7, 9, 2),
          fill: edgeColor,
        },
      },
    });
  });
};

const statusText = computed(() => {
  if (isLoading.value) return t("graph.statusLoading");
  if (errorMessage.value) return t("graph.statusFailed");
  if (isComplete.value)
    return t("graph.statusComplete", { count: matchedNodeCount.value });
  if (isRetrieving.value) return t("graph.statusRetrieving");
  return t("graph.statusReady");
});

const getNodeDisplayName = (node: KnowledgeGraphNode) => {
  const content = node.properties?._node_content;
  if (typeof content === "string") {
    try {
      const parsed = JSON.parse(content) as { title?: string };
      if (parsed.title) return parsed.title;
    } catch {
      // Use the graph node name when legacy content is not valid JSON.
    }
  }
  return node.name.split("/").at(-1) || node.name;
};

const formatNodeLabel = (name: string) => {
  const normalizedName = name.trim();
  const firstLine = normalizedName.slice(0, labelLineLength);
  const remainingName = normalizedName.slice(labelLineLength);
  const secondLine = remainingName
    ? `${remainingName.slice(0, labelLineLength - 1)}${remainingName.length >= labelLineLength ? "…" : ""}`
    : "";
  return secondLine ? `${firstLine}\n${secondLine}` : firstLine;
};

const findTraceNode = (item: { id: string }) => {
  return graph?.findById(item.id);
};

const resizeFullscreenGraph = async () => {
  isFullscreen.value = document.fullscreenElement === graphPanel.value;
  await nextTick();
  window.requestAnimationFrame(() => {
    if (!graph || !graphContainer.value) return;
    graph.changeSize(
      graphContainer.value.clientWidth,
      graphContainer.value.clientHeight,
    );
    graph.fitView(graphFitPadding);
  });
};

const toggleFullscreen = async () => {
  if (!graphPanel.value) return;
  if (document.fullscreenElement === graphPanel.value) {
    await document.exitFullscreen();
    return;
  }
  await graphPanel.value.requestFullscreen();
};

const getTraceLayers = (
  phases: Record<string, RetrieveTracePhase>,
): TraceLayer[] => {
  const hopLayers = Object.entries(phases)
    .filter(([key]) => /^hop_\d+$/.test(key))
    .sort(([left], [right]) => Number(left.slice(4)) - Number(right.slice(4)))
    .map(([key, phase], index) => ({
      key,
      label: t("graph.hopLayer", { hop: index + 1 }),
      level: index + 2,
      phase,
    }));

  if (phases.seeder.items.length === 0 && hopLayers.length === 0) {
    return [];
  }

  return [
    {
      key: "seeder",
      label: t("graph.seedNode"),
      level: 1,
      phase: phases.seeder,
    },
    ...hopLayers,
  ];
};

const clearPollTimer = () => {
  if (!pollTimer) return;
  clearTimeout(pollTimer);
  pollTimer = null;
};

const resetGraphStates = () => {
  if (!graph) return;
  const baseNodeColor = getBaseNodeColor();
  const baseEdgeColor = getThemeColor("--graph-background-edge");

  graph.getNodes().forEach((node) => {
    graph?.clearItemStates(node);
    const model = node.getModel() as unknown as KnowledgeGraphNode;
    graph?.updateItem(node, {
      score: undefined,
      traceLayerLabel: undefined,
      traceLevel: undefined,
      isTraceResult: false,
      size: defaultNodeSize,
      label: formatNodeLabel(getNodeDisplayName(model)),
      style: {
        fill: baseNodeColor.fill,
        stroke: baseNodeColor.stroke,
        lineWidth: 1.6,
        shadowColor: "transparent",
        shadowBlur: 0,
      },
      labelCfg: {
        style: {
          fill: getThemeColor("--font-text-color"),
        },
      },
    });
  });
  graph.getEdges().forEach((edge) => {
    graph?.updateItem(edge, {
      style: {
        stroke: baseEdgeColor,
        lineWidth: 1.3,
        opacity: 1,
        endArrow: {
          path: G6.Arrow.triangle(7, 9, 2),
          fill: baseEdgeColor,
        },
      },
    });
  });
};

const applyRetrieveTrace = async (trace: RetrieveTraceData, token: number) => {
  if (!graph) return;

  const phases = normalizeTracePhases(trace.phases);
  const layers = getTraceLayers(phases);
  const resultColor = getResultColor();
  const layerById = new Map<string, TraceLayer>();
  const scoreByNodeId = new Map<string, number>();
  const selectedNodeIds = new Set<string>();
  const rerankedNodes = Array.isArray(trace.reranked_nodes)
    ? trace.reranked_nodes
    : [];

  phases.score.items.forEach((item) => {
    const node = findTraceNode(item);
    if (node) scoreByNodeId.set(node.getID(), item.score);
  });
  const shouldAnimate = animatedTraceToken !== token;
  if (shouldAnimate) {
    animatedTraceToken = token;
  }

  for (const [index, layer] of layers.entries()) {
    if (token !== runToken) return;
    layer.phase.items.forEach((item) => {
      const node = findTraceNode(item);
      if (!node) return;
      layerById.set(node.getID(), layer);
      selectedNodeIds.add(node.getID());
      const color = getLayerColor(layer.level);
      graph?.updateItem(node, {
        traceLayerLabel: layer.label,
        traceLevel: layer.level,
        isTraceResult: false,
        label: formatNodeLabel(item.name),
        style: {
          fill: getRadialNodeFill(color.fill),
          stroke: "transparent",
          lineWidth: 0,
          shadowColor: color.stroke,
          shadowBlur: 7,
        },
        labelCfg: {
          style: {
            fill: getThemeColor("--font-main-color"),
          },
        },
      });
      graph?.setItemState(node, "result", false);
    });

    if (shouldAnimate && index < layers.length - 1) {
      await waitTraceRender(traceLayerRenderDelay);
      if (token !== runToken) return;
    }
  }

  phases.score.items.forEach((item) => {
    const node = findTraceNode(item);
    if (!node) return;
    selectedNodeIds.add(node.getID());
    graph?.updateItem(node, {
      score: item.score,
      size: getNodeSize(item.score),
      label: formatNodeLabel(item.name),
    });
  });

  hasFinalResult.value = false;
  rerankedNodes.forEach((item) => {
    const node = findTraceNode(item);
    if (!node) return;
    selectedNodeIds.add(node.getID());
    hasFinalResult.value = true;
    const score =
      typeof item.score === "number" && Number.isFinite(item.score)
        ? item.score
        : scoreByNodeId.get(node.getID());
    graph?.updateItem(node, {
      score,
      traceLayerLabel: t("graph.finalResult"),
      isTraceResult: true,
      size: resultNodeSize,
      label: formatNodeLabel(
        item.name ||
          getNodeDisplayName(node.getModel() as unknown as KnowledgeGraphNode),
      ),
      style: {
        fill: getRadialNodeFill(resultColor.fill),
        stroke: "transparent",
        lineWidth: 0,
        shadowColor: resultColor.shadow,
        shadowBlur: 18,
      },
      labelCfg: {
        style: {
          fill: getThemeColor("--font-main-color"),
        },
      },
    });
    graph?.setItemState(node, "result", false);
  });

  graph.getEdges().forEach((edge) => {
    const sourceId = edge.getSource().getID();
    const targetId = edge.getTarget().getID();
    const targetLayer = layerById.get(targetId);
    const sourceLayer = layerById.get(sourceId);
    const isAdjacentLayer =
      sourceLayer &&
      targetLayer &&
      Math.abs(sourceLayer.level - targetLayer.level) === 1;
    const isTraceEdge = Boolean(isAdjacentLayer);
    const targetModel = edge.getTarget().getModel() as unknown as {
      traceLevel?: number;
      isTraceResult?: boolean;
    };
    const color = isTraceEdge
      ? getTraceEdgeColor(targetModel, sourceLayer?.level || 1)
      : getThemeColor("--graph-background-edge");
    graph?.updateItem(edge, {
      style: {
        stroke: color,
        lineWidth: isTraceEdge ? 1.8 : 1.1,
        opacity: isTraceEdge ? 1 : 0.58,
        endArrow: {
          path: G6.Arrow.triangle(7, 9, 2),
          fill: color,
        },
      },
    });
  });

  matchedNodeCount.value = selectedNodeIds.size;
  isComplete.value = trace.isComplete;
  traceLegendLayers.value = layers;
  graph.fitView(graphFitPadding);
};

const createGraph = () => {
  if (!graphContainer.value || !graphData) return;
  let renderedWidth = graphContainer.value.clientWidth;
  let renderedHeight = graphContainer.value.clientHeight;
  const baseNodeColor = getBaseNodeColor();
  const baseEdgeColor = getThemeColor("--graph-background-edge");

  const tooltip = new G6.Tooltip({
    offsetX: 12,
    offsetY: 12,
    itemTypes: ["node"],
    getContent: (event) => {
      const model = event?.item?.getModel() as unknown as KnowledgeGraphNode;
      const content = document.createElement("div");
      content.className = "knowledge-graph-tooltip";
      content.textContent = model.name;
      return content;
    },
  });

  graph = new G6.Graph({
    container: graphContainer.value,
    width: renderedWidth,
    height: renderedHeight,
    fitView: true,
    fitViewPadding: graphFitPadding,
    animate: true,
    animateCfg: {
      duration: 650,
      easing: "easeCubic",
    },
    plugins: [tooltip],
    modes: { default: ["drag-canvas", "zoom-canvas"] },
    layout: graphLayoutConfig,
    defaultNode: {
      type: "score-circle",
      size: defaultNodeSize,
      style: {
        fill: baseNodeColor.fill,
        stroke: baseNodeColor.stroke,
        lineWidth: 1.6,
      },
      labelCfg: {
        style: {
          fill: getThemeColor("--font-text-color"),
          fontSize: 8,
          fontWeight: 400,
          lineHeight: 9,
          textAlign: "center",
        },
      },
    },
    defaultEdge: {
      type: "line",
      style: {
        stroke: baseEdgeColor,
        lineWidth: 1.3,
        endArrow: {
          path: G6.Arrow.triangle(7, 9, 2),
          fill: baseEdgeColor,
        },
      },
    },
  });

  graph.data({
    nodes: graphData.nodes
      .filter((node) => node.id !== hiddenRootId)
      .map((node) => ({
        ...node,
        label: formatNodeLabel(getNodeDisplayName(node)),
        size: defaultNodeSize,
      })),
    edges: graphData.edges
      .filter(
        (edge) => edge.source !== hiddenRootId && edge.target !== hiddenRootId,
      )
      .map((edge, index) => ({
        ...edge,
        id: edge.id || `${edge.source}-${edge.target}-${index}`,
      })),
  });
  graph.render();

  graph.on("node:click", (event) => {
    const model = event.item?.getModel() as unknown as KnowledgeGraphNode;
    if (model) loadNodePreview(model);
  });
  graph.on("node:mouseenter", () => {
    if (graphContainer.value) graphContainer.value.style.cursor = "pointer";
  });
  graph.on("node:mousedown", () => {
    if (graphContainer.value) graphContainer.value.style.cursor = "pointer";
  });
  graph.on("node:mouseleave", () => {
    if (graphContainer.value) graphContainer.value.style.cursor = "default";
  });

  resizeObserver = new ResizeObserver(() => {
    if (!graph || graph.get("destroyed") || !graphContainer.value) return;
    const width = graphContainer.value.clientWidth;
    const height = graphContainer.value.clientHeight;
    if (
      !width ||
      !height ||
      (width === renderedWidth && height === renderedHeight)
    ) {
      return;
    }
    renderedWidth = width;
    renderedHeight = height;
    graph.changeSize(width, height);
    graph.fitView(graphFitPadding);
  });
  resizeObserver.observe(graphContainer.value);
};

const pollRetrieveTrace = async (token: number) => {
  try {
    const response: any = await getRetrieveTrace();
    if (token !== runToken) return;
    if (response.error) throw new Error(response.error);

    await applyRetrieveTrace(response, token);
    if (token !== runToken) return;
    if (response.isComplete) {
      isRetrieving.value = false;
      clearPollTimer();
      return;
    }
    pollTimer = setTimeout(() => pollRetrieveTrace(token), pollInterval);
  } catch {
    if (token !== runToken) return;
    isRetrieving.value = false;
    clearPollTimer();
    errorMessage.value = t("graph.traceFailed");
  }
};

const startRetrieveTrace = () => {
  if (isLoading.value || !graph) {
    shouldStartAfterLoading = true;
    return;
  }

  shouldStartAfterLoading = false;
  const token = ++runToken;
  clearPollTimer();
  resetGraphStates();
  isRetrieving.value = true;
  isComplete.value = false;
  errorMessage.value = "";
  matchedNodeCount.value = 0;
  traceLegendLayers.value = [];
  hasFinalResult.value = false;
  pollRetrieveTrace(token);
};

const resetGraph = () => {
  if (isLoading.value || !graph) return;

  shouldStartAfterLoading = false;
  runToken += 1;
  clearPollTimer();
  isRetrieving.value = false;
  isComplete.value = false;
  errorMessage.value = "";
  matchedNodeCount.value = 0;
  traceLegendLayers.value = [];
  hasFinalResult.value = false;
  resetGraphStates();

  graph.updateLayout(graphLayoutConfig);
  graph.layout();
  graph.fitView(graphFitPadding);
};

const queryActiveKnowledgeBase = async () => {
  try {
    const knowledgeBases: any = await getKnowledgeBaseList();
    const kb = knowledgeBases.find(
      (item: any) =>
        item.active &&
        ["fusion_indexer", "graph_indexer"].includes(
          item.indexer?.indexer_type,
        ),
    );
    activeKnowledgeBaseName.value = kb?.name;
  } catch (error) {
    console.error("Failed to load active knowledge base", error);
    activeKnowledgeBaseName.value = "";
  }
};

const initializeGraph = async () => {
  isLoading.value = true;
  errorMessage.value = "";
  try {
    const response: any = await getFullGraph();
    graphData = response;
    isLoading.value = false;
    await nextTick();
    createGraph();
    if (shouldStartAfterLoading) startRetrieveTrace();
  } catch (error) {
    console.error("Failed to initialize knowledge graph", error);
    isLoading.value = false;
    errorMessage.value = t("graph.initializeFailed");
  }
};

onMounted(async () => {
  emitter.on("graph-search-start", startRetrieveTrace);
  emitter.on("graph-reset", resetGraph);
  document.addEventListener("fullscreenchange", resizeFullscreenGraph);
  themeObserver = new MutationObserver(refreshGraphTheme);
  themeObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  await queryActiveKnowledgeBase();
  initializeGraph();
});

onBeforeUnmount(() => {
  emitter.off("graph-search-start", startRetrieveTrace);
  emitter.off("graph-reset", resetGraph);
  document.removeEventListener("fullscreenchange", resizeFullscreenGraph);
  runToken += 1;
  previewRequestToken += 1;
  clearPollTimer();
  resizeObserver?.disconnect();
  themeObserver?.disconnect();
  graph?.destroy();
  graph = null;
});
</script>

<style scoped lang="less">
.graph-panel {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  border-radius: 8px;
  border: 1px solid var(--border-main-color);
  background: var(--bg-card-color);
  box-shadow: 0 8px 24px var(--bg-box-shadow);
  overflow: hidden;

  &:fullscreen {
    width: 100vw;
    height: 100vh;
    border: 0;
    border-radius: 0;
    background: var(--surface-panel-bg);
  }
}

.preview-state {
  min-height: 240px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 12px;
  color: var(--font-tip-color);
  text-align: center;
}

.preview-error {
  color: var(--color-error);
}

.node-markdown {
  color: var(--font-main-color);
}

.graph-header {
  min-height: 68px;
  padding: 12px 14px 9px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;

  h3 {
    margin: 0;
    color: var(--font-main-color);
    font-size: var(--font-size-15);
    font-weight: 650;
  }

  p {
    margin: 3px 0 0;
    color: var(--font-tip-color);
    font-size: var(--font-size-11);
  }
}

.graph-actions {
  display: flex;
  gap: 6px;
}

.icon-button {
  width: 30px;
  height: 30px;
  padding: 0;
  display: inline-grid;
  place-items: center;
}

.progress-track {
  position: relative;
  height: 3px;
  flex: 0 0 3px;
  overflow: hidden;
  background: color-mix(in srgb, var(--border-main-color) 65%, transparent);

  span {
    display: block;
    width: 0;
    height: 100%;
    background: var(--color-multicolored-5);
    transition: width 0.35s ease;
  }

  &.searching span {
    position: absolute;
    width: 32%;
    animation: search-progress 1.35s ease-in-out infinite;
  }

  &.complete span {
    width: 100%;
  }
}

@keyframes search-progress {
  from {
    transform: translateX(-110%);
  }
  to {
    transform: translateX(330%);
  }
}

.graph-stage {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background-color: var(--surface-panel-bg);
  background-image: radial-gradient(
    var(--border-info) 0.7px,
    transparent 0.7px
  );
  background-size: 17px 17px;
}

.graph-canvas {
  width: 100%;
  height: 100%;
}

.graph-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 10px;
  color: var(--font-tip-color);
  font-size: var(--font-size-12);
  background: color-mix(in srgb, var(--bg-card-color) 88%, transparent);
  z-index: 3;
}

.graph-error {
  color: var(--color-error);
}

.graph-legend {
  position: absolute;
  left: 10px;
  bottom: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 7px 10px;
  border: 1px solid
    color-mix(in srgb, var(--border-main-color) 75%, transparent);
  border-radius: 6px;
  color: var(--font-tip-color);
  background: color-mix(in srgb, var(--bg-card-color) 92%, transparent);
  font-size: var(--font-size-11);
  pointer-events: none;

  span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  i {
    width: 10px;
    height: 10px;
    box-sizing: border-box;
    border-radius: 3px;
  }
}

.graph-interaction-tip {
  position: absolute;
  right: 12px;
  bottom: 12px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--font-tip-color);
  font-size: var(--font-size-11);
  pointer-events: none;

  :deep(.anticon) {
    color: var(--color-primary-tip);
    font-size: var(--font-size-12);
  }
}

.layer-dot {
  border: 0;
  background: var(--legend-fill);
  box-shadow: 0 0 0 2px
    color-mix(in srgb, var(--legend-stroke) 22%, transparent);
}
.result-dot {
  border: 0;
  background: var(--graph-result-fill);
  box-shadow: 0 0 0 2px var(--graph-result-shadow);
}

:global(.knowledge-graph-tooltip) {
  display: inline-block;
  width: fit-content;
  max-height: min(240px, calc(100vh - 48px));
  max-width: min(240px, calc(100vw - 32px));
  padding: 8px 10px;
  overflow: auto;
  color: var(--font-main-color);
  line-height: 1.45;
  font-size: var(--font-size-11);
  border: 1px solid
    color-mix(in srgb, var(--border-main-color) 78%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--bg-card-color) 96%, transparent);
  box-shadow: 0 8px 24px var(--bg-box-shadow);
  overflow-wrap: anywhere;
}

:global(.g6-component-tooltip) {
  width: max-content;
  max-width: min(240px, calc(100vw - 32px));
  padding: 0 !important;
  border: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  pointer-events: none;
}
</style>
