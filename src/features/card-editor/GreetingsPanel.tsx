import { GripVertical, Plus, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import { promoteAlternateGreetingToFirst, useCardStore } from "../../app/store";
import { AiFieldAssistant } from "../../components/AiFieldAssistant";
import { Button } from "../../components/Button";
import { CodeEditor } from "../../components/CodeEditor";
import { useI18n } from "../../lib/i18n";

function GreetingList({
  title,
  aiEnabled = true,
  path,
  values,
  onChange,
  onPromote
}: {
  title: string;
  aiEnabled?: boolean;
  path: string;
  values: string[];
  onChange: (values: string[]) => void;
  onPromote?: (value: string, index: number) => void;
}) {
  const { t } = useI18n();
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  return (
    <section className="subpanel">
      <div className="subpanel-heading">
        <h3>{title}</h3>
        <Button icon={<Plus size={16} />} onClick={() => onChange([...values, ""])}>
          {t("common.add")}
        </Button>
      </div>
      {values.length === 0 ? <p className="muted">{t("greetings.empty")}</p> : null}
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
                  {t("greetings.promoteFirst")}
                </Button>
              ) : null}
              <Button
                icon={<Trash2 size={16} />}
                variant="danger"
                onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))}
              >
                {t("common.delete")}
              </Button>
            </div>
            {aiEnabled ? (
              <AiFieldAssistant
                target={{ path: `/alternateGreetings/${index}`, label: `${title} #${index + 1}`, value }}
              >
                <CodeEditor
                  value={value}
                  mode="prompt"
                  minHeight="110px"
                  onChange={(nextValue) => onChange(values.map((item, itemIndex) => (itemIndex === index ? nextValue : item)))}
                />
              </AiFieldAssistant>
            ) : (
              <CodeEditor
                value={value}
                mode="prompt"
                minHeight="110px"
                onChange={(nextValue) => onChange(values.map((item, itemIndex) => (itemIndex === index ? nextValue : item)))}
              />
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

export function GreetingsPanel() {
  const { t } = useI18n();
  const data = useCardStore((state) => state.card.data);
  const updateData = useCardStore((state) => state.updateData);
  const updateCard = useCardStore((state) => state.updateCard);

  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>{t("greetings.title")}</h2>
      </div>
      <div className="editor-block">
        <span className="field-label">{t("greetings.firstMessage")}</span>
        <AiFieldAssistant target={{ path: "/firstMessage", label: t("greetings.firstMessage"), value: data.first_mes }}>
          <CodeEditor value={data.first_mes} mode="prompt" minHeight="180px" onChange={(value) => updateData("first_mes", value)} />
        </AiFieldAssistant>
      </div>
      <GreetingList
        path="/alternateGreetings"
        title={t("greetings.alternateGreetings")}
        values={data.alternate_greetings}
        onChange={(values) => updateData("alternate_greetings", values)}
        onPromote={(value, index) => {
          updateCard((card) => ({
            ...card,
            data: {
              ...card.data,
              first_mes: value,
              alternate_greetings: promoteAlternateGreetingToFirst(card.data.first_mes, card.data.alternate_greetings, index)
            }
          }));
        }}
      />
      <GreetingList path="" aiEnabled={false} title={t("greetings.groupOnlyGreetings")} values={data.group_only_greetings} onChange={(values) => updateData("group_only_greetings", values)} />
    </section>
  );
}
