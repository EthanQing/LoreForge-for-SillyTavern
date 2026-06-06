import { ArrowDown, ArrowUp, Download, ListChecks, Plus, Trash2, Upload } from "lucide-react";
import { ChangeEvent, useRef } from "react";
import { useCardStore } from "../../app/store";
import { AiFieldAssistant } from "../../components/AiFieldAssistant";
import { Button } from "../../components/Button";
import { ChipInput } from "../../components/ChipInput";
import { CodeEditor } from "../../components/CodeEditor";
import { SelectField, TextField } from "../../components/Field";
import { useI18n } from "../../lib/i18n";
import {
  deriveLorebookEntryComment,
  fillEmptyLorebookEntryComments,
  normalizeLorebookForSillyTavern,
  sillyTavernPromptRoles,
  sillyTavernWorldInfoLogic,
  sillyTavernWorldInfoPositions,
  type SillyTavernLorebookEntryExtensions
} from "../../lib/lorebookCompat";
import { createBlankLorebook, lorebookEnvelopeSchema, type LorebookEntry } from "../../lib/schema";

function numberValue(value: number | undefined | null): string {
  return value === undefined || value === null ? "" : String(value);
}

function parseNumber(value: string): number | undefined {
  if (!value.trim()) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
}

function entryExtensions(entry: LorebookEntry): SillyTavernLorebookEntryExtensions {
  return (entry.extensions ?? {}) as SillyTavernLorebookEntryExtensions;
}

