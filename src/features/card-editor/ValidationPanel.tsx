import { AlertTriangle, CheckCircle, RefreshCcw, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { useCardStore } from "../../app/store";
import { Button } from "../../components/Button";
import { IssueList } from "../../components/IssueList";
import { useI18n } from "../../lib/i18n";
import type { ValidationReport } from "../../lib/schema";
import { validateCardCommand } from "../../lib/tauri";

export function ValidationPanel() {
  const { t } = useI18n();
  const card = useCardStore((state) => state.card);
  const frontendReport = useCardStore((state) => state.report);
  const setStatus = useCardStore((state) => state.setStatus);
  const [backendReport, setBackendReport] = useState<ValidationReport | null>(null);
  const report = backendReport ?? frontendReport;
  const summary = useMemo(
    () => t("validation.summary", { errors: report.errors.length, warnings: report.warnings.length }),
    [report.errors.length, report.warnings.length, t]
  );

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
      <IssueList title={t("validation.errors")} issues={report.errors} />
      <IssueList title={t("validation.warnings")} issues={report.warnings} />
    </section>
  );
}
