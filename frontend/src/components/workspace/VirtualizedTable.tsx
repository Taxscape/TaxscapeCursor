"use client";

import React, { useCallback, useRef, useEffect, useState, useMemo } from "react";

// =============================================================================
// TYPES
// =============================================================================

interface Column<T> {
  id: string;
  header: string;
  accessor: keyof T | ((row: T) => React.ReactNode);
  width?: number;
  minWidth?: number;
  sortable?: boolean;
  filterable?: boolean;
  render?: (value: any, row: T) => React.ReactNode;
}

interface VirtualizedTableProps<T> {
  data: T[];
  columns: Column<T>[];
  rowHeight?: number;
  headerHeight?: number;
  overscan?: number;
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T, index: number) => void;
  getRowId?: (row: T) => string;
  sortable?: boolean;
  onSort?: (columnId: string, direction: "asc" | "desc") => void;
  currentSort?: { columnId: string; direction: "asc" | "desc" } | null;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  selectable?: boolean;
  stickyHeader?: boolean;
  className?: string;
}

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  loading?: boolean;
}

// =============================================================================
// VIRTUALIZED TABLE COMPONENT
// =============================================================================

export function VirtualizedTable<T extends Record<string, any>>({
  data,
  columns,
  rowHeight = 48,
  headerHeight = 44,
  overscan = 5,
  loading = false,
  emptyMessage = "No data available",
  onRowClick,
  getRowId = (row) => row.id,
  sortable = false,
  onSort,
  currentSort,
  selectedIds = new Set(),
  onSelectionChange,
  selectable = false,
  stickyHeader = true,
  className = "",
}: VirtualizedTableProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  // Calculate visible range
  const totalHeight = data.length * rowHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endIndex = Math.min(
    data.length,
    Math.ceil((scrollTop + containerHeight) / rowHeight) + overscan
  );
  const visibleData = data.slice(startIndex, endIndex);
  const offsetY = startIndex * rowHeight;

  // Handle scroll
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // Handle resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height - headerHeight);
      }
    });

    observer.observe(container);
    setContainerHeight(container.clientHeight - headerHeight);

    return () => observer.disconnect();
  }, [headerHeight]);

  // Handle row selection
  const handleSelectAll = useCallback(() => {
    if (!onSelectionChange) return;
    
    const allIds = new Set(data.map((row) => getRowId(row)));
    const allSelected = selectedIds.size === data.length && data.length > 0;
    
    onSelectionChange(allSelected ? new Set() : allIds);
  }, [data, getRowId, onSelectionChange, selectedIds.size]);

  const handleSelectRow = useCallback((rowId: string) => {
    if (!onSelectionChange) return;
    
    const newSelected = new Set(selectedIds);
    if (newSelected.has(rowId)) {
      newSelected.delete(rowId);
    } else {
      newSelected.add(rowId);
    }
    onSelectionChange(newSelected);
  }, [onSelectionChange, selectedIds]);

  // Handle sort
  const handleSort = useCallback((columnId: string) => {
    if (!onSort || !sortable) return;
    
    const direction = 
      currentSort?.columnId === columnId && currentSort.direction === "asc"
        ? "desc"
        : "asc";
    onSort(columnId, direction);
  }, [currentSort, onSort, sortable]);

  // Get cell value
  const getCellValue = useCallback((row: T, column: Column<T>) => {
    const value = typeof column.accessor === "function"
      ? column.accessor(row)
      : row[column.accessor];
    
    if (column.render) {
      return column.render(value, row);
    }
    return value;
  }, []);

  const allSelected = selectedIds.size === data.length && data.length > 0;
  const someSelected = selectedIds.size > 0 && selectedIds.size < data.length;

  return (
    <div 
      ref={containerRef}
      className={`relative overflow-auto border border-[#3a3a3c] rounded-xl bg-[#1c1c1e] ${className}`}
      onScroll={handleScroll}
    >
      {/* Header */}
      <div 
        className={`flex bg-[#2c2c2e] border-b border-[#3a3a3c] ${stickyHeader ? "sticky top-0 z-10" : ""}`}
        style={{ height: headerHeight }}
      >
        {selectable && (
          <div className="flex items-center justify-center w-12 border-r border-[#3a3a3c]">
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => {
                if (el) el.indeterminate = someSelected;
              }}
              onChange={handleSelectAll}
              className="w-4 h-4 rounded border-[#3a3a3c] bg-[#1c1c1e] text-[#0a84ff] focus:ring-[#0a84ff]"
            />
          </div>
        )}
        {columns.map((column) => (
          <div
            key={column.id}
            className={`flex items-center px-4 text-xs font-semibold text-[#8e8e93] uppercase tracking-wider ${
              sortable && column.sortable !== false ? "cursor-pointer hover:text-white" : ""
            }`}
            style={{ 
              width: column.width, 
              minWidth: column.minWidth || 80,
              flex: column.width ? "none" : 1 
            }}
            onClick={() => column.sortable !== false && handleSort(column.id)}
          >
            {column.header}
            {currentSort?.columnId === column.id && (
              <span className="ml-1">
                {currentSort.direction === "asc" ? "↑" : "↓"}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-20">
          <div className="flex items-center gap-3 bg-[#2c2c2e] px-6 py-4 rounded-xl shadow-xl">
            <div className="w-5 h-5 border-2 border-[#0a84ff] border-t-transparent rounded-full animate-spin" />
            <span className="text-white">Loading...</span>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && data.length === 0 && (
        <div className="flex items-center justify-center py-16 text-[#8e8e93]">
          {emptyMessage}
        </div>
      )}

      {/* Virtual Body */}
      {data.length > 0 && (
        <div style={{ height: totalHeight, position: "relative" }}>
          <div style={{ transform: `translateY(${offsetY}px)` }}>
            {visibleData.map((row, virtualIndex) => {
              const actualIndex = startIndex + virtualIndex;
              const rowId = getRowId(row);
              const isSelected = selectedIds.has(rowId);

              return (
                <div
                  key={rowId}
                  className={`flex border-b border-[#2c2c2e] ${
                    onRowClick ? "cursor-pointer" : ""
                  } ${isSelected ? "bg-[#0a84ff]/10" : "hover:bg-[#2c2c2e]"}`}
                  style={{ height: rowHeight }}
                  onClick={() => onRowClick?.(row, actualIndex)}
                >
                  {selectable && (
                    <div 
                      className="flex items-center justify-center w-12 border-r border-[#2c2c2e]"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectRow(rowId);
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleSelectRow(rowId)}
                        className="w-4 h-4 rounded border-[#3a3a3c] bg-[#1c1c1e] text-[#0a84ff] focus:ring-[#0a84ff]"
                      />
                    </div>
                  )}
                  {columns.map((column) => (
                    <div
                      key={column.id}
                      className="flex items-center px-4 text-sm text-white truncate"
                      style={{ 
                        width: column.width, 
                        minWidth: column.minWidth || 80,
                        flex: column.width ? "none" : 1 
                      }}
                    >
                      {getCellValue(row, column)}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// PAGINATION COMPONENT
// =============================================================================

export function Pagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [25, 50, 100, 250],
  loading = false,
}: PaginationProps) {
  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  // Generate page numbers to show
  const pageNumbers = useMemo(() => {
    const pages: (number | "...")[] = [];
    const maxVisible = 5;
    
    if (totalPages <= maxVisible + 2) {
      // Show all pages
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      // Show first, last, and pages around current
      pages.push(1);
      
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      
      if (start > 2) pages.push("...");
      for (let i = start; i <= end; i++) pages.push(i);
      if (end < totalPages - 1) pages.push("...");
      
      pages.push(totalPages);
    }
    
    return pages;
  }, [currentPage, totalPages]);

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-[#2c2c2e] border-t border-[#3a3a3c] rounded-b-xl">
      {/* Items info */}
      <div className="text-sm text-[#8e8e93]">
        Showing <span className="text-white font-medium">{startItem}</span> to{" "}
        <span className="text-white font-medium">{endItem}</span> of{" "}
        <span className="text-white font-medium">{totalItems.toLocaleString()}</span> items
      </div>

      {/* Page size selector */}
      {onPageSizeChange && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-[#8e8e93]">Rows:</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            disabled={loading}
            className="px-2 py-1 bg-[#1c1c1e] border border-[#3a3a3c] rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#0a84ff]"
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </div>
      )}

      {/* Page numbers */}
      <div className="flex items-center gap-1">
        {/* Previous */}
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1 || loading}
          className="p-2 rounded-lg text-[#8e8e93] hover:text-white hover:bg-[#3a3a3c] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m15 18-6-6 6-6"/>
          </svg>
        </button>

        {/* Page numbers */}
        {pageNumbers.map((page, i) => (
          page === "..." ? (
            <span key={`ellipsis-${i}`} className="px-2 text-[#8e8e93]">...</span>
          ) : (
            <button
              key={page}
              onClick={() => onPageChange(page)}
              disabled={loading}
              className={`min-w-[32px] h-8 rounded-lg text-sm font-medium transition-colors ${
                page === currentPage
                  ? "bg-[#0a84ff] text-white"
                  : "text-[#8e8e93] hover:text-white hover:bg-[#3a3a3c]"
              }`}
            >
              {page}
            </button>
          )
        ))}

        {/* Next */}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages || loading}
          className="p-2 rounded-lg text-[#8e8e93] hover:text-white hover:bg-[#3a3a3c] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m9 18 6-6-6-6"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// BULK ACTIONS BAR
// =============================================================================

interface BulkActionsBarProps {
  selectedCount: number;
  onClear: () => void;
  children: React.ReactNode;
}

export function BulkActionsBar({ selectedCount, onClear, children }: BulkActionsBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-[#0a84ff]/10 border border-[#0a84ff]/50 rounded-xl mb-4">
      <div className="flex items-center gap-3">
        <span className="text-sm text-white font-medium">
          {selectedCount} item{selectedCount !== 1 ? "s" : ""} selected
        </span>
        <button
          onClick={onClear}
          className="text-sm text-[#8e8e93] hover:text-white"
        >
          Clear selection
        </button>
      </div>
      <div className="flex items-center gap-2">
        {children}
      </div>
    </div>
  );
}

export default VirtualizedTable;

