import type { ValidationIssue } from "../lib/schema";

export function IssueList({ title, issues }: { title: string; issues: ValidationIssue[] }) {
  return (
    <section className="issue-section">
      <h3>{title}</h3>
      {issues.length === 0 ? (
        <p className="muted">None</p>
      ) : (
        <ul className="issue-list">
          {issues.map((item) => (
            <li className={item.level} key={`${item.code}-${item.path}-${item.message}`}>
              <span>{item.path}</span>
              <strong>{item.message}</strong>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
