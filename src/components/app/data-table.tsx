"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Columns3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { EmptyState } from "./states";
import { useUrlState } from "./url-state";

export interface DataTableColumnMeta {
  align?: "left" | "right" | "center";
  /** Header label used in the column-visibility menu. */
  label?: string;
  className?: string;
  /** Hide by default (user can show it from the Columns menu). */
  hidden?: boolean;
}

export interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  getRowId?: (row: T) => string;
  /** Server-side mode: total row count; page/pageSize/sort come from the URL. */
  total?: number;
  page?: number;
  pageSize?: number;
  sort?: string | null;
  pageSizes?: number[];
  /** Key used to remember column visibility in the browser. */
  tableKey?: string;
  selectable?: boolean;
  onSelectionChange?: (ids: string[]) => void;
  onRowClick?: (row: T) => void;
  toolbar?: React.ReactNode;
  footer?: React.ReactNode;
  emptyTitle?: string;
  emptyDescription?: React.ReactNode;
  /** Virtualise rows (for very large pages). */
  virtualize?: boolean;
  dense?: boolean;
  className?: string;
  rowClassName?: (row: T) => string | undefined;
}

export function DataTable<T>({
  columns,
  data,
  getRowId,
  total,
  page = 1,
  pageSize = 25,
  sort,
  pageSizes = [25, 50, 100, 200],
  tableKey,
  selectable,
  onSelectionChange,
  onRowClick,
  toolbar,
  footer,
  emptyTitle,
  emptyDescription,
  virtualize,
  dense = true,
  className,
  rowClassName,
}: DataTableProps<T>) {
  const { t } = useT();
  const serverMode = total !== undefined;
  const url = useUrlState();

  const initialVisibility = useMemo(() => {
    const v: VisibilityState = {};
    for (const c of columns) {
      const id = (c.id ?? (c as { accessorKey?: string }).accessorKey) as string | undefined;
      if (id && (c.meta as DataTableColumnMeta | undefined)?.hidden) v[id] = false;
    }
    return v;
  }, [columns]);
  const [visibility, setVisibility] = useState<VisibilityState>(initialVisibility);
  useEffect(() => {
    if (!tableKey) return;
    try {
      const stored = localStorage.getItem(`gbms:cols:${tableKey}`);
      if (stored) setVisibility({ ...initialVisibility, ...(JSON.parse(stored) as VisibilityState) });
    } catch {
      // ignore
    }
  }, [tableKey, initialVisibility]);
  const updateVisibility = (next: VisibilityState) => {
    setVisibility(next);
    if (tableKey) {
      try {
        localStorage.setItem(`gbms:cols:${tableKey}`, JSON.stringify(next));
      } catch {
        // ignore
      }
    }
  };

  const [clientSorting, setClientSorting] = useState<SortingState>([]);
  const serverSorting: SortingState = sort ? [{ id: sort.split(".")[0], desc: sort.endsWith(".desc") }] : [];
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const allColumns = useMemo<ColumnDef<T, unknown>[]>(() => {
    if (!selectable) return columns;
    return [
      {
        id: "__select",
        enableSorting: false,
        enableHiding: false,
        header: ({ table }) => (
          <Checkbox
            aria-label={t("common.selectAll")}
            checked={table.getIsAllPageRowsSelected() ? true : table.getIsSomePageRowsSelected() ? "indeterminate" : false}
            onCheckedChange={(v) => table.toggleAllPageRowsSelected(Boolean(v))}
          />
        ),
        cell: ({ row }) => <Checkbox aria-label="Select row" checked={row.getIsSelected()} onCheckedChange={(v) => row.toggleSelected(Boolean(v))} onClick={(e) => e.stopPropagation()} />,
        meta: { className: "w-8" },
      },
      ...columns,
    ];
  }, [columns, selectable, t]);

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table manages its own memoisation
  const table = useReactTable({
    data,
    columns: allColumns,
    getRowId: getRowId ? (row) => getRowId(row) : undefined,
    state: { sorting: serverMode ? serverSorting : clientSorting, columnVisibility: visibility, rowSelection },
    manualSorting: serverMode,
    manualPagination: serverMode,
    pageCount: serverMode ? Math.max(1, Math.ceil((total ?? 0) / pageSize)) : undefined,
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(serverMode ? serverSorting : clientSorting) : updater;
      if (serverMode) url.set({ sort: next[0] ? `${next[0].id}.${next[0].desc ? "desc" : "asc"}` : null });
      else setClientSorting(next);
    },
    onColumnVisibilityChange: (updater) => updateVisibility(typeof updater === "function" ? updater(visibility) : updater),
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: serverMode ? undefined : getSortedRowModel(),
    getPaginationRowModel: serverMode ? undefined : getPaginationRowModel(),
    initialState: serverMode ? undefined : { pagination: { pageSize } },
    enableRowSelection: selectable,
  });

  useEffect(() => {
    onSelectionChange?.(Object.keys(rowSelection).filter((k) => rowSelection[k]));
  }, [rowSelection, onSelectionChange]);

  const rows = table.getRowModel().rows;
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: virtualize ? rows.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => (dense ? 37 : 45),
    overscan: 12,
  });
  const virtualRows = virtualize ? virtualizer.getVirtualItems() : [];
  const padTop = virtualize && virtualRows.length ? virtualRows[0].start : 0;
  const padBottom = virtualize && virtualRows.length ? virtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end : 0;
  const rendered = virtualize ? virtualRows.map((v) => rows[v.index]) : rows;

  const totalRows = serverMode ? (total ?? 0) : table.getFilteredRowModel().rows.length;
  const currentPage = serverMode ? page : table.getState().pagination.pageIndex + 1;
  const currentSize = serverMode ? pageSize : table.getState().pagination.pageSize;
  const pages = Math.max(1, Math.ceil(totalRows / currentSize));
  const from = totalRows === 0 ? 0 : (currentPage - 1) * currentSize + 1;
  const to = Math.min(currentPage * currentSize, totalRows);

  const goTo = (p: number) => {
    if (serverMode) url.set({ page: p > 1 ? String(p) : null }, { resetPage: false });
    else table.setPageIndex(p - 1);
  };

  const hideable = table.getAllLeafColumns().filter((c) => c.getCanHide() && c.id !== "__select");

  return (
    <div className={cn("space-y-3", className)}>
      {toolbar || hideable.length > 0 ? (
        <div className="no-print flex flex-wrap items-center gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{toolbar}</div>
          {hideable.length > 3 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Columns3 aria-hidden />
                  {t("common.columns")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
                <DropdownMenuLabel>{t("common.columns")}</DropdownMenuLabel>
                {hideable.map((c) => (
                  <DropdownMenuCheckboxItem key={c.id} checked={c.getIsVisible()} onCheckedChange={(v) => c.toggleVisibility(Boolean(v))} onSelect={(e) => e.preventDefault()}>
                    {(c.columnDef.meta as DataTableColumnMeta | undefined)?.label ?? c.id}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      ) : null}

      <div className={cn("overflow-hidden rounded-lg border bg-card", url.pending && "opacity-70 transition-opacity")}>
        <div ref={scrollRef} className={cn("relative overflow-auto", virtualize && "max-h-[70vh]")}>
          <table className="w-full caption-bottom text-sm">
            <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b">
                  {hg.headers.map((header) => {
                    const meta = header.column.columnDef.meta as DataTableColumnMeta | undefined;
                    const sorted = header.column.getIsSorted();
                    return (
                      <th
                        key={header.id}
                        scope="col"
                        aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                        className={cn("h-9 px-3 text-left align-middle text-xs font-medium whitespace-nowrap text-muted-foreground", meta?.align === "right" && "text-right", meta?.align === "center" && "text-center", meta?.className)}
                      >
                        {header.isPlaceholder ? null : header.column.getCanSort() ? (
                          <button
                            type="button"
                            className={cn("inline-flex items-center gap-1 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring", meta?.align === "right" && "flex-row-reverse")}
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {sorted === "asc" ? <ArrowUp className="size-3" aria-hidden /> : sorted === "desc" ? <ArrowDown className="size-3" aria-hidden /> : <ArrowUpDown className="size-3 opacity-40" aria-hidden />}
                          </button>
                        ) : (
                          flexRender(header.column.columnDef.header, header.getContext())
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {padTop > 0 ? (
                <tr>
                  <td style={{ height: padTop }} colSpan={allColumns.length} />
                </tr>
              ) : null}
              {rendered.map((row) => (
                <tr
                  key={row.id}
                  data-state={row.getIsSelected() ? "selected" : undefined}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  onKeyDown={onRowClick ? (e) => e.key === "Enter" && onRowClick(row.original) : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  className={cn("border-b last:border-0 hover:bg-muted/40 data-[state=selected]:bg-accent/50", onRowClick && "cursor-pointer focus-visible:bg-muted/60 focus-visible:outline-none", rowClassName?.(row.original))}
                >
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta as DataTableColumnMeta | undefined;
                    return (
                      <td key={cell.id} className={cn("px-3 align-middle", dense ? "py-2" : "py-3", meta?.align === "right" && "num text-right whitespace-nowrap", meta?.align === "center" && "text-center", meta?.className)}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {padBottom > 0 ? (
                <tr>
                  <td style={{ height: padBottom }} colSpan={allColumns.length} />
                </tr>
              ) : null}
            </tbody>
            {footer ? <tfoot className="border-t bg-muted/40 font-medium">{footer}</tfoot> : null}
          </table>
          {rows.length === 0 ? <EmptyState className="m-4 border-0" title={emptyTitle ?? t("common.noResults")} description={emptyDescription} /> : null}
        </div>
      </div>

      {totalRows > Math.min(...pageSizes) || currentPage > 1 ? (
        <div className="no-print flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <p className="num">{t("common.showing", { from, to, total: totalRows.toLocaleString("en-US") })}</p>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline">{t("common.rowsPerPage")}</span>
            <Select
              value={String(currentSize)}
              onValueChange={(v) => {
                if (serverMode) url.set({ pageSize: v });
                else table.setPageSize(Number(v));
              }}
            >
              <SelectTrigger size="sm" className="w-20" aria-label={t("common.rowsPerPage")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizes.map((s) => (
                  <SelectItem key={s} value={String(s)}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="num px-1">{t("common.pageOf", { page: currentPage, pages })}</span>
            <Button variant="outline" size="icon-sm" aria-label={t("common.previous")} disabled={currentPage <= 1} onClick={() => goTo(currentPage - 1)}>
              <ChevronLeft aria-hidden />
            </Button>
            <Button variant="outline" size="icon-sm" aria-label={t("common.next")} disabled={currentPage >= pages} onClick={() => goTo(currentPage + 1)}>
              <ChevronRight aria-hidden />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
