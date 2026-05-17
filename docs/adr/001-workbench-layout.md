# ADR-001: VS Code–Style Workbench Layout

**Status**: Accepted  
**Date**: 2025-07-12  
**Updated**: 2026-05-17  
**Scope**: `@agentsflow/ui-flow`

## Context

AgentsFlow previously used a monolithic `FlowEditor` component that combined the flow canvas, YAML editor, and sidebar into a single flat layout. As the app grew, this made it difficult to:

- Add persistent sidebars (explorer, assistant chat) without breaking the canvas
- Support multi-document tabs
- Maintain a clear separation between shell chrome and editor content
- Prevent future contributors from accidentally introducing layout-breaking changes

## Decision

Adopt a **VS Code–style workbench layout** with the following strict component hierarchy:

```
Workbench (sole owner of 100vh × 100vw)
├── Toolbar (fixed height 40px, full width)
│   ├── ☰ toggle left sidebar
│   ├── ▶ Run toggle bottom panel
│   └── 💬 toggle right sidebar
└── PanelGroup (horizontal, fills remaining space)
    ├── Left Sidebar (collapsible, ActivityBar 48px + content pane)
    │   ├── ActivityBar (48px icon strip, always visible)
    │   │   ├── 📁 Explorer view
    │   │   ├── 🔄 Workspace view
    │   │   └── 🔍 Preview view
    │   └── ExplorerPane | WorkspacePane | PreviewPane (switched by activeLeftView)
    ├── Center Workspace (flex: 1)
    │   ├── TabBar (fixed height 35px)
    │   └── PanelGroup (vertical)
    │       ├── FlowEditorSurface (canvas + YAML split)
    │       └── BottomPreview (collapsible, run output)
    └── Right Sidebar (collapsible, assistant chat)
        ├── Tab: Assistant (chat input + messages)
        └── Tab: Run Detail (execution details)
```

### Key files

| File | Responsibility |
|------|---------------|
| `workbench.tsx` | Top-level frame — sole owner of 100vh×100vw; renders left/right panels with `ImperativePanelHandle` refs; switches left sidebar content by `activeLeftView` |
| `workbench-store.ts` | Chrome state (sidebar visibility, active views, panel sizes) — Zustand with `persist` middleware → localStorage key `agentsflow-workbench-layout` |
| `workspace-store.ts` | Multi-document state (flow list, open tabs, per-doc YAML/flow/validation/selection) |
| `workbench-tokens.ts` | Centralized shell styling tokens (SURFACE, BORDER, TEXT, RESIZE_HANDLE, PANEL_CONSTRAINTS, ACTIVITY_BAR, TYPO, SPACING) |
| `toolbar.tsx` | Top bar with branding and ☰/▶/💬 toggle buttons |
| `activity-bar.tsx` | Left icon strip for view switching (📁🔄🔍) |
| `explorer-pane.tsx` | File browser in left sidebar (default view) |
| `workspace-pane.tsx` | Workspace settings placeholder in left sidebar |
| `preview-pane.tsx` | Flow preview placeholder in left sidebar |
| `tab-bar.tsx` | Horizontal tab strip above editor |
| `center-workspace.tsx` | Tabs + editor + collapsible bottom panel; uses `ImperativePanelHandle` for bottom panel |
| `flow-editor-surface.tsx` | Canvas + YAML split (center content only) |
| `bottom-preview.tsx` | Run preview panel below editor (Start/Stop controls) |
| `assistant-panel.tsx` | Right sidebar with Assistant/Run Detail tabs |

### Panel control architecture

Panel collapse/expand uses **`ImperativePanelHandle`** from `react-resizable-panels` (v2.1.9) with `isCollapsed()` guards to prevent infinite loops:

```
Store toggle → useEffect → panel.collapse()/expand() → onCollapse/onExpand callback → store sync
```

The `isCollapsed()` guard breaks the cycle: if the panel is already in the desired state, the imperative call is skipped.

**Critical**: `autoSaveId` is NOT used on any `PanelGroup`. The library's `autoSaveId` persists panel sizes in its own localStorage key, which conflicts with and overrides imperative `collapse()`/`expand()` calls. The Zustand store is the single source of truth for panel visibility.

