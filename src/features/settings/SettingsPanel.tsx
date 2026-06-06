import { useState } from "react";
import { Bot, BrainCircuit, CheckCircle2, LoaderCircle, PlugZap, RefreshCcw } from "lucide-react";
import { Button } from "../../components/Button";
import { FieldShell, SelectField, TextField } from "../../components/Field";
import { useCardStore } from "../../app/store";
import { useI18n, type Locale, type TranslationKey } from "../../lib/i18n";
import { AI_MAX_OUTPUT_TOKENS, AI_MAX_TIMEOUT_MS, fetchAiModels, testAiConnection, type AiThinkingEffort, type AiThinkingMode } from "../../lib/ai";

const thinkingOptions = [
  { value: "high", labelKey: "common.high" },
  { value: "max", labelKey: "common.max" }
] satisfies Array<{ value: AiThinkingEffort; labelKey: TranslationKey }>;

const thinkingModeOptions = [
  { value: "enabled", labelKey: "common.enabled" },
  { value: "disabled", labelKey: "common.disabled" }
] satisfies Array<{ value: AiThinkingMode; labelKey: TranslationKey }>;

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
  const [testReasoning, setTestReasoning] = useState("");

  const fetchModels = async () => {
    setModelsLoading(true);
    setPanelMessage(t("settings.fetchingModels"));
    try {
      const models = await fetchAiModels(aiSettings);
      setAiModels(models);
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
    setTestReasoning("");
    try {
      const result = await testAiConnection(aiSettings, (event) => {
        if (event.event !== "delta") {
          return;
        }
        if (event.contentDelta) {
          setTestContent((current) => current + event.contentDelta);
        }
        if (event.reasoningDelta) {
          setTestReasoning((current) => current + event.reasoningDelta);
        }
      });
      setTestContent((current) => current || result.content);
      setTestReasoning((current) => current || result.reasoning);
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
        <span className={aiSettings.apiKey ? "state-pill" : "state-pill state-pill-hot"}>
          {aiSettings.apiKey ? t("settings.aiReady") : t("settings.apiKeyMissing")}
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
            label={t("settings.apiKey")}
            spellCheck={false}
            type="password"
            value={aiSettings.apiKey}
            onChange={(event) => updateAiSettings({ apiKey: event.currentTarget.value })}
          />
          <div className="model-row">
            <TextField
              label={t("settings.model")}
              list="ai-model-list"
              spellCheck={false}
              value={aiSettings.model}
              onChange={(event) => updateAiSettings({ model: event.currentTarget.value })}
            />
            <datalist id="ai-model-list">
              {aiSettings.availableModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.ownedBy ?? model.id}
                </option>
              ))}
            </datalist>
            <Button
              disabled={modelsLoading || !aiSettings.baseUrl.trim() || !aiSettings.apiKey.trim()}
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
            <label className="toggle-row">
              <input
                checked={aiSettings.stream}
                type="checkbox"
                onChange={(event) => updateAiSettings({ stream: event.currentTarget.checked })}
              />
              <span>{t("settings.streamOutput")}</span>
            </label>
            <label className="toggle-row">
              <input
                checked={aiSettings.showReasoning}
                type="checkbox"
                onChange={(event) => updateAiSettings({ showReasoning: event.currentTarget.checked })}
              />
              <span>{t("settings.showReasoningStream")}</span>
            </label>
          </div>
          <div className="two-column">
            <SelectField
              detail={t("settings.deepseekThinking")}
              label={t("settings.thinkingMode")}
              value={aiSettings.thinkingMode}
              onChange={(event) => updateAiSettings({ thinkingMode: event.currentTarget.value as AiThinkingMode })}
            >
              {thinkingModeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </option>
              ))}
            </SelectField>
            <SelectField
              detail={t("settings.highMax")}
              disabled={aiSettings.thinkingMode === "disabled"}
              label={t("settings.thinkingEffort")}
              value={aiSettings.thinkingEffort}
              onChange={(event) => updateAiSettings({ thinkingEffort: event.currentTarget.value as AiThinkingEffort })}
            >
              {thinkingOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </option>
              ))}
            </SelectField>
          </div>
          <div className="two-column">
            <TextField
              detail={aiSettings.providerProfile === "deepseek" && aiSettings.thinkingMode === "enabled" ? t("settings.ignoredByThinking") : undefined}
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
            disabled={testLoading || !aiSettings.apiKey.trim() || !aiSettings.baseUrl.trim() || !aiSettings.model.trim()}
            icon={testLoading ? <LoaderCircle className="spin" size={18} /> : <PlugZap size={18} />}
            onClick={testConnection}
          >
            {t("common.test")}
          </Button>
        </div>
        <div className="status-line" role="status" aria-live="polite">
          {panelMessage || t("common.idle")}
        </div>
        {testReasoning && aiSettings.showReasoning ? (
          <FieldShell label={t("settings.reasoning")}>
            <div className="stream-preview reasoning-preview">{testReasoning}</div>
          </FieldShell>
        ) : null}
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
