import { useWorkbenchStore, type RightViewId } from "../store/workbench-store.js";
import { SURFACE, BORDER, TEXT, SPACING, TYPO, ACCENT, BUTTON } from "./workbench-tokens.js";
import { useButtonHover } from "./use-button-hover.js";

/**
 * AssistantPanel — copilot-like chat panel on the right sidebar.
 *
 * This is a UI shell only: it renders a header, message area, and input.
 * The actual chat backend is out of scope — this component defines the
 * state protocol and view modes.
 *
 * Layout invariant: fills the right sidebar panel.
 * Must NOT set width — the sidebar panel controls that.
 */

interface ChatMessage {
  readonly role: "user" | "assistant" | "system";
  readonly content: string;
}

const VIEW_MODES: ReadonlyArray<{ id: RightViewId; label: string }> = [
  { id: "assistant", label: "Assistant" },
  { id: "run-detail", label: "Run Detail" },
];

export function AssistantPanel() {
  const activeRightView = useWorkbenchStore((s) => s.activeRightView);
  const setActiveRightView = useWorkbenchStore((s) => s.setActiveRightView);
  const assistantTabBtn = useButtonHover();
  const runDetailTabBtn = useButtonHover();
  const tabHoverMap = {
    assistant: assistantTabBtn,
    "run-detail": runDetailTabBtn,
  } as const;

  return (
    <div
      style={{
        height: "100%",
        background: SURFACE.assistant,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* View mode tabs */}
      <div
        style={{
          display: "flex",
          borderBottom: `1px solid ${BORDER.default}`,
          flexShrink: 0,
        }}
      >
        {VIEW_MODES.map((mode) => {
          const isActive = activeRightView === mode.id;
          const { hoverBg, hoverProps, isHovered, buttonStyle } = tabHoverMap[mode.id];
          // Four-state background: active+hovered → BUTTON.activeBg, active+not-hovered → SURFACE.sidebar,
          // inactive+hovered → BUTTON.hoverBg, inactive+not-hovered → transparent
          const bg = isActive
            ? (isHovered ? BUTTON.activeBg : SURFACE.sidebar)
            : hoverBg;
          return (
            <button
              key={mode.id}
              onClick={() => setActiveRightView(mode.id)}
              style={{
                ...buttonStyle,
                padding: `${SPACING.sm}px ${SPACING.md}px`,
                background: bg,
                borderBottom:
                  activeRightView === mode.id
                    ? `2px solid ${BORDER.active}`
                    : "2px solid transparent",
                color: activeRightView === mode.id ? TEXT.primary : buttonStyle.color,
                fontSize: TYPO.smallFontSize,
                fontWeight: 600,
              }}
              {...hoverProps}
            >
              {mode.label}
            </button>
          );
        })}
      </div>

      {/* Content area */}
      {activeRightView === "assistant" ? <AssistantChat /> : <RunDetail />}
    </div>
  );
}

function AssistantChat() {
  // Placeholder messages — real chat backend is out of scope
  const messages: readonly ChatMessage[] = [
    { role: "system", content: "Ask about your flows, agents, or runs." },
  ];

  return (
    <>
      {/* Message body */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: SPACING.md,
          display: "flex",
          flexDirection: "column",
          gap: SPACING.sm,
        }}
      >
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              padding: `${SPACING.sm}px ${SPACING.md}px`,
              background:
                msg.role === "user"
                  ? ACCENT.indigo + "26"  // 15% opacity hex suffix
                  : msg.role === "system"
                    ? TEXT.muted + "1a"   // 10% opacity hex suffix
                    : SURFACE.sidebar,
              borderRadius: 6,
              fontSize: TYPO.fontSize,
              color: TEXT.primary,
            }}
          >
            {msg.content}
          </div>
        ))}
      </div>

      {/* Input area */}
      <div
        style={{
          padding: SPACING.sm,
          borderTop: `1px solid ${BORDER.default}`,
          flexShrink: 0,
        }}
      >
        <input
          type="text"
          placeholder="Ask about your flow…"
          style={{
            width: "100%",
            padding: `${SPACING.sm}px ${SPACING.md}px`,
            background: SURFACE.sidebar,
            border: `1px solid ${BORDER.default}`,
            borderRadius: 6,
            color: TEXT.primary,
            fontSize: TYPO.fontSize,
            outline: "none",
          }}
        />
      </div>
    </>
  );
}

function RunDetail() {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: TEXT.muted,
        fontSize: TYPO.fontSize,
        padding: SPACING.md,
      }}
    >
      Select a running flow to see details
    </div>
  );
}