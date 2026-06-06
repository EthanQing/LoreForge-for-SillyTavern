import { AlertTriangle, XCircle } from "lucide-react";
import type { ValidationIssue } from "../lib/schema";
import { useI18n, type TranslationKey } from "../lib/i18n";

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
  asset_ext: "validation.assetExt",
  source_format: "validation.sourceFormat",
  empty_name: "validation.emptyName",
  empty_first_mes: "validation.emptyFirstMessage",
  large_extension: "validation.largeExtension",
  long_field: "validation.longField"
};

export function IssueList({ title, issues }: { title: string; issues: ValidationIssue[] }) {
  const { t } = useI18n();

  return (
    <section className="issue-section">
      <h3>{title} ({issues.length})</h3>
      {issues.length === 0 ? (
        <p className="muted">{t("common.none")}</p>
      ) : (
        <ul className="issue-list">
          {issues.map((item) => {
            const messageKey = issueMessageKeys[item.code];
            const message =
              item.code === "missing_string"
                ? t("validation.missingString", { field: item.path.replace(/^data\./, "") })
                : messageKey
                  ? t(messageKey)
                  : item.message;

            return (
              <li className={item.level} key={`${item.code}-${item.path}-${item.message}`}>
                <span>
                  {item.level === "error" ? <XCircle size={14} aria-hidden="true" /> : <AlertTriangle size={14} aria-hidden="true" />}
                  {" "}{item.path}
                </span>
                <strong>{message}</strong>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