function extensionNumberValue(entry: LorebookEntry, key: keyof SillyTavernLorebookEntryExtensions): string {
  const value = entryExtensions(entry)[key];
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function extensionStringValue(entry: LorebookEntry, key: keyof SillyTavernLorebookEntryExtensions): string {
  const value = entryExtensions(entry)[key];
  return typeof value === "string" ? value : "";
}

function extensionBooleanValue(entry: LorebookEntry, key: keyof SillyTavernLorebookEntryExtensions): boolean {
  return entryExtensions(entry)[key] === true;
}

function extensionStringArrayValue(entry: LorebookEntry, key: keyof SillyTavernLorebookEntryExtensions): string[] {
  const value = entryExtensions(entry)[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function updateEntryExtension(
  entry: LorebookEntry,
  key: keyof SillyTavernLorebookEntryExtensions,
  value: string | number | boolean | string[] | undefined
): LorebookEntry {
  const extensions: Record<string, unknown> = { ...(entry.extensions ?? {}) };
  const shouldDelete =
    value === undefined ||
    (typeof value === "string" && value.trim().length === 0) ||
    (Array.isArray(value) && value.length === 0);

  if (shouldDelete) {
    delete extensions[key];
  } else {
    extensions[key] = value;
  }

  return {
    ...entry,
    extensions
  };
}

function positionValue(entry: LorebookEntry): string {
  const extensionPosition = entryExtensions(entry).position;
  if (typeof extensionPosition === "number" && Number.isFinite(extensionPosition)) {
    return String(Math.trunc(extensionPosition));
  }
  if (entry.position === "before_char") {
    return String(sillyTavernWorldInfoPositions.before);
  }
  if (entry.position === "after_char") {
    return String(sillyTavernWorldInfoPositions.after);
  }
  return "";
}

function updatePosition(entry: LorebookEntry, value: string): LorebookEntry {
  const parsed = parseNumber(value);
  const withExtension = updateEntryExtension(entry, "position", parsed);
  if (parsed === sillyTavernWorldInfoPositions.before) {
    return { ...withExtension, position: "before_char" };
  }
  if (parsed === sillyTavernWorldInfoPositions.after) {
    return { ...withExtension, position: "after_char" };
  }
  return { ...withExtension, position: undefined };
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
    updateData("character_book", normalizeLorebookForSillyTavern(parsed.data) ?? parsed.data);
    event.target.value = "";
  };

  const exportLorebook = () => {
    if (!book) {
      return;
    }
    const exportBook = normalizeLorebookForSillyTavern(book) ?? book;
    const blob = new Blob([JSON.stringify({ spec: "lorebook_v3", data: exportBook }, null, 2)], { type: "application/json" });
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
          <Button icon={<ListChecks size={16} />} onClick={() => updateLorebook(fillEmptyLorebookEntryComments)}>
            {t("lorebook.fillEmptyMemos")}
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
        {book.entries.map((entry, index) => {
          const entryTitle = deriveLorebookEntryComment(entry, index) || t("lorebook.entryNumber", { index: index + 1 });
          return (
            <details className="lore-entry" key={`${entry.insertion_order}-${index}`}>
              <summary className="lore-entry-summary">
                <span className="lore-entry-summary-main">
                  <strong>{entryTitle}</strong>
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
                  <strong>{entryTitle}</strong>
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
                  <TextField
                    label={t("lorebook.titleMemo")}
                    value={entry.comment ?? ""}
                    onChange={(event) => updateLorebookEntry(index, (item) => ({ ...item, comment: event.target.value }))}
                  />
                  <TextField
                    label={t("lorebook.insertionOrder")}
                    type="number"
                    value={String(entry.insertion_order)}
                    onChange={(event) => updateLorebookEntry(index, (item) => ({ ...item, insertion_order: Number(event.target.value) || 0 }))}
                  />
                  <TextField
                    label={t("lorebook.priority")}
                    type="number"
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
                    value={positionValue(entry)}
                    onChange={(event) => updateLorebookEntry(index, (item) => updatePosition(item, event.target.value))}
                  >
                    <option value="">{t("common.default")}</option>
                    <option value={sillyTavernWorldInfoPositions.before}>{t("lorebook.beforeChar")}</option>
                    <option value={sillyTavernWorldInfoPositions.after}>{t("lorebook.afterChar")}</option>
                    <option value={sillyTavernWorldInfoPositions.anTop}>{t("lorebook.positionAnTop")}</option>
                    <option value={sillyTavernWorldInfoPositions.anBottom}>{t("lorebook.positionAnBottom")}</option>
                    <option value={sillyTavernWorldInfoPositions.atDepth}>{t("lorebook.positionAtDepth")}</option>
                    <option value={sillyTavernWorldInfoPositions.examplesTop}>{t("lorebook.positionExamplesTop")}</option>
                    <option value={sillyTavernWorldInfoPositions.examplesBottom}>{t("lorebook.positionExamplesBottom")}</option>
                    <option value={sillyTavernWorldInfoPositions.outlet}>{t("lorebook.positionOutlet")}</option>
                  </SelectField>
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
                        onChange={(event) =>
                          updateLorebookEntry(index, (item) => {
                            const next = { ...item, [key]: event.target.checked };
                            return key === "case_sensitive"
                              ? updateEntryExtension(next, "case_sensitive", event.target.checked)
                              : next;
                          })
                        }
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
                <details className="advanced-panel">
                  <summary>{t("lorebook.advancedSettings")}</summary>
                  <div className="advanced-panel-body">
                    <div className="two-column">
                      <TextField
                        label={t("lorebook.depth")}
                        type="number"
                        value={extensionNumberValue(entry, "depth")}
                        onChange={(event) => updateLorebookEntry(index, (item) => updateEntryExtension(item, "depth", parseNumber(event.target.value)))}
                      />
                      <TextField
                        label={t("lorebook.probability")}
                        type="number"
                        value={extensionNumberValue(entry, "probability")}
                        onChange={(event) =>
                          updateLorebookEntry(index, (item) => updateEntryExtension(item, "probability", parseNumber(event.target.value)))
                        }
                      />
                      <SelectField
                        label={t("lorebook.selectiveLogic")}
                        value={extensionNumberValue(entry, "selectiveLogic")}
                        onChange={(event) =>
                          updateLorebookEntry(index, (item) => updateEntryExtension(item, "selectiveLogic", parseNumber(event.target.value)))
                        }
                      >
                        <option value="">{t("common.default")}</option>
                        <option value={sillyTavernWorldInfoLogic.andAny}>{t("lorebook.logicAndAny")}</option>
                        <option value={sillyTavernWorldInfoLogic.notAll}>{t("lorebook.logicNotAll")}</option>
                        <option value={sillyTavernWorldInfoLogic.notAny}>{t("lorebook.logicNotAny")}</option>
                        <option value={sillyTavernWorldInfoLogic.andAll}>{t("lorebook.logicAndAll")}</option>
                      </SelectField>
                      <SelectField
                        label={t("lorebook.role")}
                        value={extensionNumberValue(entry, "role")}
                        onChange={(event) => updateLorebookEntry(index, (item) => updateEntryExtension(item, "role", parseNumber(event.target.value)))}
                      >
                        <option value="">{t("common.default")}</option>
                        <option value={sillyTavernPromptRoles.system}>{t("lorebook.roleSystem")}</option>
                        <option value={sillyTavernPromptRoles.user}>{t("lorebook.roleUser")}</option>
                        <option value={sillyTavernPromptRoles.assistant}>{t("lorebook.roleAssistant")}</option>
                      </SelectField>
                      <TextField
                        label={t("lorebook.scanDepthOverride")}
                        type="number"
                        value={extensionNumberValue(entry, "scan_depth")}
                        onChange={(event) =>
                          updateLorebookEntry(index, (item) => updateEntryExtension(item, "scan_depth", parseNumber(event.target.value)))
                        }
                      />
                      <TextField
                        label={t("lorebook.displayIndex")}
                        type="number"
                        value={extensionNumberValue(entry, "display_index")}
                        onChange={(event) =>
                          updateLorebookEntry(index, (item) => updateEntryExtension(item, "display_index", parseNumber(event.target.value)))
                        }
                      />
                      <TextField
                        label={t("lorebook.automationId")}
                        value={extensionStringValue(entry, "automation_id")}
                        onChange={(event) => updateLorebookEntry(index, (item) => updateEntryExtension(item, "automation_id", event.target.value))}
                      />
                      <TextField
                        label={t("lorebook.outletName")}
                        value={extensionStringValue(entry, "outlet_name")}
                        onChange={(event) => updateLorebookEntry(index, (item) => updateEntryExtension(item, "outlet_name", event.target.value))}
                      />
                      <TextField
                        label={t("lorebook.group")}
                        value={extensionStringValue(entry, "group")}
                        onChange={(event) => updateLorebookEntry(index, (item) => updateEntryExtension(item, "group", event.target.value))}
                      />
                      <TextField
                        label={t("lorebook.groupWeight")}
                        type="number"
                        value={extensionNumberValue(entry, "group_weight")}
                        onChange={(event) =>
                          updateLorebookEntry(index, (item) => updateEntryExtension(item, "group_weight", parseNumber(event.target.value)))
                        }
                      />
                      <TextField
                        label={t("lorebook.sticky")}
                        type="number"
                        value={extensionNumberValue(entry, "sticky")}
                        onChange={(event) => updateLorebookEntry(index, (item) => updateEntryExtension(item, "sticky", parseNumber(event.target.value)))}
                      />
                      <TextField
                        label={t("lorebook.cooldown")}
                        type="number"
                        value={extensionNumberValue(entry, "cooldown")}
                        onChange={(event) => updateLorebookEntry(index, (item) => updateEntryExtension(item, "cooldown", parseNumber(event.target.value)))}
                      />
                      <TextField
                        label={t("lorebook.delay")}
                        type="number"
                        value={extensionNumberValue(entry, "delay")}
                        onChange={(event) => updateLorebookEntry(index, (item) => updateEntryExtension(item, "delay", parseNumber(event.target.value)))}
                      />
                    </div>
                    <div className="check-grid advanced-check-grid">
                      {[
                        [t("lorebook.useProbability"), "useProbability"],
                        [t("lorebook.excludeRecursion"), "exclude_recursion"],
                        [t("lorebook.preventRecursion"), "prevent_recursion"],
                        [t("lorebook.delayUntilRecursion"), "delay_until_recursion"],
                        [t("lorebook.matchWholeWords"), "match_whole_words"],
                        [t("lorebook.useGroupScoring"), "use_group_scoring"],
                        [t("lorebook.groupOverride"), "group_override"],
                        [t("lorebook.vectorized"), "vectorized"],
                        [t("lorebook.ignoreBudget"), "ignore_budget"],
                        [t("lorebook.matchPersonaDescription"), "match_persona_description"],
                        [t("lorebook.matchCharacterDescription"), "match_character_description"],
                        [t("lorebook.matchCharacterPersonality"), "match_character_personality"],
                        [t("lorebook.matchCharacterDepthPrompt"), "match_character_depth_prompt"],
                        [t("lorebook.matchScenario"), "match_scenario"],
                        [t("lorebook.matchCreatorNotes"), "match_creator_notes"]
                      ].map(([label, key]) => (
                        <label className="toggle-row" key={key}>
                          <input
                            checked={extensionBooleanValue(entry, key as keyof SillyTavernLorebookEntryExtensions)}
                            type="checkbox"
                            onChange={(event) =>
                              updateLorebookEntry(index, (item) =>
                                updateEntryExtension(item, key as keyof SillyTavernLorebookEntryExtensions, event.target.checked)
                              )
                            }
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                    <ChipInput
                      label={t("lorebook.triggers")}
                      values={extensionStringArrayValue(entry, "triggers")}
                      onChange={(values) => updateLorebookEntry(index, (item) => updateEntryExtension(item, "triggers", values))}
                    />
                  </div>
                </details>
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
          );
        })}
      </div>
    </section>
  );
}
