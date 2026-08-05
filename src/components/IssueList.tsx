import { AlertTriangle, ChevronRight, MapPin, Sparkles, XCircle } from "lucide-react";
import type { ValidationIssue } from "../lib/schema";
import { useI18n, type TranslationKey } from "../lib/i18n";
import { dispatchValidationNavigation } from "../lib/validationIssueNavigation";
import { Button } from "./Button";

const issueMessageKeys: Partial<Record<string, TranslationKey>> = {
  invalid_regex: "validation.invalidRegex",
  invalid_spec: "validation.invalidSpec",
  missing_spec_version: "validation.missingSpecVersion",
  newer_spec_version: "validation.newerSpecVersion",
  missing_data: "validation.missingData",
  invalid_group_only_greetings: "validation.invalidGroupGreetings",
  invalid_lorebook_entries: "validation.invalidLorebookEntries",
  invalid_lorebook_keys: "validation.invalidLorebookKeys",
  missing_use_regex: "validation.missingUseRegex",
  invalid_main_icon: "validation.invalidMainIcon",
  invalid_main_background: "validation.invalidMainBackground",
  http_asset: "validation.httpAsset",
  inline_image_asset: "validation.inlineImageAsset",
  asset_ext: "validation.assetExt",
  source_format: "validation.sourceFormat",
  empty_name: "validation.emptyName",
  empty_first_mes: "validation.emptyFirstMessage",
  large_extension: "validation.largeExtension",
  long_field: "validation.longField"
};

const fieldLabelKeys: Record<string, TranslationKey> = {
  "data.name": "field.name",
  "data.description": "field.description",
  "data.personality": "field.personality",
  "data.scenario": "field.scenario",
  "data.first_mes": "greetings.firstMessage",
  "data.alternate_greetings": "greetings.alternateGreetings",
  "data.mes_example": "field.messageExample",
  "data.creator_notes": "field.creatorNotes",
  "data.system_prompt": "field.systemPrompt",
  "data.post_history_instructions": "field.postHistoryInstructions",
  "data.tags": "field.tags",
  "data.creator": "field.creator",
  "data.character_version": "field.characterVersion",
  "data.group_only_greetings": "greetings.groupOnlyGreetings",
  "data.source": "field.source",
  spec: "validation.spec",
  spec_version: "validation.specVersion",
  data: "validation.cardData",
  "data.extensions": "validation.extensions",
  "data.assets": "assets.title"
};

interface IssueListProps {
  title: string;
  issues: ValidationIssue[];
  agentReady?: boolean;
  agentBusy?: boolean;
  onAskAgent?: (issue: ValidationIssue) => void;
}

export function IssueList({ title, issues, agentBusy = false, agentReady = false, onAskAgent }: IssueListProps) {
  const { t } = useI18n();

  return (
    <section className="issue-section">
      <div className="issue-section-heading">
        <h3>{title}</h3>
        <span className="issue-section-count">{issues.length}</span>
      </div>
      {issues.length === 0 ? (
        <p className="muted issue-empty">{t("validation.noIssuesHint")}</p>
      ) : (
        <ul className="issue-list" aria-label={title}>
          {issues.map((item) => {
            const location = describeValidationPath(item.path, t);
            const messageKey = issueMessageKeys[item.code];
            const message =
              item.code === "missing_string"
                ? t("validation.missingString", { field: location })
                : messageKey
                  ? t(messageKey)
                  : item.message;
            const severityLabel = item.level === "error" ? t("validation.errorLabel") : t("validation.warningLabel");

            return (
              <li className={`issue-card ${item.level}`} key={`${item.code}-${item.path}-${item.message}`}>
                <div className="issue-card-body">
                  <div className="issue-card-heading">
                    <span className="issue-severity">
                      {item.level === "error" ? <XCircle size={16} aria-hidden="true" /> : <AlertTriangle size={16} aria-hidden="true" />}
                      <strong>{severityLabel}</strong>
                    </span>
                    <span className="issue-location"><MapPin size={14} aria-hidden="true" />{location}</span>
                  </div>
                  <p className="issue-card-message">{message}</p>
                  <p className="issue-card-recovery">{t("validation.fixHint")}</p>
                  <details className="issue-card-details">
                    <summary>{t("validation.technicalPath")}</summary>
                    <code>{item.path}</code>
                  </details>
                </div>
                <div className="issue-card-actions">
                  <Button icon={<ChevronRight size={15} />} onClick={() => dispatchValidationNavigation(item.path)}>
                    {t("validation.locate")}
                  </Button>
                  {onAskAgent ? (
                    <Button
                      disabled={!agentReady || agentBusy}
                      icon={<Sparkles size={15} />}
                      onClick={() => onAskAgent(item)}
                      title={agentReady ? undefined : t("validation.agentUnavailable")}
                      variant="ghost"
                    >
                      {t("validation.askAgent")}
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function describeValidationPath(path: string, t: (key: TranslationKey, values?: Record<string, string | number | boolean | undefined | null>) => string): string {
  const directLabel = fieldLabelKeys[path];
  if (directLabel) {
    return t(directLabel);
  }

  const alternateGreeting = path.match(/^data\.alternate_greetings\.(\d+)(?:\.|$)/u);
  if (alternateGreeting) {
    return `${t("greetings.alternateGreetings")} #${Number(alternateGreeting[1]) + 1}`;
  }

  const source = path.match(/^data\.source\.(\d+)(?:\.|$)/u);
  if (source) {
    return `${t("field.source")} #${Number(source[1]) + 1}`;
  }

  const lorebookEntry = path.match(/^data\.character_book\.entries\.(\d+)(?:\.([^\.]+))?/u);
  if (lorebookEntry) {
    const entryLabel = t("lorebook.entryNumber", { index: Number(lorebookEntry[1]) + 1 });
    const field = lorebookEntry[2];
    const fieldKey: Record<string, TranslationKey> = {
      comment: "lorebook.titleMemo",
      keys: "lorebook.keys",
      secondary_keys: "lorebook.secondaryKeys",
      content: "lorebook.content",
      use_regex: "lorebook.useRegex"
    };
    return field && fieldKey[field] ? `${entryLabel} · ${t(fieldKey[field])}` : entryLabel;
  }

  const asset = path.match(/^data\.assets\.(\d+)(?:\.([^\.]+))?/u);
  if (asset) {
    const assetLabel = t("tokenStats.assetItem", { index: Number(asset[1]) + 1 });
    const field = asset[2];
    if (field === "uri") return `${assetLabel} · ${t("assets.uri")}`;
    if (field === "ext") return `${assetLabel} · ${t("assets.ext")}`;
    if (field === "name") return `${assetLabel} · ${t("field.name")}`;
    return assetLabel;
  }

  const extension = path.match(/^data\.extensions\.(.+)$/u);
  if (extension) {
    return `${t("validation.extensions")} · ${extension[1]}`;
  }

  return path;
}
