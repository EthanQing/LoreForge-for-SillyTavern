import { useEffect, useState } from "react";
import { Bot, BrainCircuit, CheckCircle2, Download, LoaderCircle, PlugZap, RefreshCcw } from "lucide-react";
import { Button } from "../../components/Button";
import { FieldShell, SelectField, TextField } from "../../components/Field";
import { useCardStore } from "../../app/store";
import { useI18n, type Locale } from "../../lib/i18n";
import { AI_MAX_OUTPUT_TOKENS, AI_MAX_TIMEOUT_MS, fetchAiModels, testAiConnection, type AiSettings } from "../../lib/ai";
import { invoke } from "@tauri-apps/api/core";
import {
  checkForUpdates,
  loadUpdatePreferences,
  setAutoCheckUpdates,
  type AvailableUpdate,
  type UpdatePreferences,
  type UpdateProgress
} from "../../lib/updater";

const thinkingOptions: Array<{ value: AiSettings["thinkingLevel"]; label: string }> = [
  { value: "off", label: "关闭" }, { value: "minimal", label: "Minimal" },
  { value: "low", label: "Low" }, { value: "medium", label: "Medium" },
  { value: "high", label: "High" }, { value: "xhigh", label: "Extra high" },
  { value: "max", label: "Max" }
];