### View switching

- **Left sidebar**: `activeLeftView: LeftViewId` ("explorer" | "workspace" | "preview") — `setActiveLeftView()` also sets `leftSidebarVisible: true` to auto-expand the sidebar when switching views
- **Right sidebar**: `activeRightView: RightViewId` ("assistant" | "run-detail") — `setActiveRightView()` also sets `rightSidebarVisible: true`
- Workbench renders the correct pane component via `renderLeftSidebarContent(activeLeftView)` switch statement
- `AssistantPanel` internally switches between `AssistantChat` and `RunDetail` sub-components

### Panel constraints (from `workbench-tokens.ts`)

| Panel | defaultSize | minSize | maxSize |
|-------|-------------|---------|---------|
| Left sidebar | 20% | 12% | 40% |
| Right sidebar | 25% | 15% | 45% |
| Bottom panel | 30% | 10% | 60% |

### Layout invariants (MUST NOT be violated)

1. **Workbench is the SOLE owner of `100vh × 100vw`** — no other component sets `height: 100vh` or `width: 100vw`.
2. **No `position: fixed` or `position: absolute`** in any child of Workbench — all layout is driven by `react-resizable-panels`.
3. **Panel visibility is driven ONLY by `WorkbenchStore`** — no component should independently toggle its own visibility.
4. **All dimensions come from `workbench-tokens.ts`** — no magic numbers for heights, widths, or colors in component files.
5. **`CenterWorkspace` owns its internal vertical split** — the bottom panel is a child of CenterWorkspace, not a sibling in the top-level PanelGroup.
6. **Sidebar collapse/expand must sync WorkbenchStore** via `onCollapse`/`onExpand` callbacks on Panel components.
7. **Never use `autoSaveId` on `PanelGroup`** — it conflicts with imperative panel control via `ImperativePanelHandle`.
8. **`isCollapsed()` guard required** before calling `panel.collapse()`/`panel.expand()` in useEffect — prevents infinite store→effect→callback→store loops.

## Consequences

- **Positive**: Clear separation of concerns; shell chrome vs editor content; multi-document support; resizable/collapsible panels with persisted sizes.
- **Positive**: Future LLMs and contributors have explicit guardrails in code comments and copilot-instructions.
- **Positive**: Activity bar view switching works correctly — left sidebar content changes based on `activeLeftView`.
- **Positive**: Panel state persists across page reloads via Zustand `persist` middleware.
- **Negative**: More files and indirection vs the old monolithic FlowEditor.
- **Negative**: `ImperativePanelHandle` refs require careful lifecycle management (null checks, isCollapsed guards).
- **Mitigation**: The legacy `FlowEditor` is kept for backward compatibility but marked as deprecated.

## Migration

- All three app entries (`desktop`, `web`, `studio`) now render `<Workbench />` instead of `<FlowEditor />`.
- `FlowCanvas` was refactored from using `useFlowStore` directly to accepting props (`FlowCanvasProps`), making it reusable in both the legacy and new layouts.
- `FlowEditor` is retained but marked as LEGACY/DEPRECATED.

## Verified behaviors (2026-05-17)

| Feature | Result | Details |
|---------|--------|---------|
| ☰ Left sidebar toggle | ✅ | Collapses to 0%, expands to 20% |
| 💬 Right sidebar toggle | ✅ | Collapses to 0%, expands to 25% |
| ▶ Run bottom panel toggle | ✅ | Collapses to 0%, expands to 30% |
| 📁 Activity bar → Explorer | ✅ | Shows "Explorer" / flow list |
| 🔄 Activity bar → Workspace | ✅ | Shows "Workspace" / placeholder |
| 🔍 Activity bar → Preview | ✅ | Shows "Preview" / placeholder |
| Assistant tab | ✅ | Shows chat interface |
| Run Detail tab | ✅ | Shows "Select a running flow..." |
| State persistence | ✅ | Sidebar states survive page reload |
| Drag resize handles | ✅ | Panels resize between min/max constraints |
