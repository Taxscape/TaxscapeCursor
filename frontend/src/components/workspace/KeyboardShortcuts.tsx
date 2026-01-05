"use client";

import React, { createContext, useContext, useCallback, useEffect, useState, useRef } from 'react';

// =============================================================================
// TYPES
// =============================================================================

export interface Shortcut {
  id: string;
  keys: string[]; // e.g., ['ctrl', 'k'] or ['cmd', 'shift', 'p']
  description: string;
  category: 'navigation' | 'actions' | 'editing' | 'views' | 'global';
  action: () => void;
  enabled?: boolean;
  requiredPermissions?: string[];
}

interface ShortcutRegistryContextValue {
  shortcuts: Map<string, Shortcut>;
  registerShortcut: (shortcut: Shortcut) => () => void;
  unregisterShortcut: (id: string) => void;
  isHelpOpen: boolean;
  openHelp: () => void;
  closeHelp: () => void;
  toggleHelp: () => void;
}

// =============================================================================
// CONTEXT
// =============================================================================

const ShortcutRegistryContext = createContext<ShortcutRegistryContextValue | null>(null);

export const useShortcuts = () => {
  const ctx = useContext(ShortcutRegistryContext);
  if (!ctx) throw new Error('useShortcuts must be used within ShortcutRegistryProvider');
  return ctx;
};

// =============================================================================
// UTILS
// =============================================================================

const normalizeKey = (key: string): string => {
  const lower = key.toLowerCase();
  if (lower === 'meta' || lower === 'cmd' || lower === 'command') return 'meta';
  if (lower === 'ctrl' || lower === 'control') return 'ctrl';
  if (lower === 'alt' || lower === 'option') return 'alt';
  if (lower === 'esc') return 'escape';
  return lower;
};

const getEventKeys = (e: KeyboardEvent): Set<string> => {
  const keys = new Set<string>();
  if (e.ctrlKey) keys.add('ctrl');
  if (e.metaKey) keys.add('meta');
  if (e.altKey) keys.add('alt');
  if (e.shiftKey) keys.add('shift');
  keys.add(normalizeKey(e.key));
  return keys;
};

const matchesShortcut = (eventKeys: Set<string>, shortcutKeys: string[]): boolean => {
  const normalizedShortcutKeys = shortcutKeys.map(normalizeKey);
  if (eventKeys.size !== normalizedShortcutKeys.length) return false;
  return normalizedShortcutKeys.every(k => eventKeys.has(k));
};

const formatShortcutKeys = (keys: string[]): string => {
  const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  return keys.map(k => {
    const normalized = normalizeKey(k);
    if (normalized === 'meta') return isMac ? '⌘' : 'Ctrl';
    if (normalized === 'ctrl') return isMac ? '⌃' : 'Ctrl';
    if (normalized === 'alt') return isMac ? '⌥' : 'Alt';
    if (normalized === 'shift') return '⇧';
    if (normalized === 'escape') return 'Esc';
    if (normalized === 'enter') return '↵';
    if (normalized === 'backspace') return '⌫';
    if (normalized === 'arrowup') return '↑';
    if (normalized === 'arrowdown') return '↓';
    if (normalized === 'arrowleft') return '←';
    if (normalized === 'arrowright') return '→';
    return k.toUpperCase();
  }).join(' ');
};

// =============================================================================
// PROVIDER
// =============================================================================

