import { Plus, X } from "lucide-react";
import { useState } from "react";
import { Button } from "./Button";
import { useI18n } from "../lib/i18n";

interface ChipInputProps {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}

export function ChipInput({ label, values, onChange, placeholder }: ChipInputProps) {
  const { t } = useI18n();
  const [draft, setDraft] = useState("");
  const resolvedPlaceholder = placeholder ?? t("chip.placeholder");

  const addValue = () => {
    const value = draft.trim();
    if (!value) {
      return;
    }
    onChange([...values, value]);
    setDraft("");
  };

  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="chip-input">
        <div className="chip-list">
          {values.map((value, index) => (
            <span className="chip" key={`${value}-${index}`}>
              {value}
              <button
                aria-label={t("chip.remove", { value })}
                className="chip-remove"
                type="button"
                onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))}
              >
                <X size={14} />
              </button>
            </span>
          ))}
        </div>
        <div className="inline-row">
          <input
            className="input"
            placeholder={resolvedPlaceholder}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addValue();
              }
            }}
          />
          <Button aria-label={t("chip.add", { label })} icon={<Plus size={16} />} onClick={addValue} />
        </div>
      </div>
    </div>
  );
}
