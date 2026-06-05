import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useCardStore } from "../../app/store";
import { Button } from "../../components/Button";
import { CodeEditor } from "../../components/CodeEditor";
import { TextField } from "../../components/Field";
import { ChipInput } from "../../components/ChipInput";

function formatTimestamp(value?: number): string {
  return value ? new Date(value * 1000).toLocaleString() : "";
}

function safeJson(value: unknown): string {
  return JSON.stringify(value ?? {}, null, 2);
}

export function BasicInfoPanel() {
  const card = useCardStore((state) => state.card);
  const updateData = useCardStore((state) => state.updateData);
  const data = card.data;
  const [sourceDraft, setSourceDraft] = useState("");
  const multilingualText = useMemo(() => safeJson(data.creator_notes_multilingual), [data.creator_notes_multilingual]);

  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Basic Info</h2>
      </div>
      <div className="two-column">
        <TextField label="Name" value={data.name} onChange={(event) => updateData("name", event.target.value)} />
        <TextField label="Nickname" value={data.nickname ?? ""} onChange={(event) => updateData("nickname", event.target.value)} />
        <TextField label="Creator" value={data.creator} onChange={(event) => updateData("creator", event.target.value)} />
        <TextField
          label="Character Version"
          value={data.character_version}
          onChange={(event) => updateData("character_version", event.target.value)}
        />
        <TextField label="Created" value={formatTimestamp(data.creation_date)} readOnly />
        <TextField label="Modified" value={formatTimestamp(data.modification_date)} readOnly />
      </div>
      <ChipInput label="Tags" values={data.tags} onChange={(tags) => updateData("tags", tags)} />
      <div className="field">
        <span className="field-label">Source</span>
        <div className="source-list">
          {(data.source ?? []).map((source, index) => (
            <span className="source-item" key={`${source}-${index}`}>
              {source}
            </span>
          ))}
        </div>
        <div className="inline-row">
          <input
            className="input"
            value={sourceDraft}
            onChange={(event) => setSourceDraft(event.target.value)}
            placeholder="App source ID or URL"
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
            Add
          </Button>
        </div>
      </div>
      <div className="editor-block">
        <span className="field-label">Creator Notes</span>
        <CodeEditor value={data.creator_notes} mode="prompt" minHeight="140px" onChange={(value) => updateData("creator_notes", value)} />
      </div>
      <div className="editor-block">
        <span className="field-label">Creator Notes Multilingual</span>
        <CodeEditor
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
