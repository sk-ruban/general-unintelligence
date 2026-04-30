"use client";

import { BatteryCharging, Dam, Factory, House, SunMedium, Wind } from "lucide-react";
import { useMemo, useState } from "react";
import {
  GRID_MAP_SATELLITE_URL,
  SATELLITE_ASPECT_HEIGHT,
  SATELLITE_ASPECT_WIDTH,
  SATELLITE_BOUNDS,
} from "@/lib/grid-map";
import type { GridFlow, GridFlowKind, GridNode } from "@/lib/portfolio";

type GridFlowMapProps = {
  flows: GridFlow[];
  nodes: GridNode[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
};

type MapLayer = "imports" | "batteries" | "renewables" | "thermal" | "load";
type ProjectedGridNode = GridNode & { visible: boolean; x: number; y: number };

const MAP_LAYERS: Array<{ id: MapLayer; label: string }> = [
  { id: "imports", label: "Imports" },
  { id: "batteries", label: "Batteries" },
  { id: "renewables", label: "Renewables" },
  { id: "thermal", label: "Thermal" },
  { id: "load", label: "Connections" },
];

export function GridFlowMap({ flows, nodes, selectedNodeId, onSelectNode }: GridFlowMapProps) {
  const [enabledLayers, setEnabledLayers] = useState<Record<MapLayer, boolean>>({
    batteries: true,
    imports: true,
    load: true,
    renewables: true,
    thermal: true,
  });
  const projectedNodes = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        ...projectToSatellite(node.longitude, node.latitude),
      })),
    [nodes],
  );
  const visibleAssetNodes = useMemo(
    () =>
      projectedNodes.filter((node) => node.visible && node.kind !== "hub" && enabledLayers[nodeLayer(node)]),
    [enabledLayers, projectedNodes],
  );
  const projectedNodeById = useMemo(
    () => new Map(projectedNodes.map((node) => [node.id, node])),
    [projectedNodes],
  );
  const projectedFlows = useMemo(
    () => buildProjectedFlows(flows, projectedNodeById, enabledLayers),
    [enabledLayers, flows, projectedNodeById],
  );

  return (
    <div className="relative min-h-[620px] overflow-hidden bg-[#030405]">
      <div className="absolute inset-0" style={{ containerType: "size" }}>
        <div
          className="absolute top-1/2 left-1/2 overflow-hidden -translate-x-1/2 -translate-y-1/2"
          style={{
            height: `max(100cqh, calc(100cqw * ${SATELLITE_ASPECT_HEIGHT} / ${SATELLITE_ASPECT_WIDTH}))`,
            width: `max(100cqw, calc(100cqh * ${SATELLITE_ASPECT_WIDTH} / ${SATELLITE_ASPECT_HEIGHT}))`,
          }}
        >
          <div
            className="absolute inset-0 bg-center bg-no-repeat opacity-70 saturate-[0.7] contrast-125"
            style={{ backgroundImage: `url("${GRID_MAP_SATELLITE_URL}")`, backgroundSize: "100% 100%" }}
          />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(3,4,5,0.2),rgba(3,4,5,0.28)),radial-gradient(circle_at_50%_45%,transparent_0,transparent_58%,rgba(5,5,6,0.22)_82%,rgba(5,5,6,0.62)_100%)]" />
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full"
            preserveAspectRatio="none"
            viewBox="0 0 100 100"
          >
            {projectedFlows.map((flow) => (
              <line
                key={`${flow.id}-glow`}
                stroke={flowColor(flow.kind, flow.fromKind)}
                strokeLinecap="round"
                strokeOpacity="0.24"
                strokeWidth={Math.max(0.75, flow.width + 0.65)}
                x1={flow.x1}
                x2={flow.x2}
                y1={flow.y1}
                y2={flow.y2}
              />
            ))}
            {projectedFlows.map((flow) => (
              <line
                key={flow.id}
                stroke={flowColor(flow.kind, flow.fromKind)}
                strokeLinecap="round"
                strokeOpacity="0.52"
                strokeWidth={Math.max(0.2, flow.width * 0.82)}
                x1={flow.x1}
                x2={flow.x2}
                y1={flow.y1}
                y2={flow.y2}
              />
            ))}
            {projectedFlows.map((flow) => (
              <g key={`${flow.id}-pulse`}>
                <line
                  stroke={flowColor(flow.kind, flow.fromKind)}
                  strokeDasharray="2.6 7.2"
                  strokeLinecap="round"
                  strokeOpacity="0.92"
                  strokeWidth={Math.max(0.44, flow.width * 1.2)}
                  x1={flow.x1}
                  x2={flow.x2}
                  y1={flow.y1}
                  y2={flow.y2}
                >
                  <animate
                    attributeName="stroke-dashoffset"
                    dur={`${flowDuration(flow.mw)}s`}
                    from="0"
                    repeatCount="indefinite"
                    to="-9.8"
                  />
                </line>
              </g>
            ))}
          </svg>
          <div className="absolute inset-0">
            {visibleAssetNodes.map((node) => (
              <button
                key={node.id}
                className={`absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center bg-black/80 text-[8px] shadow-[0_0_20px_rgba(0,0,0,0.72)] hover:scale-110 ${nodeSizeClass(node)} ${nodeToneClass(
                  node,
                  node.id === selectedNodeId,
                )}`}
                style={{ left: `${node.x}%`, top: `${node.y}%` }}
                title={`${node.name} · ${node.detail}`}
                type="button"
                onClick={() => onSelectNode(node.id)}
              >
                <NodeGlyph node={node} />
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="absolute top-3 left-3 flex flex-wrap gap-1 border border-white/10 bg-black/70 p-1">
        {MAP_LAYERS.map((layer) => (
          <button
            key={layer.id}
            className={`h-7 px-2 text-[10px] uppercase tracking-[0.05em] ${
              enabledLayers[layer.id]
                ? "bg-cyan-300/15 text-[var(--cyan)]"
                : "text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-100"
            }`}
            type="button"
            aria-pressed={enabledLayers[layer.id]}
            onClick={() => {
              setEnabledLayers((current) => ({
                ...current,
                [layer.id]: !current[layer.id],
              }));
            }}
          >
            {layer.label}
          </button>
        ))}
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3 grid grid-cols-2 gap-x-4 gap-y-1 border border-white/10 bg-black/70 p-2 text-[9px] text-zinc-500 uppercase">
        <LegendItem color="#fde047" label="solar" />
        <LegendItem color="#34d399" label="wind" />
        <LegendItem color="#7dd3fc" label="hydro" />
        <LegendItem color="#67e8f9" label="batteries" />
        <LegendItem color="#a78bfa" label="imports" />
        <LegendItem color="#f87171" label="thermal" />
      </div>
    </div>
  );
}

function NodeGlyph({ node }: { node: GridNode }) {
  if (node.kind === "import") {
    return <span className="text-[15px] leading-none">{importFlag(node.region)}</span>;
  }
  if (node.kind === "battery") return <BatteryCharging className="h-4 w-4" strokeWidth={1.8} />;
  if (node.kind === "wind") return <Wind className="h-4 w-4" strokeWidth={1.8} />;
  if (node.kind === "solar") return <SunMedium className="h-4 w-4" strokeWidth={1.8} />;
  if (node.kind === "hydro") return <Dam className="h-4 w-4" strokeWidth={1.8} />;
  if (node.kind === "gas" || node.kind === "lignite") {
    return <Factory className="h-4 w-4" strokeWidth={1.8} />;
  }
  if (node.kind === "load") return <House className="h-4 w-4" strokeWidth={1.8} />;
  return null;
}

function importFlag(region: string) {
  if (region === "AL-GR") return "🇦🇱";
  if (region === "IT-GR") return "🇮🇹";
  if (region === "TR-GR") return "🇹🇷";
  if (region === "GR-BG") return "🇧🇬";
  if (region === "GR-MK") return "🇲🇰";
  return "⚡";
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
      <span className="h-2 w-5" style={{ backgroundColor: color }} />
      {label}
    </div>
  );
}

