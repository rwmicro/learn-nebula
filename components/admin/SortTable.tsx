"use client";

// A dense, sortable table for the admin lists (accounts, search misses).
// Click a header to sort by it, again to flip the order. Columns say how to
// read a sortable value; everything else is plain rendering.

import { useMemo, useState, type ReactNode } from "react";

export interface Column<T> {
  id: string;
  label: string;
  /** Cell content. */
  cell: (row: T) => ReactNode;
  /** Sort key; omit for a column that doesn't sort. null sorts last. */
  sortValue?: (row: T) => string | number | null;
  /** Right-aligned, tabular figures. */
  numeric?: boolean;
  /** Hidden below ~40rem (secondary facts). */
  wideOnly?: boolean;
}

export function SortTable<T>({
  rows,
  columns,
  rowKey,
  initialSort,
  rowClass,
  caption,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string | number;
  initialSort: { id: string; dir: "asc" | "desc" };
  rowClass?: (row: T) => string;
  caption: string;
}) {
  const [sort, setSort] = useState(initialSort);
  const sorted = useMemo(() => {
    const col = columns.find((c) => c.id === sort.id);
    if (!col?.sortValue) return rows;
    const val = col.sortValue;
    const sign = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      if (x === y) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      if (typeof x === "number" && typeof y === "number") return (x - y) * sign;
      return String(x).localeCompare(String(y), "fr") * sign;
    });
  }, [rows, columns, sort]);

  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => {
              const active = sort.id === c.id;
              const cls = `${c.numeric ? "is-num" : ""}${c.wideOnly ? " is-wide" : ""}`;
              return (
                <th
                  key={c.id}
                  scope="col"
                  className={cls}
                  aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                >
                  {c.sortValue ? (
                    <button
                      type="button"
                      onClick={() =>
                        setSort((s) =>
                          s.id === c.id
                            ? { id: c.id, dir: s.dir === "asc" ? "desc" : "asc" }
                            : { id: c.id, dir: c.numeric ? "desc" : "asc" },
                        )
                      }
                    >
                      {c.label}
                      <span aria-hidden="true" className="admin-sort">
                        {active ? (sort.dir === "asc" ? "▲" : "▼") : ""}
                      </span>
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={rowKey(row)} className={rowClass?.(row)}>
              {columns.map((c) => (
                <td key={c.id} className={`${c.numeric ? "is-num" : ""}${c.wideOnly ? " is-wide" : ""}`}>
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
