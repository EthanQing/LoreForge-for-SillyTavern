import { useMemo } from "react";
import { useCardStore } from "../../app/store";
import { useI18n, type TranslationKey } from "../../lib/i18n";
import { buildCardTokenStats, type TokenStatItem, type TokenStatSectionId } from "../../lib/tokenStats";

const sectionLabelKeys: Record<TokenStatSectionId, TranslationKey> = {
  basic: "tokenStats.section.basic",
  prompts: "tokenStats.section.prompts",
  greetings: "tokenStats.section.greetings",
  lorebook: "tokenStats.section.lorebook",
  assets: "tokenStats.section.assets",
};

const fieldLabelKeys: Record<string, TranslationKey> = {
  name: "field.name",
  nickname: "field.nickname",
  creator: "field.creator",
  characterVersion: "field.characterVersion",
  tags: "field.tags",
  source: "field.source",
  creatorNotes: "field.creatorNotes",
  creatorNotesMultilingual: "field.creatorNotesMultilingual",
  description: "field.description",
  personality: "field.personality",
  scenario: "field.scenario",
  systemPrompt: "field.systemPrompt",
  postHistoryInstructions: "field.postHistoryInstructions",
  messageExample: "field.messageExample",
  firstMessage: "greetings.firstMessage",
  lorebookName: "tokenStats.lorebookName",
  lorebookDescription: "tokenStats.lorebookDescription",
};