export const ShortcutRegistryProvider: React.FC<{ children: React.ReactNode; userPermissions?: string[] }> = ({
  children,
  userPermissions = [],
}) => {
  const [shortcuts, setShortcuts] = useState<Map<string, Shortcut>>(new Map());
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  const registerShortcut = useCallback((shortcut: Shortcut) => {
    setShortcuts(prev => {
      const next = new Map(prev);
      next.set(shortcut.id, shortcut);
      return next;
    });
    return () => {
      setShortcuts(prev => {
        const next = new Map(prev);
        next.delete(shortcut.id);
        return next;
      });
    };
  }, []);

  const unregisterShortcut = useCallback((id: string) => {
    setShortcuts(prev => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const openHelp = useCallback(() => setIsHelpOpen(true), []);
  const closeHelp = useCallback(() => setIsHelpOpen(false), []);
  const toggleHelp = useCallback(() => setIsHelpOpen(prev => !prev), []);

  // Global keyboard listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture shortcuts when typing in inputs
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        // Allow escape to still work
        if (e.key !== 'Escape') return;
      }

      const eventKeys = getEventKeys(e);

      for (const shortcut of shortcutsRef.current.values()) {
        if (shortcut.enabled === false) continue;
        
        // Check permissions
        if (shortcut.requiredPermissions?.length) {
          const hasPermission = shortcut.requiredPermissions.every(p => userPermissions.includes(p));
          if (!hasPermission) continue;
        }

        if (matchesShortcut(eventKeys, shortcut.keys)) {
          e.preventDefault();
          e.stopPropagation();
          shortcut.action();
          return;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [userPermissions]);

  const value: ShortcutRegistryContextValue = {
    shortcuts,
    registerShortcut,
    unregisterShortcut,
    isHelpOpen,
    openHelp,
    closeHelp,
    toggleHelp,
  };

  return (
    <ShortcutRegistryContext.Provider value={value}>
      {children}
    </ShortcutRegistryContext.Provider>
  );
};

// =============================================================================
// HOOK: useRegisterShortcut
// =============================================================================

export const useRegisterShortcut = (shortcut: Omit<Shortcut, 'action'> & { action: () => void }) => {
  const { registerShortcut } = useShortcuts();

  useEffect(() => {
    const unregister = registerShortcut(shortcut);
    return unregister;
  }, [shortcut.id, shortcut.keys.join(','), shortcut.enabled]);
};

// =============================================================================
// SHORTCUT HELP MODAL
// =============================================================================

export const ShortcutHelpModal: React.FC = () => {
  const { shortcuts, isHelpOpen, closeHelp } = useShortcuts();

  if (!isHelpOpen) return null;

  // Group shortcuts by category
  const grouped = Array.from(shortcuts.values()).reduce((acc, s) => {
    if (!acc[s.category]) acc[s.category] = [];
    acc[s.category].push(s);
    return acc;
  }, {} as Record<string, Shortcut[]>);

  const categoryLabels: Record<string, string> = {
    global: 'Global',
    navigation: 'Navigation',
    actions: 'Actions',
    editing: 'Editing',
    views: 'Views',
  };

  const categoryOrder = ['global', 'navigation', 'views', 'actions', 'editing'];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={closeHelp}
    >
      <div
        className="bg-card w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-2xl shadow-2xl border border-border"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 p-6 border-b border-border bg-card z-10">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-foreground">Keyboard Shortcuts</h2>
            <button
              onClick={closeHelp}
              className="p-2 hover:bg-muted rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Press <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">?</kbd> to toggle this menu
          </p>
        </div>

        <div className="p-6 space-y-8">
          {categoryOrder.map(category => {
            const items = grouped[category];
            if (!items?.length) return null;

            return (
              <div key={category}>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  {categoryLabels[category] || category}
                </h3>
                <div className="space-y-2">
                  {items.map(shortcut => (
                    <div
                      key={shortcut.id}
                      className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50"
                    >
                      <span className="text-sm text-foreground">{shortcut.description}</span>
                      <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono text-muted-foreground">
                        {formatShortcutKeys(shortcut.keys)}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// COMMAND PALETTE
// =============================================================================

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  shortcut?: string[];
  action: () => void;
  category?: string;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: CommandItem[];
  placeholder?: string;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  commands,
  placeholder = 'Search commands...',
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredCommands = commands.filter(cmd =>
    cmd.label.toLowerCase().includes(query.toLowerCase()) ||
    cmd.description?.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      inputRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, filteredCommands.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          filteredCommands[selectedIndex].action();
          onClose();
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh] bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-card w-full max-w-xl rounded-xl shadow-2xl border border-border overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-muted-foreground shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="flex-1 bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground"
            />
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono text-muted-foreground">Esc</kbd>
          </div>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto">
          {filteredCommands.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No commands found
            </div>
          ) : (
            <div className="py-2">
              {filteredCommands.map((cmd, index) => (
                <button
                  key={cmd.id}
                  className={`w-full px-4 py-3 flex items-center gap-3 text-left transition-colors ${
                    index === selectedIndex ? 'bg-accent/10 text-accent' : 'hover:bg-muted/50'
                  }`}
                  onClick={() => {
                    cmd.action();
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  {cmd.icon && <span className="shrink-0">{cmd.icon}</span>}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-foreground truncate">{cmd.label}</div>
                    {cmd.description && (
                      <div className="text-xs text-muted-foreground truncate">{cmd.description}</div>
                    )}
                  </div>
                  {cmd.shortcut && (
                    <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono text-muted-foreground shrink-0">
                      {formatShortcutKeys(cmd.shortcut)}
                    </kbd>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// DEFAULT SHORTCUTS HOOK
// =============================================================================

export const useDefaultShortcuts = (options: {
  onOpenCommandPalette?: () => void;
  onOpenHelp?: () => void;
  onToggleCopilot?: () => void;
  onCreateTask?: () => void;
  onSwitchClient?: () => void;
  onGlobalSearch?: () => void;
  onNavigateTasks?: () => void;
  onNavigateDashboard?: () => void;
  onNavigateProjects?: () => void;
  userRole?: string;
}) => {
  const { registerShortcut, toggleHelp } = useShortcuts();

  useEffect(() => {
    const unregisters: (() => void)[] = [];

    // Help
    unregisters.push(registerShortcut({
      id: 'show-help',
      keys: ['?'],
      description: 'Show keyboard shortcuts',
      category: 'global',
      action: options.onOpenHelp || toggleHelp,
    }));

    // Command Palette
    if (options.onOpenCommandPalette) {
      unregisters.push(registerShortcut({
        id: 'command-palette',
        keys: ['meta', 'k'],
        description: 'Open command palette',
        category: 'global',
        action: options.onOpenCommandPalette,
      }));
    }

    // Global Search
    if (options.onGlobalSearch) {
      unregisters.push(registerShortcut({
        id: 'global-search',
        keys: ['meta', '/'],
        description: 'Global search',
        category: 'global',
        action: options.onGlobalSearch,
      }));
    }

    // Copilot Toggle
    if (options.onToggleCopilot) {
      unregisters.push(registerShortcut({
        id: 'toggle-copilot',
        keys: ['meta', 'j'],
        description: 'Toggle AI Copilot',
        category: 'global',
        action: options.onToggleCopilot,
      }));
    }

    // Create Task
    if (options.onCreateTask) {
      unregisters.push(registerShortcut({
        id: 'create-task',
        keys: ['meta', 'shift', 't'],
        description: 'Create new task',
        category: 'actions',
        action: options.onCreateTask,
        requiredPermissions: ['task.create'],
      }));
    }

    // Switch Client
    if (options.onSwitchClient) {
      unregisters.push(registerShortcut({
        id: 'switch-client',
        keys: ['meta', 'shift', 'c'],
        description: 'Switch client',
        category: 'navigation',
        action: options.onSwitchClient,
      }));
    }

    // Navigation shortcuts
    if (options.onNavigateDashboard) {
      unregisters.push(registerShortcut({
        id: 'nav-dashboard',
        keys: ['g', 'd'],
        description: 'Go to Dashboard',
        category: 'navigation',
        action: options.onNavigateDashboard,
      }));
    }

    if (options.onNavigateProjects) {
      unregisters.push(registerShortcut({
        id: 'nav-projects',
        keys: ['g', 'p'],
        description: 'Go to Projects',
        category: 'navigation',
        action: options.onNavigateProjects,
      }));
    }

    if (options.onNavigateTasks) {
      unregisters.push(registerShortcut({
        id: 'nav-tasks',
        keys: ['g', 't'],
        description: 'Go to Tasks',
        category: 'navigation',
        action: options.onNavigateTasks,
      }));
    }

    return () => {
      unregisters.forEach(fn => fn());
    };
  }, [registerShortcut, toggleHelp, options]);
};

export default ShortcutRegistryProvider;

