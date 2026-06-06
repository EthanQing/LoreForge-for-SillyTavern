import { ArrowDown, ArrowUp, Download, GripVertical, ListChecks, Plus, Trash2, Upload } from "lucide-react";
import { type ChangeEvent, type DragEvent, type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import { useProjectActions } from "../../app/useProjectActions";
import { useCardStore } from "../../app/store";
import { AiFieldAssistant } from "../../components/AiFieldAssistant";
import { Button } from "../../components/Button";
import { ChipInput } from "../../components/ChipInput";
import { CodeEditor } from "../../components/CodeEditor";
import { Collapsible } from "../../components/Collapsible";
import { SelectField, TextField } from "../../components/Field";
import { registerContextMenuTarget, useContextMenuTarget } from "../../lib/contextMenuTargets";
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

const DEPTH_POSITION_PREFIX = "depth:";
const LOREBOOK_ENTRY_CONTEXT_ID_PREFIX = "lorebook-entry-";

function extensionRoleValue(entry: LorebookEntry): number {
  const role = entryExtensions(entry).role;
  return typeof role === "number" && Number.isFinite(role) ? Math.trunc(role) : sillyTavernPromptRoles.system;
}

function insertionPositionValue(entry: LorebookEntry): string {
  const extensionPosition = entryExtensions(entry).position;
  if (typeof extensionPosition === "number" && Number.isFinite(extensionPosition)) {
    const position = Math.trunc(extensionPosition);
    return position === sillyTavernWorldInfoPositions.atDepth
      ? `${DEPTH_POSITION_PREFIX}${extensionRoleValue(entry)}`
      : String(position);
  }
  if (entry.position === "before_char") {
    return String(sillyTavernWorldInfoPositions.before);
  }
  if (entry.position === "after_char") {
    return String(sillyTavernWorldInfoPositions.after);
  }
  return "";
}

function updateInsertionPosition(entry: LorebookEntry, value: string): LorebookEntry {
  const isDepthPosition = value.startsWith(DEPTH_POSITION_PREFIX);
  const parsed = isDepthPosition
    ? sillyTavernWorldInfoPositions.atDepth
    : parseNumber(value);
  const role = isDepthPosition ? parseNumber(value.slice(DEPTH_POSITION_PREFIX.length)) : undefined;
  const withPosition = updateEntryExtension(entry, "position", parsed);
  const withRole =
    parsed === sillyTavernWorldInfoPositions.atDepth
      ? updateEntryExtension(withPosition, "role", role ?? sillyTavernPromptRoles.system)
      : updateEntryExtension(withPosition, "role", undefined);

  if (parsed === sillyTavernWorldInfoPositions.before) {
    return { ...withRole, position: "before_char" };
  }
  if (parsed === sillyTavernWorldInfoPositions.after) {
    return { ...withRole, position: "after_char" };
  }
  return { ...withRole, position: undefined };
}

function triggerStrategyValue(entry: LorebookEntry): string {
  if (entry.constant === true) {
    return "constant";
  }
  if (extensionBooleanValue(entry, "vectorized")) {
    return "vectorized";
  }
  return "keyword";
}

function updateTriggerStrategy(entry: LorebookEntry, value: string): LorebookEntry {
  const nextEntry = {
    ...entry,
    constant: value === "constant"
  };
  return updateEntryExtension(nextEntry, "vectorized", value === "vectorized");
}

function summarizeEntryKeys(keys: string[], emptyLabel: string): string {
  const visibleKeys: string[] = [];
  let keyCount = 0;

  for (const key of keys) {
    const trimmed = key.trim();
    if (!trimmed) {
      continue;
    }
    keyCount += 1;
    if (visibleKeys.length < 4) {
      visibleKeys.push(trimmed.length > 36 ? `${trimmed.slice(0, 36)}...` : trimmed);
    }
  }

  if (keyCount === 0) {
    return emptyLabel;
  }

  const remainingCount = keyCount - visibleKeys.length;
  return remainingCount > 0 ? `${visibleKeys.join(", ")} +${remainingCount}` : visibleKeys.join(", ");
}

function summarizeEntryContent(content: string): string {
  const preview = content.slice(0, 480).trim().replace(/\s+/g, " ");
  return preview.length > 120 ? `${preview.slice(0, 120)}...` : preview;
}

function remapOpenEntriesAfterMove(openEntries: Record<number, boolean>, from: number, to: number): Record<number, boolean> {
  const nextEntries: Record<number, boolean> = {};
  const movedEntryOpen = openEntries[from];

  for (const [rawIndex, isOpen] of Object.entries(openEntries)) {
    const index = Number(rawIndex);
    if (!Number.isInteger(index) || index === from) {
      continue;
    }

    if (from < to && index > from && index <= to) {
      nextEntries[index - 1] = isOpen;
    } else if (from > to && index >= to && index < from) {
      nextEntries[index + 1] = isOpen;
    } else {
      nextEntries[index] = isOpen;
    }
  }

  if (movedEntryOpen !== undefined) {
    nextEntries[to] = movedEntryOpen;
  }

  return nextEntries;
}

function remapOpenEntriesAfterRemove(openEntries: Record<number, boolean>, removedIndex: number): Record<number, boolean> {
  const nextEntries: Record<number, boolean> = {};

  for (const [rawIndex, isOpen] of Object.entries(openEntries)) {
    const index = Number(rawIndex);
    if (!Number.isInteger(index) || index === removedIndex || !isOpen) {
      continue;
    }
    nextEntries[index > removedIndex ? index - 1 : index] = isOpen;
  }

  return nextEntries;
}

export function LorebookPanel() {
  const { t } = useI18n();
  const { copyArbitraryText } = useProjectActions();
  const card = useCardStore((state) => state.card);
  const updateData = useCardStore((state) => state.updateData);
  const updateLorebook = useCardStore((state) => state.updateLorebook);
  const addLorebookEntry = useCardStore((state) => state.addLorebookEntry);
  const updateLorebookEntry = useCardStore((state) => state.updateLorebookEntry);
  const removeLorebookEntry = useCardStore((state) => state.removeLorebookEntry);
  const reorderLorebookEntry = useCardStore((state) => state.reorderLorebookEntry);
  const inputRef = useRef<HTMLInputElement>(null);
  const entryRefs = useRef<Array<HTMLDivElement | null>>([]);
  const draggedEntryIndexRef = useRef<number | null>(null);
  const pointerDragRef = useRef<{ from: number; over: number; pointerId: number } | null>(null);
  const [openEntries, setOpenEntries] = useState<Record<number, boolean>>({});
  const [draggedEntryIndex, setDraggedEntryIndex] = useState<number | null>(null);
  const [dragOverEntryIndex, setDragOverEntryIndex] = useState<number | null>(null);
  const book = card.data.character_book;

  const moveLorebookEntry = (from: number, to: number) => {
    setOpenEntries((current) => remapOpenEntriesAfterMove(current, from, to));
    reorderLorebookEntry(from, to);
  };

  const deleteLorebookEntry = (index: number) => {
    setOpenEntries((current) => remapOpenEntriesAfterRemove(current, index));
    removeLorebookEntry(index);
  };

  const finishDrag = () => {
    draggedEntryIndexRef.current = null;
    pointerDragRef.current = null;
    setDraggedEntryIndex(null);
    setDragOverEntryIndex(null);
  };

  const handleEntryDragStart = (event: DragEvent<HTMLElement>, index: number) => {
    draggedEntryIndexRef.current = index;
    setDraggedEntryIndex(index);
    setDragOverEntryIndex(index);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));
  };

  const handleEntryDragOver = (event: DragEvent<HTMLElement>, index: number) => {
    if (draggedEntryIndexRef.current === null) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverEntryIndex(index);
  };

  const handleEntryDrop = (event: DragEvent<HTMLElement>, index: number) => {
    event.preventDefault();
    if (!book) {
      finishDrag();
      return;
    }
    const rawIndex = event.dataTransfer.getData("text/plain");
    const from = draggedEntryIndexRef.current ?? Number(rawIndex);
    finishDrag();
    if (!Number.isInteger(from) || from < 0 || from >= book.entries.length || from === index) {
      return;
    }
    moveLorebookEntry(from, index);
  };

  const findEntryIndexAtPoint = (clientX: number, clientY: number): number | null => {
    for (const [index, element] of entryRefs.current.entries()) {
      if (!element) {
        continue;
      }
      const rect = element.getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
        return index;
      }
    }
    return null;
  };

  const handleEntryPointerDragStart = (event: ReactPointerEvent<HTMLElement>, index: number) => {
    if (event.button !== 0 || !event.isPrimary) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    draggedEntryIndexRef.current = index;
    pointerDragRef.current = { from: index, over: index, pointerId: event.pointerId };
    setDraggedEntryIndex(index);
    setDragOverEntryIndex(index);
  };

  const handleEntryPointerDragMove = (event: ReactPointerEvent<HTMLElement>) => {
    const pointerDrag = pointerDragRef.current;
    if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const overIndex = findEntryIndexAtPoint(event.clientX, event.clientY);
    if (overIndex === null || overIndex === pointerDrag.over) {
      return;
    }
    pointerDragRef.current = { ...pointerDrag, over: overIndex };
    setDragOverEntryIndex(overIndex);
  };

  const handleEntryPointerDragEnd = (event: ReactPointerEvent<HTMLElement>) => {
    const pointerDrag = pointerDragRef.current;
    if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const { from, over } = pointerDrag;
    finishDrag();
    if (!book || from === over || from < 0 || over < 0 || from >= book.entries.length || over >= book.entries.length) {
      return;
    }
    moveLorebookEntry(from, over);
  };

  const handleEntryPointerDragCancel = (event: ReactPointerEvent<HTMLElement>) => {
    const pointerDrag = pointerDragRef.current;
    if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) {
      return;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    finishDrag();
  };

  const setLorebookEntryOpen = (index: number, nextOpen: boolean) => {
    setOpenEntries((current) => {
      if (nextOpen) {
        return { ...current, [index]: true };
      }
      const nextEntries = { ...current };
      delete nextEntries[index];
      return nextEntries;
    });
  };

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

  const panelContextTargetId = useContextMenuTarget(() => ({
    kind: "lorebook-panel",
    hasBook: Boolean(book),
    createLorebook: () => updateData("character_book", createBlankLorebook()),
    addEntry: addLorebookEntry,
    importLorebook: () => inputRef.current?.click(),
    exportLorebook,
    fillEmptyMemos: () => updateLorebook(fillEmptyLorebookEntryComments)
  }));

  useEffect(() => {
    if (!book) {
      return undefined;
    }

    const unregisters = book.entries.map((entry, index) => {
      const entryTitle = deriveLorebookEntryComment(entry, index) || t("lorebook.entryNumber", { index: index + 1 });
      return registerContextMenuTarget(`${LOREBOOK_ENTRY_CONTEXT_ID_PREFIX}${index}`, () => ({
        kind: "lorebook-entry",
        title: entryTitle,
        index,
        isOpen: openEntries[index] ?? false,
        isEnabled: entry.enabled !== false,
        canMoveUp: index > 0,
        canMoveDown: index < book.entries.length - 1,
        setOpen: (open) => setLorebookEntryOpen(index, open),
        moveUp: () => moveLorebookEntry(index, index - 1),
        moveDown: () => moveLorebookEntry(index, index + 1),
        toggleEnabled: () => updateLorebookEntry(index, (item) => ({ ...item, enabled: item.enabled === false })),
        copyJson: () => copyArbitraryText(JSON.stringify(entry, null, 2)),
        deleteEntry: () => deleteLorebookEntry(index)
      }));
    });

    return () => unregisters.forEach((unregister) => unregister());
  }, [book, copyArbitraryText, openEntries, t]);

  if (!book) {
    entryRefs.current.length = 0;
    return (
      <section className="panel" data-context-menu="lorebook-panel" data-context-target-id={panelContextTargetId}>
        <div className="panel-heading">
          <h2>{t("lorebook.title")}</h2>
        </div>
        <Button icon={<Plus size={18} />} variant="primary" onClick={() => updateData("character_book", createBlankLorebook())}>
          {t("lorebook.create")}
        </Button>
      </section>
    );
  }

  entryRefs.current.length = book.entries.length;

  return (
    <section className="panel" data-context-menu="lorebook-panel" data-context-target-id={panelContextTargetId}>
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
          const isOpen = openEntries[index] ?? false;
          const entryKeys = summarizeEntryKeys(entry.keys, t("lorebook.noKeys"));
          const entryPreview = isOpen ? "" : summarizeEntryContent(entry.content);
          return (
            <Collapsible
              key={`${entry.insertion_order}-${index}`}
              rootRef={(element) => {
                entryRefs.current[index] = element;
              }}
              className={[
                "lore-entry",
                draggedEntryIndex === index ? "is-dragging" : "",
                dragOverEntryIndex === index && draggedEntryIndex !== index ? "is-drag-over" : ""
              ].filter(Boolean).join(" ")}
              triggerClassName="lore-entry-summary"
              bodyClassName="lore-entry-body"
              contextMenu="lorebook-entry"
              contextTargetId={`${LOREBOOK_ENTRY_CONTEXT_ID_PREFIX}${index}`}
              open={isOpen}
              lazyMount
              unmountOnClose
              triggerDraggable
              onDragOver={(event) => handleEntryDragOver(event, index)}
              onDrop={(event) => handleEntryDrop(event, index)}
              onOpenChange={(nextOpen) => setLorebookEntryOpen(index, nextOpen)}
              onTriggerDragEnd={finishDrag}
              onTriggerDragStart={(event) => handleEntryDragStart(event, index)}
              title={
                <>
                  <span
                    aria-label={t("lorebook.dragReorder")}
                    className="lore-entry-drag-handle"
                    draggable={false}
                    title={t("lorebook.dragReorder")}
                    onClick={(event) => event.stopPropagation()}
                    onDragStart={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onPointerCancel={handleEntryPointerDragCancel}
                    onPointerDown={(event) => handleEntryPointerDragStart(event, index)}
                    onPointerMove={handleEntryPointerDragMove}
                    onPointerUp={handleEntryPointerDragEnd}
                  >
                    <GripVertical size={16} aria-hidden="true" />
                  </span>
                  <span className="lore-entry-summary-main">
                    <strong>{entryTitle}</strong>
                    <span>{entryKeys}</span>
                  </span>
                  <span className="lore-entry-summary-meta">
                    <span className={entry.enabled ? "state-pill" : "state-pill state-pill-hot"}>
                      {entry.enabled ? t("common.enabled") : t("common.disabled")}
                    </span>
                    <span className="state-pill">#{entry.insertion_order}</span>
                  </span>
                  {entryPreview ? <span className="lore-entry-preview">{entryPreview}</span> : null}
                </>
              }
            >
              <div className="list-editor-toolbar">
                <strong>{entryTitle}</strong>
                <div className="spacer" />
                <Button
                  aria-label={t("common.moveUp")}
                  icon={<ArrowUp size={16} />}
                  disabled={index === 0}
                  onClick={() => moveLorebookEntry(index, index - 1)}
                />
                <Button
                  aria-label={t("common.moveDown")}
                  icon={<ArrowDown size={16} />}
                  disabled={index === book.entries.length - 1}
                  onClick={() => moveLorebookEntry(index, index + 1)}
                />
                <Button icon={<Trash2 size={16} />} variant="danger" onClick={() => deleteLorebookEntry(index)}>
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
                  value={insertionPositionValue(entry)}
                  onChange={(event) => updateLorebookEntry(index, (item) => updateInsertionPosition(item, event.target.value))}
                >
                  <option value="">{t("common.default")}</option>
                  <option value={sillyTavernWorldInfoPositions.before}>{t("lorebook.positionBeforeChar")}</option>
                  <option value={sillyTavernWorldInfoPositions.after}>{t("lorebook.positionAfterChar")}</option>
                  <option value={sillyTavernWorldInfoPositions.examplesTop}>{t("lorebook.positionBeforeExamples")}</option>
                  <option value={sillyTavernWorldInfoPositions.examplesBottom}>{t("lorebook.positionAfterExamples")}</option>
                  <option value={sillyTavernWorldInfoPositions.anTop}>{t("lorebook.positionBeforeAuthorsNote")}</option>
                  <option value={sillyTavernWorldInfoPositions.anBottom}>{t("lorebook.positionAfterAuthorsNote")}</option>
                  <option value={`${DEPTH_POSITION_PREFIX}${sillyTavernPromptRoles.system}`}>{t("lorebook.positionDepthSystem")}</option>
                  <option value={`${DEPTH_POSITION_PREFIX}${sillyTavernPromptRoles.user}`}>{t("lorebook.positionDepthUser")}</option>
                  <option value={`${DEPTH_POSITION_PREFIX}${sillyTavernPromptRoles.assistant}`}>{t("lorebook.positionDepthAssistant")}</option>
                  <option value={sillyTavernWorldInfoPositions.outlet}>{t("lorebook.positionOutlet")}</option>
                </SelectField>
                <SelectField
                  label={t("lorebook.triggerStrategy")}
                  value={triggerStrategyValue(entry)}
                  onChange={(event) => updateLorebookEntry(index, (item) => updateTriggerStrategy(item, event.target.value))}
                >
                  <option value="keyword">{t("lorebook.triggerStrategyKeyword")}</option>
                  <option value="constant">{t("lorebook.triggerStrategyConstant")}</option>
                  <option value="vectorized">{t("lorebook.triggerStrategyVectorized")}</option>
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
              <Collapsible
                className="advanced-panel"
                bodyClassName="advanced-panel-body"
                lazyMount
                unmountOnClose
                title={t("lorebook.advancedSettings")}
              >
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
              </Collapsible>
              <div className="editor-block">
                <span className="field-label">{t("lorebook.content")}</span>
                <AiFieldAssistant
                  target={{ kind: "field", path: `/worldBook/entries/${index}/content`, label: `${t("lorebook.entryNumber", { index: index + 1 })} ${t("lorebook.content")}`, value: entry.content }}
                  onApply={(value) => updateLorebookEntry(index, (item) => ({ ...item, content: value }))}
                >
                  <CodeEditor value={entry.content} mode="prompt" minHeight="150px" onChange={(value) => updateLorebookEntry(index, (item) => ({ ...item, content: value }))} />
                </AiFieldAssistant>
              </div>
            </Collapsible>
          );
        })}
      </div>
    </section>
  );
}
