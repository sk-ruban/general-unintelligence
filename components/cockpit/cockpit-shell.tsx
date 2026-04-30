import { Command } from "cmdk";
import {
  Activity,
  BarChart3,
  BatteryCharging,
  Box,
  CloudSun,
  Database,
  Flame,
  Gauge,
  MapIcon,
  RotateCw,
  Search,
  Settings,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import type { ComponentType } from "react";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { activeTenant } from "@/lib/tenants";
import type { View } from "./types";

const nav: {
  id: View;
  label: string;
  icon: ComponentType<{ className?: string }>;
}[] = [
  { id: "control", label: "Control Room", icon: Gauge },
  { id: "dispatch", label: "Dispatch Plan", icon: Zap },
  { id: "portfolio", label: "Grid Flow", icon: MapIcon },
  { id: "market", label: "Market", icon: Activity },
  { id: "weather", label: "Weather", icon: CloudSun },
  { id: "gas", label: "Gas", icon: Flame },
  { id: "twin", label: "Battery Twin", icon: BatteryCharging },
  { id: "model", label: "Model Lab", icon: Box },
  { id: "scenarios", label: "Scenario Planner", icon: BarChart3 },
  { id: "health", label: "Data Sources", icon: Database },
];

export function AppSidebar({
  activeView,
  onViewChange,
}: {
  activeView: View;
  onViewChange: (view: View) => void;
}) {
  return (
    <Sidebar collapsible="icon" className="border-white/10 border-r bg-[var(--bg-panel)]">
      <SidebarHeader className="h-12 justify-center border-white/10 border-b px-4 py-0">
        <div className="flex w-full items-center gap-2 font-semibold text-[13px] tracking-[1px]">
          <Image src="/prometheus-icon.png" alt="" width={20} height={20} className="rounded-sm" />
          <span className="truncate group-data-[collapsible=icon]:hidden">PROMETHEUS</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup className="px-0 py-3">
          <SidebarGroupContent>
            <SidebarMenu className="gap-0">
              {nav.map((item) => {
                const Icon = item.icon;
                const active = activeView === item.id;
                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      isActive={active}
                      tooltip={item.label}
                      className="relative h-8 gap-3 rounded-none px-4 text-[13px] font-normal text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-100 data-[active=true]:bg-white/[0.03] data-[active=true]:font-normal data-[active=true]:text-zinc-100 group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:rounded-none group-data-[collapsible=icon]:data-[active=true]:bg-transparent group-data-[collapsible=icon]:hover:bg-white/[0.03] [&>svg]:size-3.5"
                      onClick={() => onViewChange(item.id)}
                    >
                      {active ? (
                        <span className="pointer-events-none absolute inset-y-0 left-0 w-0.5 bg-[var(--cyan)] group-data-[collapsible=icon]:hidden" />
                      ) : null}
                      <Icon className={active ? "text-[var(--cyan)]" : "opacity-70"} />
                      <span className="group-data-[collapsible=icon]:hidden">{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-white/10 border-t p-3">
        <TenantFooter />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function TenantFooter() {
  const tenant = activeTenant;

  return (
    <div className="flex min-w-0 items-center gap-2 group-data-[collapsible=icon]:justify-center">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] p-1">
        <Image
          src={tenant.logoSrc}
          alt={`${tenant.displayName} icon`}
          width={24}
          height={24}
          className="size-5 object-contain"
        />
      </div>
      <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
        <div className="text-[13px] font-medium leading-tight text-zinc-100">{tenant.displayName}</div>
        <div className="truncate text-[11px] leading-tight text-zinc-500">{tenant.loginEmail}</div>
      </div>
      <button
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-zinc-500 transition hover:bg-white/[0.04] hover:text-zinc-100 group-data-[collapsible=icon]:hidden"
        type="button"
        aria-label="Tenant settings"
      >
        <Settings className="size-3.5" />
      </button>
    </div>
  );
}

export function TopBar({ selectedDay }: { selectedDay: string }) {
  const dayLabel = selectedDay || "loading";

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-white/10 border-b bg-[var(--bg-base)] px-4">
      <div className="flex min-w-0 items-center gap-4">
        <div className="flex shrink-0 items-center gap-2 whitespace-nowrap text-[11px] font-medium text-zinc-500 uppercase tracking-[0.05em]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--green)] shadow-[0_0_8px_var(--green)]" />
          Live Mode
        </div>
        <div className="mono hidden truncate text-[11px] text-zinc-500 md:block">
          Latest HEnEx DAM {dayLabel} | Europe/Athens
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          className="h-7 rounded border-white/10 bg-[var(--bg-raised)] px-2.5 font-normal text-[12px] text-zinc-100 shadow-none hover:bg-white/[0.08] hover:text-zinc-100"
          type="button"
        >
          <RotateCw className="size-3 text-[var(--cyan)]" />
          Sync Model
        </Button>
      </div>
    </header>
  );
}

export function CommandPalette({
  open,
  setOpen,
  setView,
}: {
  open: boolean;
  setOpen: (value: boolean) => void;
  setView: (view: View) => void;
}) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-[14vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setOpen(false)}
        >
          <Command
            className="w-[min(560px,calc(100vw-32px))] rounded border border-white/10 bg-[var(--bg-panel)] shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex h-11 items-center gap-2 border-white/10 border-b px-3">
              <Search className="h-4 w-4 text-zinc-500" />
              <Command.Input
                className="w-full bg-transparent text-sm outline-none placeholder:text-zinc-600"
                placeholder="Jump to view..."
              />
            </div>
            <Command.List className="p-2">
              <Command.Empty className="p-3 text-[12px] text-zinc-500">No command found.</Command.Empty>
              {nav.map((item) => {
                const Icon = item.icon;
                return (
                  <Command.Item
                    key={item.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-[13px] text-zinc-200 aria-selected:bg-white/10"
                    onSelect={() => {
                      setView(item.id);
                      setOpen(false);
                    }}
                  >
                    <Icon className="h-4 w-4 text-[var(--cyan)]" />
                    {item.label}
                  </Command.Item>
                );
              })}
            </Command.List>
          </Command>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