function mercatorY(latitude: number) {
  const radians = (latitude * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + radians / 2));
}

function projectToSatellite(longitude: number, latitude: number) {
  const x = ((longitude - SATELLITE_BOUNDS.west) / (SATELLITE_BOUNDS.east - SATELLITE_BOUNDS.west)) * 100;
  const northY = mercatorY(SATELLITE_BOUNDS.north);
  const southY = mercatorY(SATELLITE_BOUNDS.south);
  const yValue = mercatorY(latitude);
  const y = ((northY - yValue) / (northY - southY)) * 100;

  return {
    visible: x >= 0 && x <= 100 && y >= 0 && y <= 100,
    x,
    y,
  };
}

function buildProjectedFlows(
  flows: GridFlow[],
  nodeById: Map<string, ProjectedGridNode>,
  enabledLayers: Record<MapLayer, boolean>,
) {
  return flows.flatMap((flow) => {
    const from = nodeById.get(flow.fromNodeId);
    const to = nodeById.get(flow.toNodeId);
    if (!from || !to || !from.visible || !to.visible) {
      return [];
    }
    if (!enabledLayers[nodeLayer(from)] || !enabledLayers[nodeLayer(to)]) {
      return [];
    }
    return [
      {
        id: flow.id,
        fromKind: from.kind,
        kind: flow.kind,
        mw: flow.mw,
        toKind: to.kind,
        width: Math.min(0.7, Math.max(0.18, flow.mw / 900)),
        x1: from.x,
        x2: to.x,
        y1: from.y,
        y2: to.y,
      },
    ];
  });
}

