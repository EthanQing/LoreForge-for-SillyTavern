import { useCardStore } from "../../app/store";
import { CodeEditor } from "../../components/CodeEditor";
import { estimateTokens } from "../../lib/tokenEstimate";

function PromptField({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="editor-block">
      <span className="field-label">
        {label}
        <small>{estimateTokens(value)} tokens</small>
      </span>
      <CodeEditor value={value} mode="prompt" onChange={onChange} />
    </div>
  );
}

export function PromptPanel() {
  const data = useCardStore((state) => state.card.data);
  const updateData = useCardStore((state) => state.updateData);

  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Persona & Prompts</h2>
      </div>
      <PromptField label="Description" value={data.description} onChange={(value) => updateData("description", value)} />
      <PromptField label="Personality" value={data.personality} onChange={(value) => updateData("personality", value)} />
      <PromptField label="Scenario" value={data.scenario} onChange={(value) => updateData("scenario", value)} />
      <PromptField label="System Prompt" value={data.system_prompt} onChange={(value) => updateData("system_prompt", value)} />
      <PromptField
        label="Post History Instructions"
        value={data.post_history_instructions}
        onChange={(value) => updateData("post_history_instructions", value)}
      />
      <PromptField label="Message Example" value={data.mes_example} onChange={(value) => updateData("mes_example", value)} />
    </section>
  );
}
