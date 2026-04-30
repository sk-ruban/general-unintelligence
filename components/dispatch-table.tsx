"use client";

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { formatEuro, formatEurPerMwh, formatMw, formatMwh } from "@/lib/format";
import { formatMarketIntervalWindow } from "@/lib/market-time";
import type { DispatchPoint } from "@/lib/types";

export function DispatchTable({ data }: { data: DispatchPoint[] }) {
  const [sorting, setSorting] = useState([{ id: "mtu", desc: false }]);
  const columns = useMemo<ColumnDef<DispatchPoint>[]>(
    () => [
      {
        id: "mtu",
        header: "Window",
        accessorFn: (row) => row.interval.mtu,
        cell: (info) => (
          <span className="mono">{formatMarketIntervalWindow(info.row.original.interval)}</span>
        ),
      },
      {
        header: "Action",
        accessorKey: "action",
        cell: (info) => {
          const value = String(info.getValue());
          return (
            <span
              className={
                value === "charge"
                  ? "text-emerald-300"
                  : value === "discharge"
                    ? "text-orange-300"
                    : "text-zinc-500"
              }
            >
              {value.toUpperCase()}
            </span>
          );
        },
      },
      { header: "MW", accessorKey: "mw", cell: (info) => formatMw(Number(info.getValue())) },
      { header: "MWh", accessorKey: "mwh", cell: (info) => formatMwh(Number(info.getValue())) },
      { header: "SoC", accessorKey: "socMwh", cell: (info) => formatMwh(Number(info.getValue())) },
      {
        header: "Price",
        accessorKey: "priceEurPerMwh",
        cell: (info) => formatEurPerMwh(Number(info.getValue())),
      },
      {
        header: "Value",
        accessorKey: "estimatedValueEur",
        cell: (info) => formatEuro(Number(info.getValue())),
      },
    ],
    [],
  );
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="dense-scrollbar max-h-[360px] overflow-auto">
      <table className="w-full table-fixed border-collapse text-left text-[11px]">
        <thead className="sticky top-0 z-10 bg-zinc-950">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className="h-7 cursor-pointer border-white/10 border-b px-2 font-semibold text-zinc-400 uppercase"
                  onClick={header.column.getToggleSortingHandler()}
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="border-white/5 border-b hover:bg-white/[0.035]">
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="h-7 px-2 text-zinc-200">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