function flowDuration(mw: number) {
  return Math.max(1.4, 3.8 - mw / 260);
}

function flowColor(kind: GridFlowKind, fromKind?: GridNode["kind"]) {
  if (fromKind === "solar") return "#fde047";
  if (fromKind === "wind") return "#34d399";
  if (fromKind === "hydro") return "#7dd3fc";
  if (kind === "renewable") return "#34d399";
  if (kind === "thermal") return "#f87171";
  if (kind === "import") return "#a78bfa";
  if (kind === "battery-discharge" || kind === "battery-charge") return "#67e8f9";
  return "#71717a";
}

function nodeLayer(node: GridNode): MapLayer {
  if (node.kind === "battery") return "batteries";
  if (node.kind === "import") return "imports";
  if (node.kind === "gas" || node.kind === "lignite") return "thermal";
  if (node.kind === "load" || node.kind === "hub") return "load";
  return "renewables";
}

function nodeSizeClass(node: GridNode) {
  if (node.kind === "hub") return "h-2.5 w-2.5 border";
  if (node.kind === "load") return "h-8 w-8 rounded-full border";
  if (node.kind === "battery") return "h-8 w-8 border";
  if (node.mw >= 350) return "h-7 w-7 border";
  return "h-6 w-6 border";
}

function nodeToneClass(node: GridNode, selected: boolean) {
  if (selected) return "scale-110 border-white text-white";
  if (node.kind === "battery") return "border-[var(--cyan)] text-[var(--cyan)]";
  if (node.kind === "wind") return "border-[var(--green)] text-[var(--green)]";
  if (node.kind === "solar") return "border-yellow-300 text-yellow-300";
  if (node.kind === "hydro") return "border-sky-300 text-sky-300";
  if (node.kind === "gas" || node.kind === "lignite") return "border-[var(--red)] text-[var(--red)]";
  if (node.kind === "import") return "border-violet-300 text-violet-300";
  if (node.kind === "load") return "border-[var(--amber)] text-[var(--amber)]";
  return "border-zinc-600 text-zinc-600";
}
