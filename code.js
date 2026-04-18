const UI_SIZE = { width: 320, height: 438 };
const SLOT_WIDTH = 402;
const SLOT_HEIGHT = 874;

figma.showUI(__html__, {
  width: UI_SIZE.width,
  height: UI_SIZE.height,
  themeColors: true,
});

function isExportableNode(node) {
  if (!node || !node.visible) {
    return false;
  }

  return (
    typeof node.exportAsync === "function" &&
    "width" in node &&
    "height" in node
  );
}

function getSelectedNodes() {
  return figma.currentPage.selection.filter(isExportableNode);
}

function sanitizeName(name, fallback) {
  const safe = (name || fallback || "export")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return safe || fallback || "export";
}

async function exportNode(node, multiplier) {
  const width = typeof node.width === "number" ? node.width : SLOT_WIDTH;
  const height = typeof node.height === "number" ? node.height : SLOT_HEIGHT;
  const coverScale = Math.max(SLOT_WIDTH / width, SLOT_HEIGHT / height);
  const bytes = await node.exportAsync({
    format: "PNG",
    constraint: {
      type: "SCALE",
      value: Math.max(0.1, coverScale * multiplier),
    },
  });

  return {
    id: node.id,
    name: sanitizeName(node.name, "frame"),
    width,
    height,
    bytes: Array.from(bytes),
  };
}

async function sendSelectionState() {
  const nodes = getSelectedNodes();
  const message = {
    type: "SELECTION_STATE",
    count: nodes.length,
  };

  if (nodes.length > 0) {
    const node = nodes[0];
    const width = typeof node.width === "number" ? node.width : SLOT_WIDTH;
    const height = typeof node.height === "number" ? node.height : SLOT_HEIGHT;

    if (width !== SLOT_WIDTH || height !== SLOT_HEIGHT) {
      message.dimensionWarning = `Frame is ${width}x${height}, expected ${SLOT_WIDTH}x${SLOT_HEIGHT}`;
    }

    try {
      message.preview = await exportNode(node, 0.45);
    } catch (error) {
      message.previewError =
        error instanceof Error ? error.message : String(error);
    }
  }

  figma.ui.postMessage(message);
}

figma.on("selectionchange", () => {
  sendSelectionState().catch(() => {});
});

figma.ui.onmessage = async (msg) => {
  if (!msg || typeof msg !== "object") {
    return;
  }

  if (msg.type === "EXPORT") {
    const nodes = getSelectedNodes();

    if (nodes.length === 0) {
      figma.ui.postMessage({
        type: "EXPORT_ERROR",
        message: "Select at least one frame.",
      });
      return;
    }

    const multiplier = Number(msg.multiplier) || 1;

    try {
      const items = [];

      for (const node of nodes) {
        items.push(await exportNode(node, multiplier));
      }

      figma.ui.postMessage({
        type: "EXPORT_RESULT",
        items,
      });
    } catch (error) {
      figma.ui.postMessage({
        type: "EXPORT_ERROR",
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  if (msg.type === "RESIZE_UI") {
    const width = Math.max(
      280,
      Math.min(420, Number(msg.width) || UI_SIZE.width),
    );
    const height = Math.max(
      360,
      Math.min(640, Number(msg.height) || UI_SIZE.height),
    );
    figma.ui.resize(width, height);
    return;
  }

  if (msg.type === "CLOSE") {
    figma.closePlugin();
  }
};

sendSelectionState().catch(() => {});
