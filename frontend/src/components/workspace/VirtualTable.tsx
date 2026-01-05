"use client";

import React, { useState, useRef, useCallback, useMemo, useEffect, memo } from 'react';

// =============================================================================
// TYPES
// =============================================================================

export interface ColumnDef<T> {
  id: string;
  header: string;
  accessor: keyof T | ((row: T) => any);
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  sortable?: boolean;
  editable?: boolean;
  renderCell?: (value: any, row: T, rowIndex: number) => React.ReactNode;
  renderEditor?: (value: any, onChange: (val: any) => void, onBlur: () => void) => React.ReactNode;
}

export interface SortState {
  columnId: string;
  direction: 'asc' | 'desc';
}

export interface VirtualTableProps<T extends { id: string }> {
  data: T[];
  columns: ColumnDef<T>[];
  rowHeight?: number;
  overscan?: number;
  onRowClick?: (row: T, event: React.MouseEvent) => void;
  onRowDoubleClick?: (row: T) => void;
  onCellEdit?: (rowId: string, columnId: string, value: any) => void;
  onSelectionChange?: (selectedIds: Set<string>) => void;
  onSort?: (sort: SortState | null) => void;
  isLoading?: boolean;
  emptyMessage?: string;
  stickyFirstColumn?: boolean;
  enableMultiSelect?: boolean;
  selectedIds?: Set<string>;
  renderBulkActions?: (selectedIds: Set<string>, clearSelection: () => void) => React.ReactNode;
  getRowClassName?: (row: T) => string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_ROW_HEIGHT = 44;
const DEFAULT_OVERSCAN = 5;
const MIN_COLUMN_WIDTH = 80;

// =============================================================================
// VIRTUAL TABLE
// =============================================================================

function VirtualTableInner<T extends { id: string }>({
  data,
  columns,
  rowHeight = DEFAULT_ROW_HEIGHT,
  overscan = DEFAULT_OVERSCAN,
  onRowClick,
  onRowDoubleClick,
  onCellEdit,
  onSelectionChange,
  onSort,
  isLoading,
  emptyMessage = 'No data available',
  stickyFirstColumn = false,
  enableMultiSelect = true,
  selectedIds: controlledSelectedIds,
  renderBulkActions,
  getRowClassName,
}: VirtualTableProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);
  const [internalSelectedIds, setInternalSelectedIds] = useState<Set<string>>(new Set());
  const [sortState, setSortState] = useState<SortState | null>(null);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [editingCell, setEditingCell] = useState<{ rowId: string; columnId: string } | null>(null);
  const [focusedCell, setFocusedCell] = useState<{ rowIndex: number; columnIndex: number } | null>(null);

  const selectedIds = controlledSelectedIds ?? internalSelectedIds;
  const setSelectedIds = controlledSelectedIds ? (ids: Set<string>) => onSelectionChange?.(ids) : setInternalSelectedIds;

  // Resize observer for container
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Calculate visible rows
  const totalHeight = data.length * rowHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endIndex = Math.min(data.length, Math.ceil((scrollTop + containerHeight) / rowHeight) + overscan);
  const visibleData = data.slice(startIndex, endIndex);
  const offsetY = startIndex * rowHeight;

  // Column width management
  const getColumnWidth = useCallback((col: ColumnDef<T>) => {
    return columnWidths[col.id] || col.width || 150;
  }, [columnWidths]);

  const totalWidth = useMemo(() => {
    return columns.reduce((sum, col) => sum + getColumnWidth(col), 0);
  }, [columns, getColumnWidth]);

  // Scroll handler
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // Sort handling
  const handleSort = useCallback((columnId: string) => {
    const col = columns.find(c => c.id === columnId);
    if (!col?.sortable) return;

    const newSort: SortState | null = 
      sortState?.columnId === columnId
        ? sortState.direction === 'asc'
          ? { columnId, direction: 'desc' }
          : null
        : { columnId, direction: 'asc' };

    setSortState(newSort);
    onSort?.(newSort);
  }, [columns, sortState, onSort]);

