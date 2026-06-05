import { ArrowDown, ArrowUp, Download, Plus, Trash2, Upload } from "lucide-react";
import { ChangeEvent, useRef } from "react";
import { useCardStore } from "../../app/store";
import { Button } from "../../components/Button";
import { ChipInput } from "../../components/ChipInput";
import { CodeEditor } from "../../components/CodeEditor";
import { SelectField, TextField } from "../../components/Field";
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
          <h2>Lorebook</h2>
        </div>
        <Button icon={<Plus size={18} />} variant="primary" onClick={() => updateData("character_book", createBlankLorebook())}>
          Create Lorebook
        </Button>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Lorebook</h2>
        <div className="inline-row compact">
          <input ref={inputRef} className="hidden-file" type="file" accept="application/json,.json" onChange={importLorebook} />
          <Button icon={<Upload size={16} />} onClick={() => inputRef.current?.click()}>
            Import
          </Button>
          <Button icon={<Download size={16} />} onClick={exportLorebook}>
            Export
          </Button>
          <Button icon={<Plus size={16} />} variant="primary" onClick={addLorebookEntry}>
            Entry
          </Button>
        </div>
      </div>
      <div className="two-column">
        <TextField label="Name" value={book.name ?? ""} onChange={(event) => updateLorebook((current) => ({ ...current, name: event.target.value }))} />
        <TextField
          label="Description"
          value={book.description ?? ""}
          onChange={(event) => updateLorebook((current) => ({ ...current, description: event.target.value }))}
        />
        <TextField
          label="Scan Depth"
          value={numberValue(book.scan_depth)}
          onChange={(event) => updateLorebook((current) => ({ ...current, scan_depth: parseNumber(event.target.value) }))}
        />
        <TextField
          label="Token Budget"
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
        <span>Recursive Scanning</span>
      </label>
      <div className="stack">
        {book.entries.map((entry, index) => (
          <article className="lore-entry" key={`${entry.insertion_order}-${index}`}>
            <div className="list-editor-toolbar">
              <strong>{entry.name || `Entry ${index + 1}`}</strong>
              <div className="spacer" />
              <Button icon={<ArrowUp size={16} />} disabled={index === 0} onClick={() => reorderLorebookEntry(index, index - 1)} />
              <Button icon={<ArrowDown size={16} />} disabled={index === book.entries.length - 1} onClick={() => reorderLorebookEntry(index, index + 1)} />
              <Button icon={<Trash2 size={16} />} variant="danger" onClick={() => removeLorebookEntry(index)}>
                Delete
              </Button>
            </div>
            <div className="two-column">
              <TextField label="Name" value={entry.name ?? ""} onChange={(event) => updateLorebookEntry(index, (item) => ({ ...item, name: event.target.value }))} />
              <TextField
                label="Insertion Order"
                value={String(entry.insertion_order)}
                onChange={(event) => updateLorebookEntry(index, (item) => ({ ...item, insertion_order: Number(event.target.value) || 0 }))}
              />
              <TextField
                label="Priority"
                value={numberValue(entry.priority)}
                onChange={(event) => updateLorebookEntry(index, (item) => ({ ...item, priority: parseNumber(event.target.value) }))}
              />
              <TextField label="ID" value={entry.id === undefined ? "" : String(entry.id)} onChange={(event) => updateLorebookEntry(index, (item) => ({ ...item, id: event.target.value }))} />
              <SelectField
                label="Position"
                value={entry.position ?? ""}
                onChange={(event) =>
                  updateLorebookEntry(index, (item) => ({
                    ...item,
                    position: event.target.value === "before_char" || event.target.value === "after_char" ? event.target.value : undefined
                  }))
                }
              >
                <option value="">Default</option>
                <option value="before_char">before_char</option>
                <option value="after_char">after_char</option>
              </SelectField>
              <TextField
                label="Comment"
                value={entry.comment ?? ""}
                onChange={(event) => updateLorebookEntry(index, (item) => ({ ...item, comment: event.target.value }))}
              />
            </div>
            <ChipInput label="Keys" values={entry.keys} onChange={(values) => updateLorebookEntry(index, (item) => ({ ...item, keys: values }))} />
            <ChipInput
              label="Secondary Keys"
              values={entry.secondary_keys ?? []}
              onChange={(values) => updateLorebookEntry(index, (item) => ({ ...item, secondary_keys: values }))}
            />
            <div className="check-grid">
              {[
                ["Enabled", "enabled"],
                ["Use Regex", "use_regex"],
                ["Case Sensitive", "case_sensitive"],
                ["Constant", "constant"],
                ["Selective", "selective"]
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
              <span className="field-label">Content</span>
              <CodeEditor value={entry.content} mode="prompt" minHeight="150px" onChange={(value) => updateLorebookEntry(index, (item) => ({ ...item, content: value }))} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
