import { ArrowDown, ArrowUp, Download, Plus, Trash2, Upload } from "lucide-react";
import { ChangeEvent, useRef } from "react";
import { useCardStore } from "../../app/store";
import { AiFieldAssistant } from "../../components/AiFieldAssistant";
import { Button } from "../../components/Button";
import { ChipInput } from "../../components/ChipInput";
import { CodeEditor } from "../../components/CodeEditor";
import { SelectField, TextField } from "../../components/Field";
import { useI18n } from "../../lib/i18n";
import { createBlankLorebook, lorebookEnvelopeSchema } from "../../lib/schema";

function numberValue(value: number | undefined): string {
  return value === undefined ? "" : String(value);
}

function parseNumber(value: string): number | undefined {
  if (!value.trim()) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function LorebookPanel() {
  const { t } = useI18n();
  const card = useCardStore((state) => state.card);
  const updateData = useCardStore((state) => state.updateData);
  const updateLorebook = useCardStore((state) => state.updateLorebook);
  const addLorebookEntry = useCardStore((state) => state.addLorebookEntry);
  const updateLorebookEntry = useCardStore((state) => state.updateLorebookEntry);
  const removeLorebookEntry = useCardStore((state) => state.removeLorebookEntry);
  const reorderLorebookEntry = useCardStore((state) => state.reorderLorebookEntry);
  const inputRef = useRef<HTMLInputElement>(null);
  const book = card.data.character_book;

  const importLorebook = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const parsed = lorebookEnvelopeSchema.parse(JSON.parse(await file.text()));
    updateData("character_book", parsed.data);
    event.target.value = "";
  };

  const exportLorebook = () => {
    if (!book) {
      return;
    }
    const blob = new Blob([JSON.stringify({ spec: "lorebook_v3", data: book }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${book.name || card.data.name || "lorebook"}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!book) {
    return (
      <section className="panel">
        <div className="panel-heading">
          <h2>{t("lorebook.title")}</h2>
        </div>
        <Button icon={<Plus size={18} />} variant="primary" onClick={() => updateData("character_book", createBlankLorebook())}>
          {t("lorebook.create")}
        </Button>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>{t("lorebook.title")}</h2>
        <div className="inline-row compact">
          <input ref={inputRef} className="hidden-file" type="file" accept="application/json,.json" onChange={importLorebook} />
          <Button icon={<Upload size={16} />} onClick={() => inputRef.current?.click()}>
            {t("common.import")}
          </Button>
          <Button icon={<Download size={16} />} onClick={exportLorebook}>
            {t("common.export")}
          </Button>
          <Button icon={<Plus size={16} />} variant="primary" onClick={addLorebookEntry}>
            {t("lorebook.entry")}
          </Button>
        </div>
      </div>
      <div className="two-column">
        <TextField label={t("field.name")} value={book.name ?? ""} onChange={(event) => updateLorebook((current) => ({ ...current, name: event.target.value }))} />
        <TextField
          label={t("field.description")}
          value={book.description ?? ""}
          onChange={(event) => updateLorebook((current) => ({ ...current, description: event.target.value }))}
        />
        <TextField
          label={t("lorebook.scanDepth")}
          value={numberValue(book.scan_depth)}
          onChange={(event) => updateLorebook((current) => ({ ...current, scan_depth: parseNumber(event.target.value) }))}
        />
        <TextField
          label={t("lorebook.tokenBudget")}
          value={numberValue(book.token_budget)}
          onChange={(event) => updateLorebook((current) => ({ ...current, token_budget: parseNumber(event.target.value) }))}
        />
      </div>
      <label className="toggle-row">
        <input
          checked={book.recursive_scanning ?? false}
          type="checkbox"
          onChange={(event) => updateLorebook((current) => ({ ...current, recursive_scanning: event.target.checked }))}
        />
        <span>{t("lorebook.recursiveScanning")}</span>
      </label>
      <div className="stack">
        {book.entries.map((entry, index) => (
          <details className="lore-entry" key={`${entry.insertion_order}-${index}`}>
            <summary className="lore-entry-summary">
              <span className="lore-entry-summary-main">
                <strong>{entry.name || t("lorebook.entryNumber", { index: index + 1 })}</strong>
                <span>{entry.keys.length ? entry.keys.join(", ") : t("lorebook.noKeys")}</span>
              </span>
              <span className="lore-entry-summary-meta">
                <span className={entry.enabled ? "state-pill" : "state-pill state-pill-hot"}>
                  {entry.enabled ? t("common.enabled") : t("common.disabled")}
                </span>
                <span className="state-pill">#{entry.insertion_order}</span>
              </span>
              {entry.content.trim() ? <span className="lore-entry-preview">{entry.content.trim().replace(/\s+/g, " ").slice(0, 120)}</span> : null}
            </summary>
            <div className="lore-entry-body">
            <div className="list-editor-toolbar">
              <strong>{entry.name || t("lorebook.entryNumber", { index: index + 1 })}</strong>
              <div className="spacer" />
              <Button
                aria-label={t("common.moveUp")}
                icon={<ArrowUp size={16} />}
                disabled={index === 0}
                onClick={() => reorderLorebookEntry(index, index - 1)}
              />
              <Button
                aria-label={t("common.moveDown")}
                icon={<ArrowDown size={16} />}
                disabled={index === book.entries.length - 1}
                onClick={() => reorderLorebookEntry(index, index + 1)}
              />
              <Button icon={<Trash2 size={16} />} variant="danger" onClick={() => removeLorebookEntry(index)}>
                {t("common.delete")}
              </Button>
            </div>
            <div className="two-column">
              <TextField label={t("field.name")} value={entry.name ?? ""} onChange={(event) => updateLorebookEntry(index, (item) => ({ ...item, name: event.target.value }))} />
              <TextField
                label={t("lorebook.insertionOrder")}
                value={String(entry.insertion_order)}
                onChange={(event) => updateLorebookEntry(index, (item) => ({ ...item, insertion_order: Number(event.target.value) || 0 }))}
              />
              <TextField
                label={t("lorebook.priority")}
                value={numberValue(entry.priority)}
                onChange={(event) => updateLorebookEntry(index, (item) => ({ ...item, priority: parseNumber(event.target.value) }))}
              />
              <TextField
                label={t("common.id")}
                value={entry.id === undefined ? "" : String(entry.id)}
                onChange={(event) => updateLorebookEntry(index, (item) => ({ ...item, id: event.target.value }))}
              />
              <SelectField
                label={t("lorebook.position")}
                value={entry.position ?? ""}
                onChange={(event) =>
                  updateLorebookEntry(index, (item) => ({
                    ...item,
                    position: event.target.value === "before_char" || event.target.value === "after_char" ? event.target.value : undefined
                  }))
                }
              >
                <option value="">{t("common.default")}</option>
                <option value="before_char">{t("lorebook.beforeChar")}</option>
                <option value="after_char">{t("lorebook.afterChar")}</option>
              </SelectField>
              <TextField
                label={t("lorebook.comment")}
                value={entry.comment ?? ""}
                onChange={(event) => updateLorebookEntry(index, (item) => ({ ...item, comment: event.target.value }))}
              />
            </div>
            <ChipInput label={t("lorebook.keys")} values={entry.keys} onChange={(values) => updateLorebookEntry(index, (item) => ({ ...item, keys: values }))} />
            <ChipInput
              label={t("lorebook.secondaryKeys")}
              values={entry.secondary_keys ?? []}
              onChange={(values) => updateLorebookEntry(index, (item) => ({ ...item, secondary_keys: values }))}
            />
            <div className="check-grid">
              {[
                [t("common.enabled"), "enabled"],
                [t("lorebook.useRegex"), "use_regex"],
                [t("lorebook.caseSensitive"), "case_sensitive"],
                [t("lorebook.constant"), "constant"],
                [t("lorebook.selective"), "selective"]
              ].map(([label, key]) => (
                <label className="toggle-row" key={key}>
                  <input
                    checked={Boolean(entry[key])}
                    type="checkbox"
                    onChange={(event) => updateLorebookEntry(index, (item) => ({ ...item, [key]: event.target.checked }))}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <div className="editor-block">
              <span className="field-label">{t("lorebook.content")}</span>
              <AiFieldAssistant
                target={{ kind: "field", path: `/worldBook/entries/${index}/content`, label: `${t("lorebook.entryNumber", { index: index + 1 })} ${t("lorebook.content")}`, value: entry.content }}
                onApply={(value) => updateLorebookEntry(index, (item) => ({ ...item, content: value }))}
              >
                <CodeEditor value={entry.content} mode="prompt" minHeight="150px" onChange={(value) => updateLorebookEntry(index, (item) => ({ ...item, content: value }))} />
              </AiFieldAssistant>
            </div>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