export function TokenStatsPanel() {
  const { t } = useI18n();
  const card = useCardStore((state) => state.card);
  const stats = useMemo(() => buildCardTokenStats(card), [card]);
  const maxSectionTokens = Math.max(1, ...stats.sections.map((section) => section.tokens));
  const largestField = stats.largestFields[0];

  return (
    <section className="panel token-stats-panel" data-context-menu="workspace">
      <div className="panel-heading token-stats-heading">
        <h2>{t("tokenStats.title")}</h2>
        <span className="state-pill">{t("tokenStats.estimated")}</span>
      </div>

      <div className="token-summary-grid">
        <SummaryMetric label={t("tokenStats.totalTokens")} value={stats.totalTokens} detail={t("tokenStats.characters", { count: stats.totalCharacters })} />
        <SummaryMetric label={t("tokenStats.promptPreviewMax")} value={stats.promptPreviewMaxTokens} detail={t("tokenStats.greetingCount", { count: stats.greetingPreviews.length })} />
        <SummaryMetric label={t("tokenStats.lorebookEntries")} value={stats.lorebookEntries.length} detail={t("tokenStats.enabledDisabled", { enabled: stats.enabledLorebookEntries, disabled: stats.disabledLorebookEntries })} />
        <SummaryMetric
          label={t("tokenStats.largestField")}
          value={largestField ? largestField.tokens : 0}
          detail={largestField ? formatItemLabel(largestField, t) : t("common.none")}
        />
      </div>

      <section className="token-section">
        <div className="subpanel-heading">
          <h3>{t("tokenStats.sections")}</h3>
        </div>
        <div className="token-section-list">
          {stats.sections.map((section) => (
            <div className="token-section-row" key={section.id}>
              <div>
                <strong>{t(sectionLabelKeys[section.id])}</strong>
                <span>{t("tokenStats.characters", { count: section.characters })}</span>
              </div>
              <div className="token-meter" aria-hidden="true">
                <span style={{ width: `${Math.max(3, (section.tokens / maxSectionTokens) * 100)}%` }} />
              </div>
              <b>{t("common.tokens", { count: formatTokenCount(section.tokens) })}</b>
            </div>
          ))}
        </div>
      </section>

      <div className="token-detail-grid">
        <section className="token-section">
          <div className="subpanel-heading">
            <h3>{t("tokenStats.largestFields")}</h3>
          </div>
          {stats.largestFields.length > 0 ? (
            <ol className="token-table">
              {stats.largestFields.map((item) => (
                <li className="token-table-row" key={item.id}>
                  <div>
                    <strong>{formatItemLabel(item, t)}</strong>
                    <code>{item.path}</code>
                  </div>
                  <span>{t("common.tokens", { count: formatTokenCount(item.tokens) })}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted token-empty">{t("tokenStats.noText")}</p>
          )}
        </section>

        <section className="token-section">
          <div className="subpanel-heading">
            <h3>{t("tokenStats.assets")}</h3>
          </div>
          <div className="token-asset-summary">
            <span>{t("tokenStats.assetReferences", { count: stats.assetSummary.countedReferences })}</span>
            <span>{t("tokenStats.assetDataUrisSkipped", { count: stats.assetSummary.skippedDataUris })}</span>
          </div>
        </section>
      </div>

      <section className="token-section">
        <div className="subpanel-heading">
          <h3>{t("tokenStats.lorebookEntries")}</h3>
        </div>
        {stats.lorebookEntries.length > 0 ? (
          <div className="token-entry-table">
            <table className="token-data-table" aria-label={t("tokenStats.lorebookEntries")}>
              <thead>
                <tr>
                  <th scope="col">{t("lorebook.entry")}</th>
                  <th scope="col">{t("tokenStats.contentTokens")}</th>
                  <th scope="col">{t("tokenStats.keyTokens")}</th>
                  <th scope="col">{t("tokenStats.memoTokens")}</th>
                  <th scope="col">{t("tokenStats.totalTokens")}</th>
                </tr>
              </thead>
              <tbody>
                {stats.lorebookEntries.map((entry) => (
                  <tr key={entry.id}>
                    <th scope="row">
                      <strong>{entry.title}</strong>
                      <span>
                        #{entry.index + 1} · {t(entry.enabled ? "common.enabled" : "common.disabled")} · {t("lorebook.insertionOrder")} {entry.insertionOrder}
                      </span>
                    </th>
                    <td data-label={t("tokenStats.contentTokens")}>{formatTokenCount(entry.contentTokens)}</td>
                    <td data-label={t("tokenStats.keyTokens")}>{formatTokenCount(entry.keyTokens)}</td>
                    <td data-label={t("tokenStats.memoTokens")}>{formatTokenCount(entry.memoTokens)}</td>
                    <td data-label={t("tokenStats.totalTokens")}><strong>{formatTokenCount(entry.totalTokens)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted token-empty">{t("tokenStats.noLorebook")}</p>
        )}
      </section>

      <section className="token-section">
        <div className="subpanel-heading">
          <h3>{t("tokenStats.greetingPreviews")}</h3>
        </div>
        <div className="token-entry-table token-greeting-table">
          <table className="token-data-table" aria-label={t("tokenStats.greetingPreviews")}>
            <thead>
              <tr>
                <th scope="col">{t("preview.greeting")}</th>
                <th scope="col">{t("tokenStats.greetingTokens")}</th>
                <th scope="col">{t("tokenStats.promptTokens")}</th>
                <th scope="col">{t("tokenStats.charactersShort")}</th>
              </tr>
            </thead>
            <tbody>
              {stats.greetingPreviews.map((preview) => (
                <tr key={preview.id}>
                  <th scope="row"><strong>{formatDynamicLabel(preview.label, t)}</strong></th>
                  <td data-label={t("tokenStats.greetingTokens")}>{formatTokenCount(preview.greetingTokens)}</td>
                  <td data-label={t("tokenStats.promptTokens")}><strong>{formatTokenCount(preview.promptTokens)}</strong></td>
                  <td data-label={t("tokenStats.charactersShort")}>{formatTokenCount(preview.characters)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function SummaryMetric({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="token-summary-metric">
      <span>{label}</span>
      <strong>{value.toLocaleString()}</strong>
      <small>{detail}</small>
    </div>
  );
}

function formatTokenCount(value: number): string {
  return value.toLocaleString();
}

function formatItemLabel(item: TokenStatItem, t: (key: TranslationKey, values?: Record<string, string | number | boolean | undefined | null>) => string): string {
  return formatDynamicLabel(item.label, t);
}

function formatDynamicLabel(label: string, t: (key: TranslationKey, values?: Record<string, string | number | boolean | undefined | null>) => string): string {
  const directKey = fieldLabelKeys[label];
  if (directKey) {
    return t(directKey);
  }

  const alternate = label.match(/^alternateGreeting (\d+)$/);
  if (alternate) {
    return t("tokenStats.alternateGreeting", { index: alternate[1] });
  }

  const group = label.match(/^groupGreeting (\d+)$/);
  if (group) {
    return t("tokenStats.groupGreeting", { index: group[1] });
  }

  const entry = label.match(/^entry (\d+) (memo|keys|secondaryKeys|content)$/);
  if (entry) {
    const fieldKey = `tokenStats.entryField.${entry[2]}` as TranslationKey;
    return t("tokenStats.entryFieldLabel", { index: entry[1], field: t(fieldKey) });
  }

  const asset = label.match(/^asset (\d+)$/);
  if (asset) {
    return t("tokenStats.assetItem", { index: asset[1] });
  }

  return label;
}