  // Selection handling
  const handleRowSelect = useCallback((rowId: string, event: React.MouseEvent | React.KeyboardEvent) => {
    if (!enableMultiSelect) {
      setSelectedIds(new Set([rowId]));
      return;
    }

    const isShift = event.shiftKey;
    const isCtrl = event.ctrlKey || event.metaKey;

    const newSet = new Set(selectedIds);
    if (isCtrl) {
      if (newSet.has(rowId)) {
        newSet.delete(rowId);
      } else {
        newSet.add(rowId);
      }
    } else if (isShift && selectedIds.size > 0) {
      // Range select
      const lastSelected = Array.from(selectedIds).pop()!;
      const lastIndex = data.findIndex(r => r.id === lastSelected);
      const currentIndex = data.findIndex(r => r.id === rowId);
      const [start, end] = lastIndex < currentIndex ? [lastIndex, currentIndex] : [currentIndex, lastIndex];
      for (let i = start; i <= end; i++) {
        newSet.add(data[i].id);
      }
      setSelectedIds(newSet);
    } else {
      setSelectedIds(new Set([rowId]));
    }
  }, [data, enableMultiSelect, setSelectedIds, selectedIds]);

  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === data.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(data.map(r => r.id)));
    }
  }, [data, selectedIds.size, setSelectedIds]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, [setSelectedIds]);

  // Cell editing
  const startEditing = useCallback((rowId: string, columnId: string) => {
    const col = columns.find(c => c.id === columnId);
    if (!col?.editable) return;
    setEditingCell({ rowId, columnId });
  }, [columns]);

  const stopEditing = useCallback(() => {
    setEditingCell(null);
  }, []);

  const handleCellChange = useCallback((rowId: string, columnId: string, value: any) => {
    onCellEdit?.(rowId, columnId, value);
    stopEditing();
  }, [onCellEdit, stopEditing]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!focusedCell) return;

    const { rowIndex, columnIndex } = focusedCell;

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        if (rowIndex > 0) {
          setFocusedCell({ rowIndex: rowIndex - 1, columnIndex });
        }
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (rowIndex < data.length - 1) {
          setFocusedCell({ rowIndex: rowIndex + 1, columnIndex });
        }
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (columnIndex > 0) {
          setFocusedCell({ rowIndex, columnIndex: columnIndex - 1 });
        }
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (columnIndex < columns.length - 1) {
          setFocusedCell({ rowIndex, columnIndex: columnIndex + 1 });
        }
        break;
      case 'Enter':
        e.preventDefault();
        const row = data[rowIndex];
        const col = columns[columnIndex];
        if (col.editable) {
          startEditing(row.id, col.id);
        }
        break;
      case 'Escape':
        stopEditing();
        break;
      case ' ':
        e.preventDefault();
        const selectedRow = data[rowIndex];
        handleRowSelect(selectedRow.id, e);
        break;
      case 'Tab':
        e.preventDefault();
        if (e.shiftKey) {
          if (columnIndex > 0) {
            setFocusedCell({ rowIndex, columnIndex: columnIndex - 1 });
          } else if (rowIndex > 0) {
            setFocusedCell({ rowIndex: rowIndex - 1, columnIndex: columns.length - 1 });
          }
        } else {
          if (columnIndex < columns.length - 1) {
            setFocusedCell({ rowIndex, columnIndex: columnIndex + 1 });
          } else if (rowIndex < data.length - 1) {
            setFocusedCell({ rowIndex: rowIndex + 1, columnIndex: 0 });
          }
        }
        break;
    }
  }, [focusedCell, data.length, columns, startEditing, stopEditing, handleRowSelect, data]);

  // Column resize
  const handleColumnResize = useCallback((columnId: string, delta: number) => {
    setColumnWidths(prev => {
      const col = columns.find(c => c.id === columnId);
      const currentWidth = prev[columnId] || col?.width || 150;
      const newWidth = Math.max(col?.minWidth || MIN_COLUMN_WIDTH, Math.min(col?.maxWidth || 500, currentWidth + delta));
      return { ...prev, [columnId]: newWidth };
    });
  }, [columns]);

  // Get cell value
  const getCellValue = useCallback((row: T, col: ColumnDef<T>) => {
    if (typeof col.accessor === 'function') {
      return col.accessor(row);
    }
    return row[col.accessor];
  }, []);

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="h-10 bg-muted/50 border-b border-border animate-pulse" />
        <div className="flex-1 space-y-1 p-2">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="h-10 bg-muted/30 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
        </div>
        <p className="text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" onKeyDown={handleKeyDown} tabIndex={0}>
      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && renderBulkActions && (
        <div className="h-12 px-4 flex items-center gap-4 bg-accent/10 border-b border-accent/20 shrink-0">
          <span className="text-sm font-medium text-accent">
            {selectedIds.size} selected
          </span>
          {renderBulkActions(selectedIds, clearSelection)}
          <button onClick={clearSelection} className="ml-auto text-sm text-muted-foreground hover:text-foreground">
            Clear selection
          </button>
        </div>
      )}

      {/* Table Container */}
      <div className="flex-1 overflow-hidden">
        <div
          ref={containerRef}
          className="h-full overflow-auto"
          onScroll={handleScroll}
        >
          {/* Header */}
          <div
            className="sticky top-0 z-10 flex bg-muted/80 backdrop-blur-sm border-b border-border"
            style={{ width: totalWidth }}
          >
            {/* Select All Checkbox */}
            {enableMultiSelect && (
              <div className="w-10 shrink-0 flex items-center justify-center border-r border-border">
                <input
                  type="checkbox"
                  checked={selectedIds.size === data.length}
                  onChange={handleSelectAll}
                  className="w-4 h-4 rounded border-border"
                />
              </div>
            )}

            {columns.map((col, colIndex) => (
              <div
                key={col.id}
                className={`flex items-center px-3 h-10 border-r border-border last:border-r-0 relative group ${
                  col.sortable ? 'cursor-pointer hover:bg-muted' : ''
                } ${stickyFirstColumn && colIndex === 0 ? 'sticky left-0 z-20 bg-muted' : ''}`}
                style={{ width: getColumnWidth(col), minWidth: col.minWidth || MIN_COLUMN_WIDTH }}
                onClick={() => handleSort(col.id)}
              >
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider truncate">
                  {col.header}
                </span>
                {sortState?.columnId === col.id && (
                  <span className="ml-1 text-accent">
                    {sortState.direction === 'asc' ? '↑' : '↓'}
                  </span>
                )}
                {/* Column Resize Handle */}
                <div
                  className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent opacity-0 group-hover:opacity-100"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    const startX = e.clientX;
                    const handleMove = (me: MouseEvent) => {
                      handleColumnResize(col.id, me.clientX - startX);
                    };
                    const handleUp = () => {
                      document.removeEventListener('mousemove', handleMove);
                      document.removeEventListener('mouseup', handleUp);
                    };
                    document.addEventListener('mousemove', handleMove);
                    document.addEventListener('mouseup', handleUp);
                  }}
                />
              </div>
            ))}
          </div>

          {/* Virtual Rows */}
          <div style={{ height: totalHeight, position: 'relative' }}>
            <div style={{ transform: `translateY(${offsetY}px)` }}>
              {visibleData.map((row, localIndex) => {
                const globalIndex = startIndex + localIndex;
                const isSelected = selectedIds.has(row.id);
                const rowClassName = getRowClassName?.(row) || '';

                return (
                  <VirtualRow
                    key={row.id}
                    row={row}
                    columns={columns}
                    rowIndex={globalIndex}
                    rowHeight={rowHeight}
                    isSelected={isSelected}
                    isFocused={focusedCell?.rowIndex === globalIndex}
                    focusedColumnIndex={focusedCell?.rowIndex === globalIndex ? focusedCell.columnIndex : null}
                    editingCell={editingCell}
                    stickyFirstColumn={stickyFirstColumn}
                    enableMultiSelect={enableMultiSelect}
                    getColumnWidth={getColumnWidth}
                    getCellValue={getCellValue}
                    onRowClick={onRowClick}
                    onRowDoubleClick={onRowDoubleClick}
                    onRowSelect={handleRowSelect}
                    onCellClick={(colIndex) => setFocusedCell({ rowIndex: globalIndex, columnIndex: colIndex })}
                    onCellDoubleClick={startEditing}
                    onCellChange={handleCellChange}
                    onEditBlur={stopEditing}
                    className={rowClassName}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="h-8 px-4 flex items-center justify-between bg-muted/30 border-t border-border text-xs text-muted-foreground shrink-0">
        <span>{data.length.toLocaleString()} rows</span>
        <span>Scroll position: {Math.round((scrollTop / totalHeight) * 100)}%</span>
      </div>
    </div>
  );
}

// =============================================================================
// VIRTUAL ROW (Memoized)
// =============================================================================

interface VirtualRowProps<T extends { id: string }> {
  row: T;
  columns: ColumnDef<T>[];
  rowIndex: number;
  rowHeight: number;
  isSelected: boolean;
  isFocused: boolean;
  focusedColumnIndex: number | null;
  editingCell: { rowId: string; columnId: string } | null;
  stickyFirstColumn: boolean;
  enableMultiSelect: boolean;
  getColumnWidth: (col: ColumnDef<T>) => number;
  getCellValue: (row: T, col: ColumnDef<T>) => any;
  onRowClick?: (row: T, event: React.MouseEvent) => void;
  onRowDoubleClick?: (row: T) => void;
  onRowSelect: (rowId: string, event: React.MouseEvent | React.KeyboardEvent) => void;
  onCellClick: (colIndex: number) => void;
  onCellDoubleClick: (rowId: string, columnId: string) => void;
  onCellChange: (rowId: string, columnId: string, value: any) => void;
  onEditBlur: () => void;
  className?: string;
}

const VirtualRow = memo(function VirtualRow<T extends { id: string }>({
  row,
  columns,
  rowIndex,
  rowHeight,
  isSelected,
  isFocused,
  focusedColumnIndex,
  editingCell,
  stickyFirstColumn,
  enableMultiSelect,
  getColumnWidth,
  getCellValue,
  onRowClick,
  onRowDoubleClick,
  onRowSelect,
  onCellClick,
  onCellDoubleClick,
  onCellChange,
  onEditBlur,
  className,
}: VirtualRowProps<T>) {
  return (
    <div
      className={`flex border-b border-border hover:bg-muted/50 transition-colors ${
        isSelected ? 'bg-accent/10' : ''
      } ${isFocused ? 'ring-1 ring-inset ring-accent' : ''} ${className}`}
      style={{ height: rowHeight }}
      onClick={(e) => onRowClick?.(row, e)}
      onDoubleClick={() => onRowDoubleClick?.(row)}
    >
      {/* Selection Checkbox */}
      {enableMultiSelect && (
        <div className="w-10 shrink-0 flex items-center justify-center border-r border-border">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => onRowSelect(row.id, e as any)}
            onClick={(e) => e.stopPropagation()}
            className="w-4 h-4 rounded border-border"
          />
        </div>
      )}

      {columns.map((col, colIndex) => {
        const value = getCellValue(row, col);
        const isEditing = editingCell?.rowId === row.id && editingCell?.columnId === col.id;
        const isCellFocused = focusedColumnIndex === colIndex;

        return (
          <div
            key={col.id}
            className={`flex items-center px-3 border-r border-border last:border-r-0 overflow-hidden ${
              stickyFirstColumn && colIndex === 0 ? 'sticky left-0 z-10 bg-background' : ''
            } ${isCellFocused ? 'ring-1 ring-inset ring-accent/50' : ''}`}
            style={{ width: getColumnWidth(col), minWidth: col.minWidth || MIN_COLUMN_WIDTH }}
            onClick={(e) => {
              e.stopPropagation();
              onCellClick(colIndex);
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onCellDoubleClick(row.id, col.id);
            }}
          >
            {isEditing && col.renderEditor ? (
              col.renderEditor(
                value,
                (newVal) => onCellChange(row.id, col.id, newVal),
                onEditBlur
              )
            ) : isEditing && col.editable ? (
              <input
                type="text"
                defaultValue={value}
                autoFocus
                className="w-full h-full bg-transparent border-none outline-none text-sm"
                onBlur={(e) => {
                  onCellChange(row.id, col.id, e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onCellChange(row.id, col.id, e.currentTarget.value);
                  } else if (e.key === 'Escape') {
                    onEditBlur();
                  }
                }}
              />
            ) : col.renderCell ? (
              col.renderCell(value, row, rowIndex)
            ) : (
              <span className="text-sm text-foreground truncate">{String(value ?? '')}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}) as <T extends { id: string }>(props: VirtualRowProps<T>) => React.ReactElement;

// =============================================================================
// EXPORT
// =============================================================================

export const VirtualTable = memo(VirtualTableInner) as typeof VirtualTableInner;
export default VirtualTable;

