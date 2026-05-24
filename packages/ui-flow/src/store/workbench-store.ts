import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * WorkbenchStore — Zustand store for shell chrome state only.
 *
 * OWNS: panel visibility, active sidebar views, panel sizes, layout persistence.
 * DOES NOT OWN: flow document content, run state, chat messages.
 *
 * Persistence: renderer-local localStorage only.
 * No layout IPC channels or backend APIs.
 */

/** Left sidebar view identifiers */
export type LeftViewId = "workspace" | "explorer" | "preview" | "settings";

/** Right sidebar view identifiers */
export type RightViewId = "assistant" | "run-detail";

/** Panel size configuration (percentage) */
export interface PanelSizes {
  leftWidth: number;
  rightWidth: number;
  bottomHeight: number;
}

export interface WorkbenchState {
  /** Whether left sidebar is visible */
  leftSidebarVisible: boolean;
  /** Whether right sidebar is visible */
  rightSidebarVisible: boolean;
  /** Whether bottom preview panel is visible */
  bottomPanelVisible: boolean;
  /** Active left sidebar view */
  activeLeftView: LeftViewId;
  /** Active right sidebar view */
  activeRightView: RightViewId;
  /** Persisted panel sizes */
  panelSizes: PanelSizes;
}

export interface WorkbenchActions {
  /** Toggle left sidebar visibility */
  toggleLeftSidebar: () => void;
  /** Toggle right sidebar visibility */
  toggleRightSidebar: () => void;
  /** Toggle bottom panel visibility */
  toggleBottomPanel: () => void;
  /** Set active left sidebar view */
  setActiveLeftView: (view: LeftViewId) => void;
  /** Set active right sidebar view */
  setActiveRightView: (view: RightViewId) => void;
  /** Update panel sizes */
  setPanelSizes: (sizes: Partial<PanelSizes>) => void;
}

export type WorkbenchStore = WorkbenchState & WorkbenchActions;

const DEFAULT_PANEL_SIZES: PanelSizes = {
  leftWidth: 20,
  rightWidth: 25,
  bottomHeight: 30,
};

export const useWorkbenchStore = create<WorkbenchStore>()(
  persist(
    (set) => ({
      leftSidebarVisible: true,
      rightSidebarVisible: true,
      bottomPanelVisible: false,
      activeLeftView: "explorer",
      activeRightView: "assistant",
      panelSizes: DEFAULT_PANEL_SIZES,

      toggleLeftSidebar: () =>
        set((s) => ({ leftSidebarVisible: !s.leftSidebarVisible })),

      toggleRightSidebar: () =>
        set((s) => ({ rightSidebarVisible: !s.rightSidebarVisible })),

      toggleBottomPanel: () =>
        set((s) => ({ bottomPanelVisible: !s.bottomPanelVisible })),

      setActiveLeftView: (view) =>
        set({ activeLeftView: view, leftSidebarVisible: true }),

      setActiveRightView: (view) =>
        set({ activeRightView: view, rightSidebarVisible: true }),

      setPanelSizes: (sizes) =>
        set((s) => ({ panelSizes: { ...s.panelSizes, ...sizes } })),
    }),
    {
      name: "agentsflow-workbench-layout",
      // Only persist chrome state, not transient UI flags
      partialize: (state) => ({
        leftSidebarVisible: state.leftSidebarVisible,
        rightSidebarVisible: state.rightSidebarVisible,
        bottomPanelVisible: state.bottomPanelVisible,
        activeLeftView: state.activeLeftView,
        activeRightView: state.activeRightView,
        panelSizes: state.panelSizes,
      }),
    },
  ),
);