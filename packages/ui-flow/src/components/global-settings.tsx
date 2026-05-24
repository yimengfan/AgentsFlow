import { SURFACE, BORDER, TEXT, SPACING, TYPO, BUTTON } from "./workbench-tokens.js";
import { useSettingsStore } from "../store/settings-store.js";

/**
 * GlobalSettings — application-level settings panel in the left sidebar.
 *
 * Allows the user to configure: default model, transport, tool approval policy,
 * and custom model options. Settings persist via localStorage through Zustand.
 *
 * Layout invariant: fills the sidebar content area (no width/height set).
 */

export function GlobalSettings() {
  const defaultModelId = useSettingsStore((s) => s.defaultModelId);
  const defaultTransport = useSettingsStore((s) => s.defaultTransport);
  const defaultApprovalRequirement = useSettingsStore((s) => s.defaultApprovalRequirement);
  const showAdvancedConfig = useSettingsStore((s) => s.showAdvancedConfig);
  const customModelOptions = useSettingsStore((s) => s.customModelOptions);
  const {
    setDefaultModelId,
    setDefaultTransport,
    setDefaultApprovalRequirement,
    toggleShowAdvancedConfig,
    addCustomModelOption,
    removeCustomModelOption,
    getAllModelOptions,
  } = useSettingsStore();

  const allModels = getAllModelOptions();

  return (
    <div
      style={{
        height: "100%",
        background: SURFACE.sidebar,
        display: "flex",
        flexDirection: "column",
        overflow: "auto",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: `${SPACING.sm}px ${SPACING.md}px`,
          fontSize: TYPO.smallFontSize,
          fontWeight: 600,
          color: TEXT.secondary,
          textTransform: "uppercase",
          letterSpacing: 1,
          borderBottom: `1px solid ${BORDER.default}`,
          flexShrink: 0,
        }}
      >
        Settings
      </div>

      {/* Settings sections */}
      <div style={{ padding: SPACING.md, flex: 1 }}>
        {/* Default Model */}
        <SettingsSection title="默认模型">
          <label style={labelStyle}>
            <span style={{ color: TEXT.primary, fontSize: TYPO.fontSize }}>模型选择</span>
            <select
              value={defaultModelId}
              onChange={(e) => setDefaultModelId(e.target.value)}
              style={selectStyle}
            >
              {allModels.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label} ({opt.provider})
                </option>
              ))}
            </select>
          </label>

          {/* Custom model add */}
          <div style={{ marginTop: SPACING.sm }}>
            <label style={labelStyle}>
              <span style={{ color: TEXT.primary, fontSize: TYPO.fontSize }}>添加自定义模型</span>
              <div style={{ display: "flex", gap: SPACING.xs }}>
                <input
                  id="custom-model-id"
                  placeholder="model-id"
                  style={{ ...inputStyle, flex: 1 }}
                />
                <input
                  id="custom-model-label"
                  placeholder="显示名称"
                  style={{ ...inputStyle, flex: 1 }}
                />
                <input
                  id="custom-model-provider"
                  placeholder="Provider"
                  style={{ ...inputStyle, width: 80 }}
                />
                <button
                  style={addButtonStyle}
                  onClick={() => {
                    const id = (document.getElementById("custom-model-id") as HTMLInputElement)?.value;
                    const label = (document.getElementById("custom-model-label") as HTMLInputElement)?.value;
                    const provider = (document.getElementById("custom-model-provider") as HTMLInputElement)?.value;
                    if (id) {
                      addCustomModelOption({ id, label: label || id, provider: provider || "custom" });
                    }
                  }}
                >
                  +
                </button>
              </div>
            </label>
            {customModelOptions.length > 0 && (
              <div style={{ marginTop: SPACING.xs }}>
                {customModelOptions.map((opt) => (
                  <div
                    key={opt.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: SPACING.sm,
                      padding: `${SPACING.xs}px 0`,
                      fontSize: TYPO.fontSize,
                      color: TEXT.secondary,
                    }}
                  >
                    <span>{opt.label}</span>
                    <button
                      style={removeButtonStyle}
                      onClick={() => removeCustomModelOption(opt.id)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SettingsSection>

        {/* Transport */}
        <SettingsSection title="传输方式">
          <label style={labelStyle}>
            <span style={{ color: TEXT.primary, fontSize: TYPO.fontSize }}>默认传输</span>
            <select
              value={defaultTransport}
              onChange={(e) => setDefaultTransport(e.target.value as "http" | "pi-mono" | "custom")}
              style={selectStyle}
            >
              <option value="http">HTTP</option>
              <option value="pi-mono">Pi-Mono (本地)</option>
              <option value="custom">自定义</option>
            </select>
          </label>
        </SettingsSection>

        {/* Tool Policy Defaults */}
        <SettingsSection title="工具策略">
          <label style={labelStyle}>
            <span style={{ color: TEXT.primary, fontSize: TYPO.fontSize }}>审批要求</span>
            <select
              value={defaultApprovalRequirement}
              onChange={(e) => setDefaultApprovalRequirement(e.target.value as "never" | "always" | "destructive_only")}
              style={selectStyle}
            >
              <option value="never">从不审批</option>
              <option value="always">始终审批</option>
              <option value="destructive_only">仅破坏性操作</option>
            </select>
          </label>
        </SettingsSection>

        {/* Advanced Config Toggle */}
        <SettingsSection title="高级配置">
          <label style={{ display: "flex", alignItems: "center", gap: SPACING.sm }}>
            <input
              type="checkbox"
              checked={showAdvancedConfig}
              onChange={() => toggleShowAdvancedConfig()}
              style={{ accentColor: TEXT.accent }}
            />
            <span style={{ color: TEXT.primary, fontSize: TYPO.fontSize }}>
              在节点 Inspector 中显示高级参数
            </span>
          </label>
        </SettingsSection>
      </div>
    </div>
  );
}

/** Reusable section wrapper */
function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        marginBottom: SPACING.lg,
        borderBottom: `1px solid ${BORDER.default}`,
        paddingBottom: SPACING.md,
      }}
    >
      <div
        style={{
          fontSize: TYPO.fontSize,
          fontWeight: 600,
          color: TEXT.primary,
          marginBottom: SPACING.sm,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: SPACING.xs,
};

const selectStyle: React.CSSProperties = {
  background: SURFACE.input,
  border: `1px solid ${BORDER.default}`,
  borderRadius: BUTTON.borderRadius,
  color: TEXT.primary,
  fontSize: TYPO.fontSize,
  padding: `${BUTTON.paddingY}px ${BUTTON.paddingX}px`,
  outline: "none",
};

const inputStyle: React.CSSProperties = {
  background: SURFACE.input,
  border: `1px solid ${BORDER.default}`,
  borderRadius: BUTTON.borderRadius,
  color: TEXT.primary,
  fontSize: TYPO.fontSize,
  padding: `${BUTTON.paddingY}px ${BUTTON.paddingX}px`,
  outline: "none",
};

const addButtonStyle: React.CSSProperties = {
  background: BUTTON.primaryBg,
  color: BUTTON.primaryText,
  border: "none",
  borderRadius: BUTTON.borderRadius,
  fontSize: TYPO.fontSize,
  fontWeight: 600,
  padding: `${BUTTON.paddingY}px ${BUTTON.paddingX}px`,
  cursor: "pointer",
  minWidth: 28,
};

const removeButtonStyle: React.CSSProperties = {
  background: "transparent",
  color: TEXT.muted,
  border: "none",
  fontSize: TYPO.fontSize,
  cursor: "pointer",
  padding: "2px",
};