import React from 'react';

export interface Column<T> {
  key: string;
  header: string;
  render: (item: T) => React.ReactNode;
  className?: string;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (item: T) => void;
  caption?: string;
  className?: string;
}

export function Table<T extends { id: string }>({
  columns,
  data,
  onRowClick,
  caption,
  className = '',
}: TableProps<T>) {
  return (
    <div className={`w-full overflow-x-auto ${className}`}>
      <table className="w-full border-collapse text-left text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="sticky top-0 z-10 bg-surface border-b border-line text-xs font-medium text-ink-soft h-10 select-none">
            {columns.map((col) => (
              <th key={col.key} className={`px-4 py-2 font-medium ${col.className || ''}`}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {data.map((item) => (
            <tr
              key={item.id}
              onClick={() => onRowClick?.(item)}
              className={`h-12 transition-all duration-150 relative group ${
                onRowClick ? 'cursor-pointer hover:bg-surface-hover hover:shadow-sm' : ''
              }`}
            >
              {columns.map((col, idx) => (
                <td key={col.key} className={`px-4 py-3 text-ink ${col.className || ''}`}>
                  {idx === 0 && (
                    <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-red-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                  {col.render(item)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
