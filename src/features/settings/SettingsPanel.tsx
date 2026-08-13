import { useEffect, useRef, useState } from "react";
import { Bot, BrainCircuit, CheckCircle2, Download, ExternalLink, LoaderCircle, LogIn, LogOut, PlugZap, RefreshCcw, X } from "lucide-react";
import { Button } from "../../components/Button";
import { FieldShell, SelectField, TextField } from "../../components/Field";
import { useCardStore } from "../../app/store";
import { useI18n, type Locale } from "../../lib/i18n";
import {
  AI_MAX_OUTPUT_TOKENS,
  AI_MAX_TIMEOUT_MS,
  beginOpenAiOauth,
  cancelOpenAiOauth,
  completeOpenAiOauth,
  fetchAiModels,
  getOpenAiOauthStatus,
  logoutOpenAiOauth,
  settingsForProvider,
  testAiConnection,
  type AiProviderProfile,
  type AiSettings,
  type OpenAiOauthStart
} from "../../lib/ai";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
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
  const [oauthStart, setOauthStart] = useState<OpenAiOauthStart | null>(null);
  const [oauthLoading, setOauthLoading] = useState(false);
  const activeOauthFlowRef = useRef<string | null>(null);
  const [updatePreferences, setUpdatePreferencesState] = useState<UpdatePreferences>(() => loadUpdatePreferences());
  const [updateLoading, setUpdateLoading] = useState(false);
  const [manualUpdate, setManualUpdate] = useState<AvailableUpdate | null>(null);
  const [updateInstalling, setUpdateInstalling] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<UpdateProgress | null>(null);
  const usesOauth = aiSettings.providerProfile === "openai-codex";
  const credentialBlocked = !usesOauth && Boolean(aiSettings.apiKey.trim()) && !credentialConfigured;
  const hasCredential = usesOauth ? credentialConfigured : Boolean(aiSettings.apiKey.trim()) || credentialConfigured;

  useEffect(() => {
    let active = true;
    const statusPromise = usesOauth
      ? getOpenAiOauthStatus(aiSettings.credentialId)
      : invoke<{ configured: boolean }>("ai_credential_status", { credentialId: aiSettings.credentialId });
    void statusPromise
      .then((status) => {
        if (active) setCredentialConfigured(status.configured);
      })
      .catch(() => {
        if (active) setCredentialConfigured(false);
      });
    return () => {
      active = false;
    };
  }, [aiSettings.apiKey, aiSettings.credentialId, usesOauth]);

  useEffect(() => () => {
    const flowId = activeOauthFlowRef.current;
    if (flowId) void cancelOpenAiOauth(flowId).catch(() => undefined);
    activeOauthFlowRef.current = null;
  }, []);

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

  const startOpenAiLogin = async () => {
    setOauthLoading(true);
    setPanelMessage(t("settings.openaiStartingLogin"));
    let flowId: string | null = null;
    try {
      const start = await beginOpenAiOauth(aiSettings.credentialId);
      flowId = start.flowId;
      activeOauthFlowRef.current = flowId;
      setOauthStart(start);
      setPanelMessage(t("settings.openaiWaiting", { code: start.userCode }));
      try {
        await openUrl(start.verificationUri);
      } catch {
        setPanelMessage(t("settings.openaiOpenManually", { code: start.userCode }));
      }
      const status = await completeOpenAiOauth(start.flowId);
      if (activeOauthFlowRef.current !== flowId) return;
      activeOauthFlowRef.current = null;
      setCredentialConfigured(status.configured);
      setOauthStart(null);
      setPanelMessage(t("settings.openaiConnected"));
      setStatus(t("settings.openaiConnected"));
      setOauthLoading(false);
    } catch (error) {
      if (flowId && activeOauthFlowRef.current !== flowId) return;
      activeOauthFlowRef.current = null;
      const message = error instanceof Error ? error.message : String(error);
      setPanelMessage(message);
      setStatus(message);
      setOauthLoading(false);
    }
  };

  const cancelOpenAiLogin = async () => {
    const flowId = oauthStart?.flowId;
    if (!flowId) return;
    activeOauthFlowRef.current = null;
    await cancelOpenAiOauth(flowId).catch(() => undefined);
    setOauthStart(null);
    setOauthLoading(false);
    setPanelMessage(t("settings.openaiCancelled"));
  };

  const openOpenAiLoginPage = async () => {
    if (!oauthStart) return;
    try {
      await openUrl(oauthStart.verificationUri);
    } catch {
      setPanelMessage(t("settings.openaiOpenManually", { code: oauthStart.userCode }));
    }
  };

  const signOutOpenAi = async () => {
    setOauthLoading(true);
    try {
      await logoutOpenAiOauth(aiSettings.credentialId);
      setCredentialConfigured(false);
      setOauthStart(null);
      setPanelMessage(t("settings.openaiSignedOut"));
    } finally {
      setOauthLoading(false);
    }
  };

  const changeProvider = (providerProfile: AiProviderProfile) => {
    const flowId = activeOauthFlowRef.current;
    if (flowId) void cancelOpenAiOauth(flowId).catch(() => undefined);
    activeOauthFlowRef.current = null;
    setOauthStart(null);
    setOauthLoading(false);
    updateAiSettings(settingsForProvider(providerProfile, aiSettings));
  };

  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>{t("settings.title")}</h2>
        <span className={credentialBlocked ? "state-pill state-pill-hot" : credentialConfigured ? "state-pill" : "state-pill state-pill-hot"}>
          {usesOauth
            ? credentialConfigured ? t("settings.openaiConnected") : t("settings.openaiSignedOutState")
            : credentialBlocked ? "API Key 尚未保存到系统凭据库" : credentialConfigured ? "系统凭据已配置" : t("settings.apiKeyMissing")}
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
                const providerProfile = event.currentTarget.value as AiProviderProfile;
                changeProvider(providerProfile);
              }}
            >
              <option value="deepseek">DeepSeek</option>
              <option value="openai-codex">ChatGPT Plus/Pro (OpenAI Codex)</option>
              <option value="openai-compatible">{t("settings.openaiCompatible")}</option>
            </SelectField>
            {usesOauth ? null : (
              <TextField
                label={t("settings.baseUrl")}
                spellCheck={false}
                value={aiSettings.baseUrl}
                onChange={(event) => updateAiSettings({ baseUrl: event.currentTarget.value })}
              />
            )}
          </div>
          {usesOauth ? (
            <div className="oauth-login-panel" aria-busy={oauthLoading}>
              <p>{t("settings.openaiOauthDetail")}</p>
              {oauthStart ? (
                <div className="oauth-device-code" role="status" aria-live="polite">
                  <span>{t("settings.openaiDeviceCode")}</span>
                  <strong>{oauthStart.userCode}</strong>
                  <div className="inline-row compact">
                    <Button icon={<ExternalLink size={16} />} onClick={() => void openOpenAiLoginPage()}>
                      {t("settings.openaiOpenLogin")}
                    </Button>
                    <Button icon={<X size={16} />} onClick={() => void cancelOpenAiLogin()}>
                      {t("common.cancel")}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="inline-row compact">
                  {credentialConfigured ? (
                    <Button disabled={oauthLoading} icon={<LogOut size={16} />} onClick={() => void signOutOpenAi()}>
                      {t("settings.openaiSignOut")}
                    </Button>
                  ) : (
                    <Button disabled={oauthLoading} icon={oauthLoading ? <LoaderCircle className="spin" size={16} /> : <LogIn size={16} />} onClick={() => void startOpenAiLogin()}>
                      {t("settings.openaiSignIn")}
                    </Button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <TextField
              autoComplete="off"
              label="API Key（仅写入系统凭据库）"
              spellCheck={false}
              type="password"
              value={aiSettings.apiKey}
              onChange={(event) => updateAiSettings({ apiKey: event.currentTarget.value })}
            />
          )}
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
              {usesOauth ? null : (
                <label className="toggle-row model-manual-toggle">
                  <input
                    checked={aiSettings.manualModelInput}
                    type="checkbox"
                    onChange={(event) => updateManualModelInput(event.currentTarget.checked)}
                  />
                  <span>{t("settings.manualModelInput")}</span>
                </label>
              )}
            </div>
            <Button
              disabled={modelsLoading || !aiSettings.baseUrl.trim() || !hasCredential}
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
            disabled={testLoading || !hasCredential || !aiSettings.baseUrl.trim() || !aiSettings.model.trim()}
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
