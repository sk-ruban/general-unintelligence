import { MapPinned, RadioTower } from "lucide-react";
import { GridFlowMap } from "@/components/grid-flow-map";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { formatEuro, formatMw, formatMwh, formatPercent } from "@/lib/format";
import type { GridFlow, GridNode, PortfolioSiteState } from "@/lib/portfolio";
import type { DispatchPoint } from "@/lib/types";
import { DetailMetric, PageActionButton, PageIntro, Tag } from "./shared";

export function PortfolioView({
  gridFlows,
  gridNodes,
  sites,
  selectedGridSite,
  selectedNode,
  selectedNodeId,
  onSelectNode,
  onSelectSite,
}: {
  gridFlows: GridFlow[];
  gridNodes: GridNode[];
  sites: PortfolioSiteState[];
  selectedGridSite: PortfolioSiteState | null;
  selectedNode: GridNode | null;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onSelectSite: (siteId: string) => void;
}) {
  const firstBatteryNode = gridNodes.find((node) => node.kind === "battery");
  return (
    <div className="grid gap-4">
      <PageIntro
        kicker="Grid Flow"
        title="Asset Map"
        description="Maps fleet assets onto the system, showing the grid nodes, flow pressure, and site details operators should inspect before trusting a dispatch recommendation."
        actions={
          <>
            <PageActionButton
              onClick={() => (firstBatteryNode ? onSelectNode(firstBatteryNode.id) : undefined)}
            >
              <MapPinned className="size-3.5" />
              Focus battery
            </PageActionButton>
            <Tag tone="outline">{sites.length} assets</Tag>
            <Tag tone="blue">{gridNodes.length} nodes</Tag>
          </>
        }
      />
      <div className="grid gap-4 xl:grid-cols-[1.45fr_0.95fr]">
        <Panel>
          <PanelHeader title="Grid Flow Manager" />
          <GridFlowMap
            flows={gridFlows}
            nodes={gridNodes}
            selectedNodeId={selectedNodeId}
            onSelectNode={onSelectNode}
          />
        </Panel>
        <GridDetailPanel flows={gridFlows} node={selectedNode} nodes={gridNodes} site={selectedGridSite} />
      </div>
      <Panel>
        <PanelHeader
          title="Site Tape"
          kicker="Fleet state by asset"
          right={
            sites[0] ? (
              <button
                className="inline-flex h-6 items-center gap-1 rounded-sm border border-white/10 bg-black/20 px-2 text-[10px] text-zinc-400 uppercase hover:text-zinc-100"
                type="button"
                onClick={() => onSelectSite(sites[0]?.id ?? "")}
              >
                <RadioTower className="size-3" />
                First asset
              </button>
            ) : null
          }
        />
        <div className="dense-scrollbar max-h-[340px] overflow-auto">
          <table className="w-full table-fixed text-left text-[11px]">
            <thead className="sticky top-0 bg-[var(--bg-panel)] text-zinc-500 uppercase">
              <tr>
                <th className="h-7 px-3">Site</th>
                <th className="h-7 px-3">Region</th>
                <th className="h-7 px-3">Action</th>
                <th className="h-7 px-3">MW</th>
                <th className="h-7 px-3">SoC</th>
                <th className="h-7 px-3">Value</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((site) => (
                <tr
                  key={site.id}
                  className={`cursor-pointer border-white/5 border-t hover:bg-white/[0.04] ${
                    selectedGridSite?.id === site.id ? "bg-cyan-300/[0.06]" : ""
                  }`}
                  onClick={() => onSelectSite(site.id)}
                >
                  <td className="h-8 truncate px-3 text-zinc-200">{site.name}</td>
                  <td className="h-8 truncate px-3 text-zinc-500">{site.region}</td>
                  <td className={`h-8 px-3 font-semibold uppercase ${actionTextClass(site.current?.action)}`}>
                    {site.current?.action ?? "idle"}
                  </td>
                  <td className="mono h-8 px-3">{formatMw(site.current?.mw ?? 0)}</td>
                  <td className="mono h-8 px-3">{formatPercent(site.socPercent / 100)}</td>
                  <td className="mono h-8 px-3">{formatEuro(site.summary.valueEur)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function GridDetailPanel({
  flows,
  node,
  nodes,
  site,
}: {
  flows: GridFlow[];
  node: GridNode | null;
  nodes: GridNode[];
  site: PortfolioSiteState | null;
}) {
  if (node && !site) {
    const detailCopy = gridNodeDetailCopy(node);
    const connectedFlows = connectedGridFlows(node, flows, nodes);
    return (
      <Panel>
        <PanelHeader title={node.name} kicker={`${gridNodeKindLabel(node.kind)} · ${node.region}`} />
        <div className="grid gap-3 p-3">
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-1">
            <DetailMetric label="Asset Type" value={gridNodeKindLabel(node.kind)} detail={node.detail} />
            <DetailMetric
              label={detailCopy.powerLabel}
              value={formatMw(node.mw)}
              detail={detailCopy.powerDetail}
            />
            <DetailMetric
              label={detailCopy.regionLabel}
              value={node.region}
              detail={detailCopy.regionDetail}
            />
            <DetailMetric
              label="Coordinates"
              value={`${node.latitude.toFixed(2)}, ${node.longitude.toFixed(2)}`}
              detail="Approximate demo location"
            />
          </div>
          {connectedFlows.length > 0 ? (
            <div className="grid gap-2 border border-white/10 bg-black/25 p-3 text-[11px]">
              <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-[0.05em]">
                Connected Flows
              </div>
              {connectedFlows.map((flow) => (
                <div
                  key={flow.id}
                  className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-2 border-white/10 border-t pt-2 first:border-t-0 first:pt-0"
                >
                  <span className="mono text-zinc-500 uppercase">{flow.direction}</span>
                  <span className="truncate text-zinc-300">{flow.counterparty}</span>
                  <span className="mono text-zinc-100">{formatMw(flow.mw)}</span>
                  <span className="col-span-3 truncate text-zinc-500">{flow.label}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </Panel>
    );
  }

  if (!site) {
    return (
      <Panel>
        <PanelHeader title="Grid Asset Detail" kicker="No node selected" />
        <div className="p-3 text-[12px] text-zinc-500">Click a marker on the grid map.</div>
      </Panel>
    );
  }
  const nextAction = site.schedule.find((point) => point.action !== "idle");
  const currentAction = site.current?.action ?? "idle";
  return (
    <Panel>
      <PanelHeader title={site.name} kicker={`${site.region} · ${site.constraint}`} />
      <div className="grid gap-3 p-3">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-1">
          <DetailMetric
            label="Current Action"
            value={currentAction.toUpperCase()}
            detail={site.current?.reason ?? "No dispatch"}
          />
          <DetailMetric
            label="Power"
            value={formatMw(site.current?.mw ?? 0)}
            detail={site.current?.interval.athensLabel ?? "n/a"}
          />
          <DetailMetric
            label="State of Charge"
            value={formatPercent(site.socPercent / 100)}
            detail={formatMwh(site.current?.socMwh ?? site.initialSocMwh)}
          />
          <DetailMetric
            label="Day Value"
            value={formatEuro(site.summary.valueEur)}
            detail="Local deterministic schedule"
          />
        </div>
        <div className="border border-white/10 bg-black/25 p-3">
          <div className="flex items-center justify-between text-[10px] text-zinc-500 uppercase">
            <span>SoC band</span>
            <span className="mono">
              {formatMwh(site.minSocMwh)} / {formatMwh(site.maxSocMwh)}
            </span>
          </div>
          <div className="mt-2 h-2 bg-white/10">
            <div className="h-full bg-[var(--cyan)]" style={{ width: `${site.socPercent}%` }} />
          </div>
        </div>
        <div className="grid gap-1 border border-white/10 bg-black/25 p-3 text-[11px]">
          <div className="text-[10px] text-zinc-500 uppercase">Next useful interval</div>
          <div className="mono text-zinc-100">
            {nextAction
              ? `${nextAction.interval.athensLabel} · ${nextAction.action.toUpperCase()}`
              : "No action"}
          </div>
          <div className="text-zinc-500">
            {nextAction?.reason ?? "No non-idle interval in the selected day."}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function gridNodeKindLabel(kind: GridNode["kind"]) {
  if (kind === "import") return "Import";
  if (kind === "load") return "Connection";
  if (kind === "gas" || kind === "lignite") return "Thermal Plant";
  if (kind === "hydro") return "Hydro";
  if (kind === "solar") return "Solar";
  if (kind === "wind") return "Wind";
  if (kind === "battery") return "Battery";
  return "Grid Transfer";
}

function gridNodeDetailCopy(node: GridNode) {
  if (node.kind === "import") {
    return {
      powerDetail: "Scheduled import flow into the Greek grid",
      powerLabel: "Import Flow",
      regionDetail: "Cross-border import pair",
      regionLabel: "Border Pair",
    };
  }
  if (node.kind === "load") {
    return {
      powerDetail: "Urban demand currently supplied by the modelled grid",
      powerLabel: "Demand Supplied",
      regionDetail: "Urban connection area",
      regionLabel: "Connection Area",
    };
  }
  if (node.kind === "gas" || node.kind === "lignite") {
    return {
      powerDetail: "Thermal output into the transmission corridor",
      powerLabel: "Thermal Output",
      regionDetail: "Plant operating region",
      regionLabel: "Operating Region",
    };
  }
  if (node.kind === "hydro") {
    return {
      powerDetail: "Hydro output routed into the transmission grid",
      powerLabel: "Hydro Output",
      regionDetail: "Hydro operating region",
      regionLabel: "Operating Region",
    };
  }
  if (node.kind === "solar" || node.kind === "wind") {
    return {
      powerDetail: "Renewable output routed into the transmission grid",
      powerLabel: "Renewable Output",
      regionDetail: "Renewable operating region",
      regionLabel: "Operating Region",
    };
  }
  return {
    powerDetail: "Modelled transfer on the grid corridor",
    powerLabel: "Transfer",
    regionDetail: "Grid operating region",
    regionLabel: "Region",
  };
}

function connectedGridFlows(node: GridNode, flows: GridFlow[], nodes: GridNode[]) {
  const nodeNameById = new Map(nodes.map((candidate) => [candidate.id, candidate.name]));
  return flows
    .filter((flow) => flow.fromNodeId === node.id || flow.toNodeId === node.id)
    .map((flow) => {
      const outgoing = flow.fromNodeId === node.id;
      const counterpartyId = outgoing ? flow.toNodeId : flow.fromNodeId;
      return {
        counterparty: nodeNameById.get(counterpartyId) ?? counterpartyId,
        direction: outgoing ? "out" : "in",
        id: flow.id,
        label: flow.label,
        mw: flow.mw,
      };
    });
}

function actionTextClass(action: DispatchPoint["action"] | undefined) {
  if (action === "charge") return "text-[var(--green)]";
  if (action === "discharge") return "text-[var(--amber)]";
  return "text-zinc-500";
}
