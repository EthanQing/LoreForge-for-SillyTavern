import { useCardStore } from "../../app/store";
import { CodeEditor } from "../../components/CodeEditor";
import { useI18n } from "../../lib/i18n";
import { estimateTokens } from "../../lib/tokenEstimate";

function PromptField({
  label,
  value,
  onChange,
  tokenLabel
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  tokenLabel: string;
}) {
  return (
    <div className="editor-block">
      <span className="field-label">
        {label}
        <small>{tokenLabel}</small>
      </span>
      <CodeEditor value={value} mode="prompt" onChange={onChange} />
    </div>
  );
}

export function PromptPanel() {
  const { t } = useI18n();
  const data = useCardStore((state) => state.card.data);
  const updateData = useCardStore((state) => state.updateData);
  const tokenLabel = (value: string) => t("common.tokens", { count: estimateTokens(value) });

  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>{t("prompts.title")}</h2>
      </div>
      <PromptField label={t("field.description")} tokenLabel={tokenLabel(data.description)} value={data.description} onChange={(value) => updateData("description", value)} />
      <PromptField label={t("field.personality")} tokenLabel={tokenLabel(data.personality)} value={data.personality} onChange={(value) => updateData("personality", value)} />
      <PromptField label={t("field.scenario")} tokenLabel={tokenLabel(data.scenario)} value={data.scenario} onChange={(value) => updateData("scenario", value)} />
      <PromptField label={t("field.systemPrompt")} tokenLabel={tokenLabel(data.system_prompt)} value={data.system_prompt} onChange={(value) => updateData("system_prompt", value)} />
      <PromptField
        label={t("field.postHistoryInstructions")}
        tokenLabel={tokenLabel(data.post_history_instructions)}
        value={data.post_history_instructions}
        onChange={(value) => updateData("post_history_instructions", value)}
      />
      <PromptField label={t("field.messageExample")} tokenLabel={tokenLabel(data.mes_example)} value={data.mes_example} onChange={(value) => updateData("mes_example", value)} />
    </section>
  );
}
