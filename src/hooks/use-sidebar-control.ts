'use client';

import { useCallback, useEffect, useRef } from 'react';

import { useSidebar } from '@/components/ui/sidebar';

export interface UseSidebarControlOptions {
  /**
   * Automatically hide the sidebar when the component mounts
   * and restore it when unmounting.
   * @default true
   */
  autoHide?: boolean;

  /**
   * The state to restore when unmounting.
   * If not provided, restores the previous state before mounting.
   * @default undefined (restores previous state)
   */
  restoreState?: boolean;
}

export interface UseSidebarControlReturn {
  /** Whether the sidebar is currently open */
  isOpen: boolean;
  /** Open the sidebar */
  open: () => void;
  /** Close the sidebar */
  close: () => void;
  /** Toggle the sidebar open/closed */
  toggle: () => void;
  /** Set the sidebar to a specific state */
  setOpen: (open: boolean) => void;
}

/**
 * Hook for controlling sidebar visibility with auto-hide support.
 * Automatically hides the sidebar on mount and restores it on unmount.
 * Also provides manual control methods.
 *
 * @example
 * ```tsx
 * // Auto-hide on mount, restore on unmount
 * const sidebar = useSidebarControl();
 *
 * // Manual control only
 * const sidebar = useSidebarControl({ autoHide: false });
 *
 * // Auto-hide with custom restore state
 * const sidebar = useSidebarControl({ restoreState: true });
 * ```
 */
export function useSidebarControl(
  options: UseSidebarControlOptions = {},
): UseSidebarControlReturn {
  const { autoHide = true, restoreState } = options;
  const { open: isOpen, setOpen: setSidebarOpen, toggleSidebar } = useSidebar();
  const previousStateRef = useRef<boolean>(isOpen);

  useEffect(() => {
    if (!autoHide) return;

    // Store the current state before hiding
    previousStateRef.current = isOpen;

    // Hide the sidebar
    setSidebarOpen(false);

    // Restore the state when unmounting
    return () => {
      const targetState = restoreState ?? previousStateRef.current;
      setSidebarOpen(targetState);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount/unmount

  const open = useCallback(() => {
    setSidebarOpen(true);
  }, [setSidebarOpen]);

  const close = useCallback(() => {
    setSidebarOpen(false);
  }, [setSidebarOpen]);

  const toggle = useCallback(() => {
    toggleSidebar();
  }, [toggleSidebar]);

  return {
    isOpen,
    open,
    close,
    toggle,
    setOpen: setSidebarOpen,
  };
}

/**
 * Automatically hides the sidebar when the component mounts
 * and restores it to its previous state when unmounting.
 * The sidebar can still be toggled manually via the trigger button.
 *
 * @deprecated Use `useSidebarControl()` instead for more control options
 */
export function useHideSidebar() {
  useSidebarControl({ autoHide: true });
}
