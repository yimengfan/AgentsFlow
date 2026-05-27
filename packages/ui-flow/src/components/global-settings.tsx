import { useState } from "react";
import { SURFACE, BORDER, TEXT, SPACING, TYPO, BUTTON, ACCENT } from "./workbench-tokens.js";
import {
  useSettingsStore,
  type LlmProvider,
  type LlmProtocol,
  type SettingsTab,
} from "../store/settings-store.js";
import { fetchModelsForProvider } from "../lib/llm-model-fetcher.js";

/**
 * GlobalSettings — application-level settings panel in the left sidebar.
 *
 * Three sub-tabs: LLM, Tools, MCP (disabled).
 * LLM tab: provider CRUD, model auto-fetch, default model selection.
 * Tools tab: global tool approval policy.
 * MCP tab: disabled placeholder.
 *
 * Layout invariant: fills the sidebar content area (no width/height set).
 */

// ─── Tab Configuration ─────────────────────────────────────

const TABS: ReadonlyArray<{ readonly id: SettingsTab; readonly label: string; readonly disabled?: boolean }> = [
  { id: "llm", label: "LLM" },
  { id: "tools", label: "Tools" },
  { id: "mcp", label: "MCP", disabled: true },
];

// ─── Main Component ────────────────────────────────────────

