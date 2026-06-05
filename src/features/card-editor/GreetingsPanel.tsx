import { GripVertical, Plus, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import { useCardStore } from "../../app/store";
import { Button } from "../../components/Button";
import { CodeEditor } from "../../components/CodeEditor";

function GreetingList({
  title,
  values,
  onChange,
  onPromote
}: {
  title: string;
  values: string[];
  onChange: (values: string[]) => void;
  onPromote?: (value: string, index: number) => void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  return (
    <section className="subpanel">
      <div className="subpanel-heading">
        <h3>{title}</h3>
        <Button icon={<Plus size={16} />} onClick={() => onChange([...values, ""])}>
          Add
        </Button>
      </div>
      {values.length === 0 ? <p className="muted">Empty</p> : null}
      <div className="stack">
        {values.map((value, index) => (
          <article
            className="list-editor"
            draggable
            key={`${title}-${index}`}
            onDragStart={() => setDragIndex(index)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (dragIndex === null || dragIndex === index) {
                return;
              }
              const next = [...values];
              const [moved] = next.splice(dragIndex, 1);
              next.splice(index, 0, moved);
              onChange(next);
              setDragIndex(null);
            }}
          >
            <div className="list-editor-toolbar">
              <GripVertical size={16} />
              <span>#{index + 1}</span>
              <div className="spacer" />
              {onPromote ? (
                <Button icon={<Star size={16} />} variant="ghost" onClick={() => onPromote(value, index)}>
                  First
                </Button>
              ) : null}
              <Button
                icon={<Trash2 size={16} />}
                variant="danger"
                onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))}
              >
                Delete
              </Button>
            </div>
            <CodeEditor
              value={value}
              mode="prompt"
              minHeight="110px"
              onChange={(nextValue) => onChange(values.map((item, itemIndex) => (itemIndex === index ? nextValue : item)))}
            />
          </article>
        ))}
      </div>
    </section>
  );
}

export function GreetingsPanel() {
  const data = useCardStore((state) => state.card.data);
  const updateData = useCardStore((state) => state.updateData);

  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Greetings</h2>
      </div>
      <div className="editor-block">
        <span className="field-label">First Message</span>
        <CodeEditor value={data.first_mes} mode="prompt" minHeight="180px" onChange={(value) => updateData("first_mes", value)} />
      </div>
      <GreetingList
        title="Alternate Greetings"
        values={data.alternate_greetings}
        onChange={(values) => updateData("alternate_greetings", values)}
        onPromote={(value, index) => {
          updateData("first_mes", value);
          updateData(
            "alternate_greetings",
            data.alternate_greetings.filter((_, itemIndex) => itemIndex !== index)
          );
        }}
      />
      <GreetingList title="Group Only Greetings" values={data.group_only_greetings} onChange={(values) => updateData("group_only_greetings", values)} />
    </section>
  );
}
