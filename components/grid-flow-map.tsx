"use client";

import { useEffect, useMemo, useState } from "react";
import type { GridFlow, GridFlowKind, GridNode, PortfolioSiteState } from "@/lib/portfolio";

type GridFlowMapProps = {
  flows: GridFlow[];
  nodes: GridNode[];
  selectedSiteId: string;
  sites: PortfolioSiteState[];
  onSelectSite: (siteId: string) => void;
};

type MapMode = "dispatch" | "supply" | "flows" | "stress";
type ProjectedGridNode = GridNode & { visible: boolean; x: number; y: number };

const SATELLITE_BOUNDS = {
  west: 13.0374,
  south: 32.8,
  east: 32.5626,
  north: 42.8,
} as const;
const SATELLITE_ASPECT_WIDTH = 1200;
const SATELLITE_ASPECT_HEIGHT = 780;
const MODE_LABELS: Record<MapMode, string> = {
  dispatch: "Dispatch",
  supply: "Supply",
  flows: "Flows",
  stress: "Stress",
};
const SATELLITE_EXPORT_URL = `https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=${SATELLITE_BOUNDS.west},${SATELLITE_BOUNDS.south},${SATELLITE_BOUNDS.east},${SATELLITE_BOUNDS.north}&bboxSR=4326&imageSR=3857&size=${SATELLITE_ASPECT_WIDTH},${SATELLITE_ASPECT_HEIGHT}&format=jpg&f=image`;

