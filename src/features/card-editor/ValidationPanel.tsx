import { RefreshCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { useCardStore } from "../../app/store";
import { Button } from "../../components/Button";
import { IssueList } from "../../components/IssueList";
import type { ValidationReport } from "../../lib/schema";
import { validateCardCommand } from "../../lib/tauri";

export function ValidationPanel() {
  const card = useCardStore((state) => state.card);
  const frontendReport = useCardStore((state) => state.report);
  const setStatus = useCardStore((state) => state.setStatus);
  const [backendReport, setBackendReport] = useState<ValidationReport | null>(null);
  const report = backendReport ?? frontendReport;
  const summary = useMemo(() => `${report.errors.length} errors, ${report.warnings.length} warnings`, [report.errors.length, report.warnings.length]);

  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Validation</h2>
        <div className="inline-row compact">
          <span className={report.valid ? "state-pill" : "state-pill state-pill-hot"}>{summary}</span>
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
            Rust Check
          </Button>
        </div>
      </div>
      <IssueList title="Errors" issues={report.errors} />
      <IssueList title="Warnings" issues={report.warnings} />
    </section>
  );
}
