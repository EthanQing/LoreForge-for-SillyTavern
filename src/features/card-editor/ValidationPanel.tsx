import { AlertTriangle, CheckCircle, MapPin, RefreshCcw, Sparkles, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useCardStore } from "../../app/store";
import { Button } from "../../components/Button";
import { IssueList } from "../../components/IssueList";
import { useI18n } from "../../lib/i18n";
import type { ValidationIssue, ValidationReport } from "../../lib/schema";
import { validateCardCommand } from "../../lib/tauri";
import { useAgentStudioActions } from "../../lib/agent/uiContext";

export function ValidationPanel() {
  const { t } = useI18n();
  const card = useCardStore((state) => state.card);
  const cardRevision = useCardStore((state) => state.cardRevision);
  const frontendReport = useCardStore((state) => state.report);
  const setStatus = useCardStore((state) => state.setStatus);
  const agentStudio = useAgentStudioActions();
  const [backendReport, setBackendReport] = useState<ValidationReport | null>(null);
  const report = backendReport ?? frontendReport;
  useEffect(() => setBackendReport(null), [cardRevision]);
  const summary = useMemo(
    () => t("validation.summary", { errors: report.errors.length, warnings: report.warnings.length }),
    [report.errors.length, report.warnings.length, t]
  );
  const headline = report.errors.length > 0
    ? t("validation.needsAttention")
    : report.warnings.length > 0
      ? t("validation.noBlockingErrors")
      : t("validation.allClear");
  const summaryTone = report.errors.length > 0 ? "is-danger" : report.warnings.length > 0 ? "is-warning" : "is-success";
  const runAgent = async (issue?: ValidationIssue) => {
    if (!agentStudio) {
      setStatus(t("validation.agentUnavailable"));
      return;
    }
    try {
      await agentStudio.runValidationAction(report, issue);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <section className="panel" data-context-menu="validation">
      <div className="panel-heading">
        <h2>{t("validation.title")}</h2>
        <div className="inline-row compact">
          <span className={report.valid ? "state-pill" : "state-pill state-pill-hot"}>
            {report.valid ? <CheckCircle size={14} aria-hidden="true" /> : report.errors.length > 0 ? <XCircle size={14} aria-hidden="true" /> : <AlertTriangle size={14} aria-hidden="true" />}
            <span style={{ marginLeft: 6 }}>{summary}</span>
          </span>
          <Button
            icon={<RefreshCcw size={16} />}
            onClick={async () => {
              try {
                setBackendReport(await validateCardCommand(card));
              } catch (error) {
                setStatus(error instanceof Error ? error.message : String(error));
              }
            }}
          >
            {t("validation.rustCheck")}
          </Button>
        </div>
      </div>
      <div className={`validation-summary-card ${summaryTone}`} role="status" aria-live="polite">
        <div className="validation-summary-icon" aria-hidden="true">
          {report.valid ? <CheckCircle size={22} /> : <AlertTriangle size={22} />}
        </div>
        <div className="validation-summary-copy">
          <span>{headline}</span>
          <strong>{summary}</strong>
          <p>{report.errors.length ? t("validation.summaryHint") : report.warnings.length ? t("validation.warningHint") : t("validation.noIssuesHint")}</p>
        </div>
        <div className="validation-summary-stats">
          <span><XCircle size={14} aria-hidden="true" />{t("validation.errors")} <strong>{report.errors.length}</strong></span>
          <span><AlertTriangle size={14} aria-hidden="true" />{t("validation.warnings")} <strong>{report.warnings.length}</strong></span>
        </div>
        <Button
          disabled={!agentStudio?.ready || agentStudio.busy || report.errors.length + report.warnings.length === 0}
          icon={<Sparkles size={16} />}
          onClick={() => void runAgent()}
          variant="primary"
        >
          {t("validation.agentAnalyze")}
        </Button>
      </div>
      <div className="validation-toolbar">
        <span className="validation-source"><MapPin size={14} aria-hidden="true" />{backendReport ? t("validation.sourceBackend") : t("validation.sourceFrontend")}</span>
        <span className="validation-agent-hint">{t("validation.agentHint")}</span>
      </div>
      <IssueList
        agentBusy={Boolean(agentStudio?.busy)}
        agentReady={Boolean(agentStudio?.ready)}
        onAskAgent={(issue) => void runAgent(issue)}
        title={t("validation.errors")}
        issues={report.errors}
      />
      <IssueList
        agentBusy={Boolean(agentStudio?.busy)}
        agentReady={Boolean(agentStudio?.ready)}
        onAskAgent={(issue) => void runAgent(issue)}
        title={t("validation.warnings")}
        issues={report.warnings}
      />
    </section>
  );
}
