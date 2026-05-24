import { useWorkbenchStore } from "../store/workbench-store.js";
import { useWorkspaceStore } from "../store/workspace-store.js";
import { FlowEditorSurface } from "./flow-editor-surface.js";
import { TextFilePreview } from "./text-file-preview.js";
import { BinaryPlaceholder } from "./binary-placeholder.js";
import { TabBar } from "./tab-bar.js";
import { SURFACE, TEXT, TYPO } from "./workbench-tokens.js";

/**
 * CenterWorkspace — the main content area containing tabs and editor.
 *
 * Layout invariant: fills the center column of the workbench.
 * Must NOT set width — the workbench shell's PanelGroup controls that.
 */

export function CenterWorkspace() {
  const activeFlowPath = useWorkspaceStore((s) => s.activeFlowPath);
  const documents = useWorkspaceStore((s) => s.documents);

  const activeDoc = activeFlowPath ? documents.get(activeFlowPath) : null;

  // Choose the right editor based on document type
  let editorContent: React.ReactNode;
  if (!activeDoc) {
    editorContent = <EmptyState />;
  } else if (activeDoc.docType === "binary") {
    editorContent = <BinaryPlaceholder filePath={activeDoc.flowPath} />;
  } else if (activeDoc.docType === "text") {
    editorContent = (
      <TextFilePreview content={activeDoc.yamlSource} filePath={activeDoc.flowPath} />
    );
  } else {
    // docType === "flow"
    editorContent = <FlowEditorSurface key={activeDoc.flowPath} flowPath={activeDoc.flowPath} />;
  }

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: SURFACE.editor,
        overflow: "hidden",
      }}
    >
      {/* Tab bar */}
      <TabBar />

      {/* Editor fills remaining space */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {editorContent}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: TEXT.muted,
        fontSize: TYPO.fontSize,
      }}
    >
      Open a flow from the Explorer to start editing
    </div>
  );
}