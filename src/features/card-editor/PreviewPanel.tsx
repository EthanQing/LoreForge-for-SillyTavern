import { useMemo, useState } from "react";
import { useCardStore } from "../../app/store";
import { CodeEditor } from "../../components/CodeEditor";
import { buildPromptPreview, displayName, replaceMacros } from "../../lib/promptPreview";
import { defaultAssetPreview } from "../../lib/schema";

export function PreviewPanel() {
  const card = useCardStore((state) => state.card);
  const greetings = useMemo(() => [card.data.first_mes, ...card.data.alternate_greetings], [card.data.first_mes, card.data.alternate_greetings]);
  const [greetingIndex, setGreetingIndex] = useState(0);
  const greeting = greetings[greetingIndex] ?? card.data.first_mes;
  const icon = (card.data.assets ?? [defaultAssetPreview]).find((asset) => asset.type === "icon" && asset.name === "main") ?? defaultAssetPreview;
  const prompt = buildPromptPreview(card, greeting);

  return (
    <section className="panel preview-panel">
      <div className="panel-heading">
        <h2>Preview</h2>
      </div>
      <div className="preview-grid">
        <aside className="profile-preview">
          <div className="avatar-preview">
            {icon.uri.startsWith("data:image/") ? <img alt={displayName(card)} src={icon.uri} /> : <span>{displayName(card).slice(0, 2).toUpperCase()}</span>}
          </div>
          <h3>{displayName(card)}</h3>
          {card.data.nickname && card.data.name ? <p className="muted">{card.data.name}</p> : null}
          <div className="chip-list">
            {card.data.tags.map((tag) => (
              <span className="chip" key={tag}>
                {tag}
              </span>
            ))}
          </div>
          <p>{card.data.creator}</p>
        </aside>
        <section className="preview-content">
          <div className="field">
            <span className="field-label">Greeting</span>
            <select className="input" value={greetingIndex} onChange={(event) => setGreetingIndex(Number(event.target.value))}>
              {greetings.map((item, index) => (
                <option key={`${index}-${item.slice(0, 12)}`} value={index}>
                  {index === 0 ? "first_mes" : `alternate ${index}`}
                </option>
              ))}
            </select>
          </div>
          <div className="message-preview">{replaceMacros(greeting, card)}</div>
          <div className="editor-block">
            <span className="field-label">Prompt</span>
            <CodeEditor value={prompt} mode="prompt" minHeight="360px" readOnly />
          </div>
        </section>
      </div>
    </section>
  );
}
