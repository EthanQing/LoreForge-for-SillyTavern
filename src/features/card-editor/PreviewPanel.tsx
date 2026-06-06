import { useMemo, useState } from "react";
import { useCardStore } from "../../app/store";
import { CodeEditor } from "../../components/CodeEditor";
import { useI18n } from "../../lib/i18n";
import { findMainIconAsset } from "../../lib/imageAssets";
import { buildPromptPreview, displayName, replaceMacros } from "../../lib/promptPreview";
import { defaultAssetPreview } from "../../lib/schema";

export function PreviewPanel() {
  const { t } = useI18n();
  const card = useCardStore((state) => state.card);
  const greetings = useMemo(() => [card.data.first_mes, ...card.data.alternate_greetings], [card.data.first_mes, card.data.alternate_greetings]);
  const [greetingIndex, setGreetingIndex] = useState(0);
  const greeting = greetings[greetingIndex] ?? card.data.first_mes;
  const icon = findMainIconAsset(card) ?? defaultAssetPreview;
  const iconUri = typeof icon.uri === "string" ? icon.uri : "";
  const prompt = buildPromptPreview(card, greeting);

  return (
    <section className="panel preview-panel" data-context-menu="preview">
      <div className="panel-heading">
        <h2>{t("preview.title")}</h2>
      </div>
      <div className="preview-grid">
        <aside className="profile-preview">
          <div className="avatar-preview">
            {iconUri.startsWith("data:image/") ? <img alt={displayName(card)} src={iconUri} /> : <span>{displayName(card).slice(0, 2).toUpperCase()}</span>}
          </div>
          <h3>{displayName(card)}</h3>
          {card.data.nickname && card.data.name ? <p className="muted">{card.data.name}</p> : null}
          {card.data.tags.length > 0 ? (
            <div className="chip-list">
              {card.data.tags.map((tag) => (
                <span className="chip" key={tag}>
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
          {card.data.creator ? <p>{card.data.creator}</p> : null}
        </aside>
        <section className="preview-content">
          <div className="field">
            <span className="field-label">{t("preview.greeting")}</span>
            <select className="input" value={greetingIndex} onChange={(event) => setGreetingIndex(Number(event.target.value))}>
              {greetings.map((item, index) => (
                <option key={`${index}-${item.slice(0, 12)}`} value={index}>
                  {index === 0 ? t("preview.firstMessageOption") : t("preview.alternateOption", { index })}
                </option>
              ))}
            </select>
          </div>
          <div className="message-preview">{replaceMacros(greeting, card)}</div>
          <div className="editor-block">
            <span className="field-label">{t("preview.prompt")}</span>
            <CodeEditor value={prompt} mode="prompt" minHeight="360px" readOnly />
          </div>
        </section>
      </div>
    </section>
  );
}