export function GlobalSettings() {
  const activeTab = useSettingsStore((s) => s.activeSettingsTab);
  const setActiveTab = useSettingsStore((s) => s.setActiveSettingsTab);

  return (
    <div
      style={{
        height: "100%",
        background: SURFACE.sidebar,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
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

      {/* Tab Bar */}
      <div
        style={{
          display: "flex",
          borderBottom: `1px solid ${BORDER.default}`,
          flexShrink: 0,
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => !tab.disabled && setActiveTab(tab.id)}
            style={{
              flex: 1,
              minWidth: 60,
              padding: `${SPACING.sm}px ${SPACING.xs}px`,
              border: "none",
              background: "transparent",
              cursor: tab.disabled ? "not-allowed" : "pointer",
              fontSize: TYPO.fontSize,
              fontWeight: activeTab === tab.id ? 600 : 400,
              color: tab.disabled
                ? TEXT.muted
                : activeTab === tab.id
                  ? TEXT.primary
                  : TEXT.secondary,
              borderBottom: activeTab === tab.id
                ? `2px solid ${ACCENT.indigo}`
                : "2px solid transparent",
              opacity: tab.disabled ? 0.4 : 1,
              transition: `all ${BUTTON.transitionMs}ms`,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {activeTab === "llm" && <LlmTab />}
        {activeTab === "tools" && <ToolsTab />}
        {activeTab === "mcp" && <McpTab />}
      </div>
    </div>
  );
}

// ─── LLM Tab ───────────────────────────────────────────────

function LlmTab() {
  const providers = useSettingsStore((s) => s.providers);
  const defaultModelKey = useSettingsStore((s) => s.defaultModelKey);
  const {
    addProvider,
    updateProvider,
    removeProvider,
    setProviderModels,
    addManualModel,
    removeModel,
    setDefaultModelKey,
    getAllModels,
  } = useSettingsStore();

  const [showAddForm, setShowAddForm] = useState(false);
  const [fetchingProviderId, setFetchingProviderId] = useState<string | null>(null);

  // Add provider form state
  const [newTag, setNewTag] = useState("");
  const [newBaseUrl, setNewBaseUrl] = useState("");
  const [newApiKey, setNewApiKey] = useState("");
  const [newProtocol, setNewProtocol] = useState<LlmProtocol>("openai");

  const allModels = getAllModels();

  const handleAddProvider = () => {
    if (!newBaseUrl.trim()) return;
    const id = addProvider({
      tag: newTag.trim(),
      baseUrl: newBaseUrl.trim(),
      apiKey: newApiKey,
      protocol: newProtocol,
    });
    // Reset form
    setNewTag("");
    setNewBaseUrl("");
    setNewApiKey("");
    setNewProtocol("openai");
    setShowAddForm(false);

    // Auto-fetch models after adding
    handleFetchModels(id);
  };

  const handleFetchModels = async (providerId: string) => {
    const provider = useSettingsStore.getState().providers.find((p) => p.id === providerId);
    if (!provider) return;

    setFetchingProviderId(providerId);
    try {
      const result = await fetchModelsForProvider(provider);
      useSettingsStore.getState().setProviderModels(providerId, result.models, result.error);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      useSettingsStore.getState().setProviderModels(providerId, [], message);
    } finally {
      setFetchingProviderId(null);
    }
  };

  return (
    <div style={{ padding: SPACING.md, width: "100%" }}>
      {/* Default Model Selector */}
      <SettingsSection title="默认模型">
        <select
          value={defaultModelKey ?? ""}
          onChange={(e) => setDefaultModelKey(e.target.value || null)}
          style={selectStyle}
        >
          <option value="">— 未选择 —</option>
          {allModels.map((model) => {
            const provider = providers.find((p) => p.id === model.providerId);
            const key = provider ? `${provider.tag}/${model.id}` : model.id;
            return (
              <option key={key} value={key}>
                {provider ? `${provider.tag} / ` : ""}{model.label}
              </option>
            );
          })}
        </select>
      </SettingsSection>

      {/* Provider List */}
      <SettingsSection title="LLM 提供商">
        {providers.map((provider) => (
          <ProviderCard
            key={provider.id}
            provider={provider}
            isFetching={fetchingProviderId === provider.id}
            onFetch={() => handleFetchModels(provider.id)}
            onUpdate={(patch) => updateProvider(provider.id, patch)}
            onRemove={() => removeProvider(provider.id)}
            onAddModel={(model) => addManualModel(provider.id, model)}
            onRemoveModel={(modelId) => removeModel(provider.id, modelId)}
          />
        ))}

        {/* Add Provider Button / Form */}
        {!showAddForm ? (
          <button
            style={{ ...addButtonStyle, width: "100%", marginTop: SPACING.sm }}
            onClick={() => setShowAddForm(true)}
          >
            + 添加提供商
          </button>
        ) : (
          <div
            style={{
              marginTop: SPACING.sm,
              padding: SPACING.sm,
              background: SURFACE.input,
              borderRadius: BUTTON.borderRadius,
              border: `1px solid ${BORDER.active}`,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: SPACING.sm }}>
              <LabeledInput label="标签 (Tag)" value={newTag} onChange={setNewTag} placeholder="deepseek" />
              <LabeledInput label="Base URL" value={newBaseUrl} onChange={setNewBaseUrl} placeholder="https://api.deepseek.com" />
              <LabeledInput label="API Key (可选)" value={newApiKey} onChange={setNewApiKey} placeholder="sk-..." type="password" />
              <div style={{ display: "flex", flexDirection: "column", gap: SPACING.xs }}>
                <span style={{ color: TEXT.secondary, fontSize: TYPO.smallFontSize }}>协议</span>
                <select
                  value={newProtocol}
                  onChange={(e) => setNewProtocol(e.target.value as LlmProtocol)}
                  style={selectStyle}
                >
                  <option value="openai">OpenAI 兼容</option>
                  <option value="anthropic">Anthropic</option>
                </select>
              </div>
              <div style={{ display: "flex", gap: SPACING.sm, marginTop: SPACING.xs }}>
                <button
                  style={{ ...primaryButtonStyle, flex: 1 }}
                  onClick={handleAddProvider}
                  disabled={!newBaseUrl.trim()}
                >
                  保存
                </button>
                <button
                  style={{ ...secondaryButtonStyle, flex: 1 }}
                  onClick={() => setShowAddForm(false)}
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        )}
      </SettingsSection>
    </div>
  );
}

// ─── Provider Card ─────────────────────────────────────────

function ProviderCard({
  provider,
  isFetching,
  onFetch,
  onUpdate,
  onRemove,
  onAddModel,
  onRemoveModel,
}: {
  readonly provider: LlmProvider;
  readonly isFetching: boolean;
  readonly onFetch: () => void;
  readonly onUpdate: (patch: Partial<Omit<LlmProvider, "id">>) => void;
  readonly onRemove: () => void;
  readonly onAddModel: (model: { id: string; label: string }) => void;
  readonly onRemoveModel: (modelId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTag, setEditTag] = useState(provider.tag);
  const [editBaseUrl, setEditBaseUrl] = useState(provider.baseUrl);
  const [editApiKey, setEditApiKey] = useState(provider.apiKey);
  const [manualModelId, setManualModelId] = useState("");

  const handleSaveEdit = () => {
    onUpdate({
      tag: editTag.trim() || provider.tag,
      baseUrl: editBaseUrl.trim() || provider.baseUrl,
      apiKey: editApiKey,
    });
    setEditing(false);
  };

  const handleAddManualModel = () => {
    if (!manualModelId.trim()) return;
    onAddModel({
      id: manualModelId.trim(),
      label: manualModelId.trim(),
    });
    setManualModelId("");
  };

  return (
    <div
      style={{
        marginBottom: SPACING.sm,
        background: SURFACE.input,
        borderRadius: BUTTON.borderRadius,
        border: `1px solid ${BORDER.default}`,
        overflow: "hidden",
      }}
    >
      {/* Provider Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: SPACING.sm,
          padding: `${SPACING.sm}px ${SPACING.md}px`,
          cursor: "pointer",
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <span
          style={{
            fontSize: TYPO.smallFontSize,
            color: TEXT.muted,
            transition: `transform ${BUTTON.transitionMs}ms`,
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
          }}
        >
          ▶
        </span>
        <span style={{ fontSize: TYPO.fontSize, fontWeight: 600, color: TEXT.primary, flex: 1 }}>
          {provider.tag}
        </span>
        <span style={{ fontSize: TYPO.smallFontSize, color: TEXT.muted }}>
          {provider.protocol}
        </span>
        <span style={{ fontSize: TYPO.smallFontSize, color: TEXT.muted }}>
          {provider.models.length} 模型
        </span>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div
          style={{
            padding: `${SPACING.xs}px ${SPACING.md}px ${SPACING.md}px`,
            borderTop: `1px solid ${BORDER.default}`,
          }}
        >
          {editing ? (
            /* Edit Form */
            <div style={{ display: "flex", flexDirection: "column", gap: SPACING.sm }}>
              <LabeledInput label="标签" value={editTag} onChange={setEditTag} />
              <LabeledInput label="Base URL" value={editBaseUrl} onChange={setEditBaseUrl} />
              <LabeledInput label="API Key" value={editApiKey} onChange={setEditApiKey} type="password" />
              <div style={{ display: "flex", gap: SPACING.sm }}>
                <button style={{ ...primaryButtonStyle, flex: 1 }} onClick={handleSaveEdit}>保存</button>
                <button style={{ ...secondaryButtonStyle, flex: 1 }} onClick={() => setEditing(false)}>取消</button>
              </div>
            </div>
          ) : (
            /* Display Info */
            <div style={{ display: "flex", flexDirection: "column", gap: SPACING.xs }}>
              <InfoRow label="Base URL" value={provider.baseUrl} />
              <InfoRow label="API Key" value={provider.apiKey ? "••••••••" : "(无)"} />
              <InfoRow label="协议" value={provider.protocol === "openai" ? "OpenAI 兼容" : "Anthropic"} />
              {provider.lastFetchError && (
                <div style={{ fontSize: TYPO.smallFontSize, color: ACCENT.errorRed }}>
                  ⚠ {provider.lastFetchError}
                </div>
              )}
              {provider.lastFetchedAt && (
                <div style={{ fontSize: TYPO.smallFontSize, color: TEXT.muted }}>
                  上次获取: {new Date(provider.lastFetchedAt).toLocaleString()}
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: "flex", gap: SPACING.sm, marginTop: SPACING.xs }}>
                <button
                  style={secondaryButtonStyle}
                  onClick={(e) => { e.stopPropagation(); onFetch(); }}
                  disabled={isFetching}
                >
                  {isFetching ? "获取中..." : "刷新模型"}
                </button>
                <button
                  style={secondaryButtonStyle}
                  onClick={(e) => { e.stopPropagation(); setEditing(true); }}
                >
                  编辑
                </button>
                <button
                  style={dangerButtonStyle}
                  onClick={(e) => { e.stopPropagation(); onRemove(); }}
                >
                  删除
                </button>
              </div>
            </div>
          )}

          {/* Model List */}
          <div style={{ marginTop: SPACING.md }}>
            <div style={{ fontSize: TYPO.smallFontSize, fontWeight: 600, color: TEXT.secondary, marginBottom: SPACING.xs }}>
              模型列表
            </div>
            {provider.models.length === 0 ? (
              <div style={{ fontSize: TYPO.smallFontSize, color: TEXT.muted }}>
                暂无模型，点击"刷新模型"获取或手动添加
              </div>
            ) : (
              provider.models.map((model) => (
                <div
                  key={model.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: SPACING.sm,
                    padding: `${SPACING.xs}px 0`,
                    fontSize: TYPO.fontSize,
                    color: TEXT.secondary,
                  }}
                >
                  <span style={{ flex: 1 }}>{model.label}</span>
                  <button
                    style={removeButtonStyle}
                    onClick={(e) => { e.stopPropagation(); onRemoveModel(model.id); }}
                  >
                    ×
                  </button>
                </div>
              ))
            )}

            {/* Manual Model Add */}
            <div style={{ display: "flex", gap: SPACING.xs, marginTop: SPACING.sm }}>
              <input
                placeholder="模型名"
                value={manualModelId}
                onChange={(e) => setManualModelId(e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                style={addButtonStyle}
                onClick={handleAddManualModel}
                disabled={!manualModelId.trim()}
              >
                +
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tools Tab ─────────────────────────────────────────────

function ToolsTab() {
  const defaultApprovalRequirement = useSettingsStore((s) => s.defaultApprovalRequirement);
  const setDefaultApprovalRequirement = useSettingsStore((s) => s.setDefaultApprovalRequirement);

  return (
    <div style={{ padding: SPACING.md, width: "100%" }}>
      <SettingsSection title="工具策略">
        <label style={{ display: "flex", flexDirection: "column", gap: SPACING.xs, width: "100%" }}>
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
    </div>
  );
}

// ─── MCP Tab (Disabled Placeholder) ───────────────────────

function McpTab() {
  return (
    <div style={{ padding: SPACING.md, width: "100%" }}>
      <div
        style={{
          textAlign: "center",
          padding: SPACING.xl,
          color: TEXT.muted,
          fontSize: TYPO.fontSize,
        }}
      >
        MCP 服务器配置即将推出
      </div>
    </div>
  );
}

// ─── Shared Sub-Components ─────────────────────────────────

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        width: "100%",
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

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly placeholder?: string;
  readonly type?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACING.xs, width: "100%" }}>
      <span style={{ color: TEXT.secondary, fontSize: TYPO.smallFontSize }}>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={inputStyle}
      />
    </div>
  );
}

function InfoRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div style={{ display: "flex", gap: SPACING.sm, fontSize: TYPO.smallFontSize }}>
      <span style={{ color: TEXT.muted, minWidth: 60 }}>{label}</span>
      <span style={{ color: TEXT.secondary, wordBreak: "break-all" }}>{value}</span>
    </div>
  );
}

// ─── Shared Styles ─────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: SPACING.xs,
  width: "100%",
};

const selectStyle: React.CSSProperties = {
  background: SURFACE.input,
  border: `1px solid ${BORDER.default}`,
  borderRadius: BUTTON.borderRadius,
  color: TEXT.primary,
  fontSize: TYPO.fontSize,
  padding: `${BUTTON.paddingY}px ${BUTTON.paddingX}px`,
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

const inputStyle: React.CSSProperties = {
  background: SURFACE.input,
  border: `1px solid ${BORDER.default}`,
  borderRadius: BUTTON.borderRadius,
  color: TEXT.primary,
  fontSize: TYPO.fontSize,
  padding: `${BUTTON.paddingY}px ${BUTTON.paddingX}px`,
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
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

const primaryButtonStyle: React.CSSProperties = {
  background: BUTTON.primaryBg,
  color: BUTTON.primaryText,
  border: "none",
  borderRadius: BUTTON.borderRadius,
  fontSize: TYPO.fontSize,
  fontWeight: 600,
  padding: `${BUTTON.paddingY}px ${BUTTON.paddingX}px`,
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  background: "transparent",
  color: TEXT.secondary,
  border: `1px solid ${BORDER.default}`,
  borderRadius: BUTTON.borderRadius,
  fontSize: TYPO.fontSize,
  padding: `${BUTTON.paddingY}px ${BUTTON.paddingX}px`,
  cursor: "pointer",
};

const dangerButtonStyle: React.CSSProperties = {
  background: "transparent",
  color: ACCENT.errorRed,
  border: `1px solid ${ACCENT.errorRed}`,
  borderRadius: BUTTON.borderRadius,
  fontSize: TYPO.fontSize,
  padding: `${BUTTON.paddingY}px ${BUTTON.paddingX}px`,
  cursor: "pointer",
};

const removeButtonStyle: React.CSSProperties = {
  background: "transparent",
  color: TEXT.muted,
  border: "none",
  fontSize: TYPO.fontSize,
  cursor: "pointer",
  padding: "2px",
};