export function SettingsPanel() {
  const { locale, localeOptions, setLocale, t } = useI18n();
  const aiSettings = useCardStore((state) => state.aiSettings);
  const updateAiSettings = useCardStore((state) => state.updateAiSettings);
  const setAiModels = useCardStore((state) => state.setAiModels);
  const setStatus = useCardStore((state) => state.setStatus);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [panelMessage, setPanelMessage] = useState("");
  const [testContent, setTestContent] = useState("");
  const [credentialConfigured, setCredentialConfigured] = useState(false);
  const [updatePreferences, setUpdatePreferencesState] = useState<UpdatePreferences>(() => loadUpdatePreferences());
  const [updateLoading, setUpdateLoading] = useState(false);
  const [manualUpdate, setManualUpdate] = useState<AvailableUpdate | null>(null);
  const [updateInstalling, setUpdateInstalling] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<UpdateProgress | null>(null);
  const credentialBlocked = Boolean(aiSettings.apiKey.trim()) && !credentialConfigured;

  useEffect(() => {
    void invoke<{ configured: boolean }>("ai_credential_status", { credentialId: aiSettings.credentialId })
      .then((status) => setCredentialConfigured(status.configured))
      .catch(() => setCredentialConfigured(false));
  }, [aiSettings.apiKey, aiSettings.credentialId]);

  const updateManualModelInput = (manualModelInput: boolean) => {
    updateAiSettings({
      manualModelInput,
      model: manualModelInput ? aiSettings.model : aiSettings.availableModels[0]?.id ?? aiSettings.model
    });
  };

  const updateAutoCheck = (autoCheckUpdates: boolean) => {
    setUpdatePreferencesState(setAutoCheckUpdates(autoCheckUpdates));
    setPanelMessage(autoCheckUpdates ? t("updates.autoCheckEnabled") : t("updates.autoCheckDisabled"));
  };

  const checkUpdates = async () => {
    setUpdateLoading(true);
    setManualUpdate(null);
    setUpdateProgress(null);
    setPanelMessage(t("updates.checking"));
    try {
      const result = await checkForUpdates({ manual: true });
      if (result.status === "available") {
        setManualUpdate(result.update);
        setPanelMessage(t("updates.availableStatus", { version: result.update.version }));
      } else if (result.status === "current") {
        setPanelMessage(t("updates.current", { version: result.currentVersion }));
      } else if (result.status === "skipped") {
        setPanelMessage(t("updates.availableStatus", { version: result.version }));
      } else {
        setPanelMessage(t("updates.autoCheckDisabled"));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPanelMessage(t("updates.checkFailed", { message }));
      setStatus(t("updates.checkFailed", { message }));
    } finally {
      setUpdateLoading(false);
    }
  };

  const installManualUpdate = async () => {
    if (!manualUpdate?.install) {
      return;
    }
    setUpdateInstalling(true);
    setUpdateProgress(null);
    try {
      await manualUpdate.install(setUpdateProgress);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPanelMessage(t("updates.installFailed", { message }));
      setStatus(t("updates.installFailed", { message }));
      setUpdateInstalling(false);
    }
  };

  const fetchModels = async () => {
    setModelsLoading(true);
    setPanelMessage(t("settings.fetchingModels"));
    try {
      const models = await fetchAiModels(aiSettings);
      setAiModels(models);
      if (aiSettings.apiKey.trim()) updateAiSettings({ apiKey: "" });
      setPanelMessage(models.length ? t("settings.modelsLoaded", { count: models.length }) : t("settings.noModelsReturned"));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPanelMessage(message);
      setStatus(message);
    } finally {
      setModelsLoading(false);
    }
  };

  const testConnection = async () => {
    setTestLoading(true);
    setPanelMessage(t("settings.testingModel"));
    setTestContent("");
    try {
      const result = await testAiConnection(aiSettings);
      setTestContent(result.content);
      updateAiSettings({ toolCalling: result.toolCalling, apiKey: "" });
      setPanelMessage(t("settings.connected", { model: result.model }));
      setStatus(t("status.aiConnectionTested"));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPanelMessage(message);
      setStatus(message);
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>{t("settings.title")}</h2>
        <span className={credentialBlocked ? "state-pill state-pill-hot" : credentialConfigured ? "state-pill" : "state-pill state-pill-hot"}>
          {credentialBlocked ? "API Key 尚未保存到系统凭据库" : credentialConfigured ? "系统凭据已配置" : t("settings.apiKeyMissing")}
        </span>
      </div>

      <div className="subpanel">
        <div className="subpanel-heading">
          <h3>{t("settings.interface")}</h3>
        </div>
        <SelectField label={t("settings.language")} value={locale} onChange={(event) => setLocale(event.currentTarget.value as Locale)}>
          {localeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.labelKey)}
            </option>
          ))}
        </SelectField>
      </div>

      <div className="subpanel">
        <div className="subpanel-heading">
          <h3>{t("updates.title")}</h3>
          <Button disabled={updateLoading} icon={updateLoading ? <LoaderCircle className="spin" size={18} /> : <RefreshCcw size={18} />} onClick={() => void checkUpdates()}>
            {t("updates.checkNow")}
          </Button>
        </div>
        <label className="toggle-row">
          <input checked={updatePreferences.autoCheckUpdates} type="checkbox" onChange={(event) => updateAutoCheck(event.currentTarget.checked)} />
          <span>{t("updates.autoCheck")}</span>
        </label>
        {manualUpdate ? (
          <div className="update-settings-result">
            <div>
              <strong>{t("updates.available", { version: manualUpdate.version })}</strong>
              <span>
                {manualUpdate.mode === "installer"
                  ? t("updates.installerDetail", { current: manualUpdate.currentVersion })
                  : t("updates.sourceDetail", { current: manualUpdate.currentVersion })}
              </span>
              {updateProgress ? <small>{formatUpdateProgress(updateProgress)}</small> : null}
            </div>
            {manualUpdate.install ? (
              <Button disabled={updateInstalling} icon={<Download size={16} />} onClick={() => void installManualUpdate()}>
                {updateInstalling ? t("updates.installing") : t("updates.installNow")}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="settings-layout">
        <div className="subpanel">
          <div className="subpanel-heading">
            <h3>{t("settings.openaiCompatibleApi")}</h3>
            <Bot size={18} aria-hidden="true" />
          </div>
          <div className="two-column">
            <SelectField
              label={t("settings.provider")}
              value={aiSettings.providerProfile}
              onChange={(event) => {
                const providerProfile = event.currentTarget.value === "openai-compatible" ? "openai-compatible" : "deepseek";
                updateAiSettings({
                  providerProfile,
                  baseUrl:
                    providerProfile === "deepseek" && !aiSettings.baseUrl.trim()
                      ? "https://api.deepseek.com"
                      : aiSettings.baseUrl
                });
              }}
            >
              <option value="deepseek">DeepSeek</option>
              <option value="openai-compatible">{t("settings.openaiCompatible")}</option>
            </SelectField>
            <TextField
              label={t("settings.baseUrl")}
              spellCheck={false}
              value={aiSettings.baseUrl}
              onChange={(event) => updateAiSettings({ baseUrl: event.currentTarget.value })}
            />
          </div>
          <TextField
            autoComplete="off"
            label="API Key（仅写入系统凭据库）"
            spellCheck={false}
            type="password"
            value={aiSettings.apiKey}
            onChange={(event) => updateAiSettings({ apiKey: event.currentTarget.value })}
          />
          <div className="model-row">
            <div className="model-field-stack">
              {aiSettings.manualModelInput ? (
                <TextField
                  label={t("settings.model")}
                  spellCheck={false}
                  value={aiSettings.model}
                  onChange={(event) => updateAiSettings({ model: event.currentTarget.value })}
                />
              ) : (
                <SelectField
                  label={t("settings.model")}
                  value={aiSettings.model}
                  onChange={(event) => updateAiSettings({ model: event.currentTarget.value })}
                >
                  {aiSettings.availableModels.length ? null : <option value={aiSettings.model}>{aiSettings.model}</option>}
                  {aiSettings.availableModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.ownedBy ? `${model.id} (${model.ownedBy})` : model.id}
                    </option>
                  ))}
                </SelectField>
              )}
              <label className="toggle-row model-manual-toggle">
                <input
                  checked={aiSettings.manualModelInput}
                  type="checkbox"
                  onChange={(event) => updateManualModelInput(event.currentTarget.checked)}
                />
                <span>{t("settings.manualModelInput")}</span>
              </label>
            </div>
            <Button
              disabled={modelsLoading || !aiSettings.baseUrl.trim() || (!aiSettings.apiKey.trim() && !credentialConfigured)}
              icon={modelsLoading ? <LoaderCircle className="spin" size={18} /> : <RefreshCcw size={18} />}
              onClick={fetchModels}
            >
              {t("settings.fetchModels")}
            </Button>
          </div>
        </div>

        <div className="subpanel">
          <div className="subpanel-heading">
            <h3>{t("settings.generation")}</h3>
            <BrainCircuit size={18} aria-hidden="true" />
          </div>
          <div className="settings-switches">
            <label className="toggle-row">
              <input
                checked={aiSettings.enabled}
                type="checkbox"
                onChange={(event) => updateAiSettings({ enabled: event.currentTarget.checked })}
              />
              <span>{t("settings.enableAi")}</span>
            </label>
          </div>
          <div className="two-column">
            <SelectField
              detail="直接传递给 Pi Agent；不同模型可能支持不同等级。"
              label="思考等级"
              value={aiSettings.thinkingLevel}
              onChange={(event) => updateAiSettings({ thinkingLevel: event.currentTarget.value as AiSettings["thinkingLevel"] })}
            >
              {thinkingOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectField>
          </div>
          <div className="two-column">
            <TextField
              detail={aiSettings.providerProfile === "deepseek" && aiSettings.thinkingLevel !== "off" ? t("settings.ignoredByThinking") : undefined}
              label={t("settings.temperature")}
              max={2}
              min={0}
              step={0.1}
              type="number"
              value={aiSettings.temperature}
              onChange={(event) => updateAiSettings({ temperature: Number(event.currentTarget.value) })}
            />
          </div>
          <div className="two-column">
            <TextField
              detail="1 - 384K"
              label={t("settings.maxOutputTokens")}
              max={AI_MAX_OUTPUT_TOKENS}
              min={1}
              step={1024}
              type="number"
              value={aiSettings.maxOutputTokens}
              onChange={(event) => updateAiSettings({ maxOutputTokens: Number(event.currentTarget.value) })}
            />
            <TextField
              label={t("settings.timeoutMs")}
              max={AI_MAX_TIMEOUT_MS}
              min={1000}
              step={1000}
              type="number"
              value={aiSettings.timeoutMs}
              onChange={(event) => updateAiSettings({ timeoutMs: Number(event.currentTarget.value) })}
            />
          </div>
        </div>
      </div>

      <div className="subpanel">
        <div className="subpanel-heading">
          <h3>{t("settings.connectionTest")}</h3>
          <Button
            disabled={testLoading || (!aiSettings.apiKey.trim() && !credentialConfigured) || !aiSettings.baseUrl.trim() || !aiSettings.model.trim()}
            icon={testLoading ? <LoaderCircle className="spin" size={18} /> : <PlugZap size={18} />}
            onClick={testConnection}
          >
            {t("common.test")}
          </Button>
        </div>
        <div className="status-line" role="status" aria-live="polite">
          {panelMessage || t("common.idle")}
        </div>
        <FieldShell label={t("settings.response")}>
          <div className="stream-preview">
            {testContent || (
              <span className="muted">
                <CheckCircle2 size={14} aria-hidden="true" /> {t("common.ready")}
              </span>
            )}
          </div>
        </FieldShell>
      </div>
    </section>
  );
}

function formatUpdateProgress(progress: UpdateProgress): string {
  if (progress.finished) {
    return "100%";
  }
  if (!progress.total || progress.total <= 0) {
    return `${formatBytes(progress.downloaded)} downloaded`;
  }
  const percent = Math.min(100, Math.round((progress.downloaded / progress.total) * 100));
  return `${percent}% (${formatBytes(progress.downloaded)} / ${formatBytes(progress.total)})`;
}

function formatBytes(value: number): string {
  if (value < 1024 * 1024) {
    return `${Math.max(0, Math.round(value / 1024))} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
