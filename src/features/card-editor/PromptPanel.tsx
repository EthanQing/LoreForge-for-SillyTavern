import { useCardStore } from "../../app/store";
import { AiFieldAssistant } from "../../components/AiFieldAssistant";
import { CodeEditor } from "../../components/CodeEditor";
import { useI18n } from "../../lib/i18n";
import { estimateTokens } from "../../lib/tokenEstimate";
import type { CardFieldPath } from "../../lib/agent/permissions";

function PromptField({
  label,
  path,
  value,
  onChange,
  tokenLabel
}: {
  label: string;
  path: CardFieldPath;
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
      <AiFieldAssistant target={{ path, label, value }}>
        <CodeEditor validationPath={validationPathForCardField(path)} value={value} mode="prompt" onChange={onChange} />
      </AiFieldAssistant>
    </div>
  );
}

function validationPathForCardField(path: CardFieldPath): string {
  const paths: Record<CardFieldPath, string> = {
    "/description": "data.description",
    "/personality": "data.personality",
    "/scenario": "data.scenario",
    "/firstMessage": "data.first_mes",
    "/alternateGreetings": "data.alternate_greetings",
    "/exampleDialogue": "data.mes_example",
    "/creatorNotes": "data.creator_notes",
    "/systemPrompt": "data.system_prompt",
    "/postHistoryInstructions": "data.post_history_instructions",
    "/name": "data.name",
    "/tags": "data.tags",
    "/creator": "data.creator",
    "/characterVersion": "data.character_version"
  };
  return paths[path];
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
      <PromptField path="/description" label={t("field.description")} tokenLabel={tokenLabel(data.description)} value={data.description} onChange={(value) => updateData("description", value)} />
      <PromptField path="/personality" label={t("field.personality")} tokenLabel={tokenLabel(data.personality)} value={data.personality} onChange={(value) => updateData("personality", value)} />
      <PromptField path="/scenario" label={t("field.scenario")} tokenLabel={tokenLabel(data.scenario)} value={data.scenario} onChange={(value) => updateData("scenario", value)} />
      <PromptField path="/systemPrompt" label={t("field.systemPrompt")} tokenLabel={tokenLabel(data.system_prompt)} value={data.system_prompt} onChange={(value) => updateData("system_prompt", value)} />
      <PromptField
        path="/postHistoryInstructions"
        label={t("field.postHistoryInstructions")}
        tokenLabel={tokenLabel(data.post_history_instructions)}
        value={data.post_history_instructions}
        onChange={(value) => updateData("post_history_instructions", value)}
      />
      <PromptField path="/exampleDialogue" label={t("field.messageExample")} tokenLabel={tokenLabel(data.mes_example)} value={data.mes_example} onChange={(value) => updateData("mes_example", value)} />
    </section>
  );
}
