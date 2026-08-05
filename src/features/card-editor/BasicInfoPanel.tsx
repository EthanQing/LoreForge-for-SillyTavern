import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useCardStore } from "../../app/store";
import { Button } from "../../components/Button";
import { CodeEditor } from "../../components/CodeEditor";
import { TextField } from "../../components/Field";
import { ChipInput } from "../../components/ChipInput";
import { useI18n } from "../../lib/i18n";

function formatTimestamp(value: number | undefined, locale: string): string {
  return value ? new Date(value * 1000).toLocaleString(locale) : "";
}

function safeJson(value: unknown): string {
  return JSON.stringify(value ?? {}, null, 2);
}

export function BasicInfoPanel() {
  const { locale, t } = useI18n();
  const card = useCardStore((state) => state.card);
  const updateData = useCardStore((state) => state.updateData);
  const data = card.data;
  const [sourceDraft, setSourceDraft] = useState("");
  const multilingualText = useMemo(() => safeJson(data.creator_notes_multilingual), [data.creator_notes_multilingual]);

  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>{t("basic.title")}</h2>
      </div>
      <div className="card-schema-summary" data-validation-path="data">
        <div data-validation-path="spec">
          <span>{t("validation.spec")}</span>
          <code>{card.spec}</code>
        </div>
        <div data-validation-path="spec_version">
          <span>{t("validation.specVersion")}</span>
          <code>{card.spec_version}</code>
        </div>
      </div>
      <div className="two-column">
        <TextField validationPath="data.name" label={t("field.name")} value={data.name} onChange={(event) => updateData("name", event.target.value)} />
        <TextField label={t("field.nickname")} value={data.nickname ?? ""} onChange={(event) => updateData("nickname", event.target.value)} />
        <TextField validationPath="data.creator" label={t("field.creator")} value={data.creator} onChange={(event) => updateData("creator", event.target.value)} />
        <TextField
          validationPath="data.character_version"
          label={t("field.characterVersion")}
          value={data.character_version}
          onChange={(event) => updateData("character_version", event.target.value)}
        />
        <TextField label={t("field.created")} value={formatTimestamp(data.creation_date, locale)} readOnly />
        <TextField label={t("field.modified")} value={formatTimestamp(data.modification_date, locale)} readOnly />
      </div>
      <ChipInput validationPath="data.tags" label={t("field.tags")} values={data.tags} onChange={(tags) => updateData("tags", tags)} />
      <div className="field" data-validation-path="data.source">
        <span className="field-label">{t("field.source")}</span>
        <div className="source-list">
          {(data.source ?? []).map((source, index) => (
            <span className="source-item" data-validation-path={`data.source.${index}`} key={`${source}-${index}`}>
              {source}
            </span>
          ))}
        </div>
        <div className="inline-row">
          <input
            className="input"
            value={sourceDraft}
            onChange={(event) => setSourceDraft(event.target.value)}
            placeholder={t("field.sourcePlaceholder")}
          />
          <Button
            icon={<Plus size={16} />}
            onClick={() => {
              const next = sourceDraft.trim();
              if (!next) {
                return;
              }
              updateData("source", [...(data.source ?? []), next]);
              setSourceDraft("");
            }}
          >
            {t("common.add")}
          </Button>
        </div>
      </div>
      <div className="editor-block">
        <span className="field-label">{t("field.creatorNotes")}</span>
        <CodeEditor validationPath="data.creator_notes" value={data.creator_notes} mode="prompt" minHeight="140px" onChange={(value) => updateData("creator_notes", value)} />
      </div>
      <div className="card-extension-summary" data-validation-path="data.extensions">
        <span>{t("validation.extensions")}</span>
        <small>{t("validation.extensionCount", { count: Object.keys(data.extensions).length })}</small>
      </div>
      <div className="editor-block">
        <span className="field-label">{t("field.creatorNotesMultilingual")}</span>
        <CodeEditor
          validationPath="data.creator_notes_multilingual"
          value={multilingualText}
          mode="json"
          minHeight="150px"
          onChange={(value) => {
            try {
              const parsed = JSON.parse(value) as Record<string, string>;
              updateData("creator_notes_multilingual", parsed);
            } catch {
              // Keep the editor responsive while the user is typing invalid JSON.
            }
          }}
        />
      </div>
    </section>
  );
}