export function GridFlowMap({ flows, nodes, selectedSiteId, sites, onSelectSite }: GridFlowMapProps) {
  const [mode, setMode] = useState<MapMode>("dispatch");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const selectedSite = sites.find((site) => site.id === selectedSiteId) ?? null;
  const selectedNode =
    nodes.find((node) => node.id === selectedNodeId) ??
    nodes.find((node) => node.siteId === selectedSiteId) ??
    null;
  const projectedNodes = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        ...projectToSatellite(node.longitude, node.latitude),
      })),
    [nodes],
  );
  const visibleAssetNodes = useMemo(
    () => projectedNodes.filter((node) => node.visible && node.kind !== "hub"),
    [projectedNodes],
  );
  const projectedNodeById = useMemo(
    () => new Map(projectedNodes.map((node) => [node.id, node])),
    [projectedNodes],
  );
  const projectedFlows = useMemo(
    () => buildProjectedFlows(flows, projectedNodeById),
    [flows, projectedNodeById],
  );
  const activeFlowMw = flows.reduce((total, flow) => total + flow.mw, 0);

  useEffect(() => {
    const selected = nodes.find((node) => node.siteId === selectedSiteId);
    if (selected) {
      setSelectedNodeId(selected.id);
    }
  }, [nodes, selectedSiteId]);

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
            style={{ backgroundImage: `url("${SATELLITE_EXPORT_URL}")`, backgroundSize: "100% 100%" }}
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
                stroke={flowColor(flow.kind)}
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
                stroke={flowColor(flow.kind)}
                strokeDasharray="1.4 0.9"
                strokeLinecap="round"
                strokeOpacity="0.84"
                strokeWidth={flow.width}
                x1={flow.x1}
                x2={flow.x2}
                y1={flow.y1}
                y2={flow.y2}
              />
            ))}
          </svg>
          <div className="absolute inset-0">
            {visibleAssetNodes.map((node) => (
              <button
                key={node.id}
                className={`absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center bg-black/80 text-[8px] shadow-[0_0_20px_rgba(0,0,0,0.72)] transition hover:scale-110 ${nodeSizeClass(node)} ${nodeToneClass(node, mode, node.siteId === selectedSiteId)}`}
                style={{ left: `${node.x}%`, top: `${node.y}%` }}
                title={`${node.name} · ${node.detail}`}
                type="button"
                onClick={() => {
                  setSelectedNodeId(node.id);
                  if (node.siteId) {
                    onSelectSite(node.siteId);
                  }
                }}
              >
                <span className="mono leading-none">{nodeLabel(node, mode)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="absolute top-3 left-3 flex gap-1 border border-white/10 bg-black/70 p-1">
        {Object.entries(MODE_LABELS).map(([value, label]) => (
          <button
            key={value}
            className={`h-7 px-2 text-[10px] uppercase tracking-[0.05em] transition ${
              mode === value
                ? "bg-cyan-300/15 text-[var(--cyan)]"
                : "text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-100"
            }`}
            type="button"
            onClick={() => setMode(value as MapMode)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="absolute top-3 right-3 grid min-w-52 gap-2 border border-white/10 bg-black/75 p-3 text-[11px] shadow-2xl">
        <div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-[0.08em]">Grid Flow Manager</div>
          <div className="mono mt-1 text-zinc-100">
            {Math.round(activeFlowMw).toLocaleString()} MW modelled flow
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-zinc-500">
          <span>{nodes.filter((node) => node.kind === "battery").length} batteries</span>
          <span>{flows.length} corridors</span>
          <span>
            {
              nodes.filter((node) => node.kind === "wind" || node.kind === "solar" || node.kind === "hydro")
                .length
            }{" "}
            renewable nodes
          </span>
          <span>{nodes.filter((node) => node.kind === "import").length} imports</span>
        </div>
      </div>
      <div className="absolute right-3 bottom-3 grid w-64 gap-2 border border-white/10 bg-black/75 p-3 text-[11px] shadow-2xl">
        <div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-[0.08em]">
            {selectedNode?.kind ?? "node"}
          </div>
          <div className="truncate text-zinc-100">
            {selectedNode?.name ?? selectedSite?.name ?? "Select a node"}
          </div>
          <div className="mt-1 text-zinc-500">
            {selectedNode?.detail ?? "Click a battery, generator, or import node."}
          </div>
        </div>
        {selectedSite && selectedNode?.siteId ? (
          <div className="grid grid-cols-3 gap-2 border-white/10 border-t pt-2">
            <MiniDatum label="Action" value={selectedSite.current?.action ?? "idle"} />
            <MiniDatum label="Power" value={`${selectedSite.current?.mw.toFixed(1) ?? "0"} MW`} />
            <MiniDatum label="SoC" value={`${Math.round(selectedSite.socPercent)}%`} />
          </div>
        ) : selectedNode ? (
          <div className="grid grid-cols-3 gap-2 border-white/10 border-t pt-2">
            <MiniDatum label="Type" value={selectedNode.kind} />
            <MiniDatum label="Output" value={`${Math.round(selectedNode.mw)} MW`} />
            <MiniDatum label="Region" value={selectedNode.region} />
          </div>
        ) : null}
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3 grid gap-1 border border-white/10 bg-black/70 p-2 text-[10px] text-zinc-500 uppercase">
        <LegendItem color="#34d399" label="renewables / charge" />
        <LegendItem color="#f59e0b" label="battery discharge" />
        <LegendItem color="#60a5fa" label="imports" />
        <LegendItem color="#f87171" label="thermal" />
      </div>
    </div>
  );
}

function MiniDatum({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] text-zinc-500 uppercase">{label}</div>
      <div className="mono truncate text-zinc-100">{value}</div>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
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

function buildProjectedFlows(flows: GridFlow[], nodeById: Map<string, ProjectedGridNode>) {
  return flows.flatMap((flow) => {
    const from = nodeById.get(flow.fromNodeId);
    const to = nodeById.get(flow.toNodeId);
    if (!from || !to || !from.visible || !to.visible) {
      return [];
    }
    return [
      {
        id: flow.id,
        kind: flow.kind,
        width: Math.min(0.7, Math.max(0.18, flow.mw / 900)),
        x1: from.x,
        x2: to.x,
        y1: from.y,
        y2: to.y,
      },
    ];
  });
}

function flowColor(kind: GridFlowKind) {
  if (kind === "renewable") return "#34d399";
  if (kind === "thermal") return "#f87171";
  if (kind === "import") return "#60a5fa";
  if (kind === "battery-discharge") return "#f59e0b";
  if (kind === "battery-charge") return "#67e8f9";
  return "#71717a";
}

function nodeSizeClass(node: GridNode) {
  if (node.kind === "hub") return "h-2.5 w-2.5 border";
  if (node.kind === "battery") return "h-8 w-8 border";
  if (node.mw >= 350) return "h-7 w-7 border";
  return "h-6 w-6 border";
}

function nodeToneClass(node: GridNode, mode: MapMode, selected: boolean) {
  if (selected) return "scale-110 border-white text-white";
  if (node.kind === "battery") {
    return mode === "stress"
      ? "border-[var(--violet)] text-[var(--violet)]"
      : "border-[var(--cyan)] text-[var(--cyan)]";
  }
  if (node.kind === "wind") return "border-[var(--green)] text-[var(--green)]";
  if (node.kind === "solar") return "border-yellow-300 text-yellow-300";
  if (node.kind === "hydro") return "border-sky-300 text-sky-300";
  if (node.kind === "gas" || node.kind === "lignite") return "border-[var(--red)] text-[var(--red)]";
  if (node.kind === "import") return "border-[var(--blue)] text-[var(--blue)]";
  if (node.kind === "load") return "border-[var(--amber)] text-[var(--amber)]";
  return "border-zinc-600 text-zinc-600";
}

function nodeLabel(node: GridNode, mode: MapMode) {
  if (node.kind === "hub") return "";
  if (node.kind === "battery") return mode === "supply" ? `${Math.round(node.mw)}` : "B";
  if (node.kind === "wind") return "W";
  if (node.kind === "solar") return "S";
  if (node.kind === "hydro") return "H";
  if (node.kind === "gas") return "G";
  if (node.kind === "lignite") return "L";
  if (node.kind === "import") return "I";
  if (node.kind === "load") return "LD";
  return "";
}
