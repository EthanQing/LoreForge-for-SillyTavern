import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

interface FieldShellProps {
  label: string;
  detail?: ReactNode;
  children: ReactNode;
}

export function FieldShell({ label, detail, children }: FieldShellProps) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {detail ? <small>{detail}</small> : null}
      </span>
      {children}
    </label>
  );
}

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  detail?: ReactNode;
}

export function TextField({ label, detail, ...props }: TextFieldProps) {
  return (
    <FieldShell label={label} detail={detail}>
      <input className="input" {...props} />
    </FieldShell>
  );
}

interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  detail?: ReactNode;
}

export function TextAreaField({ label, detail, ...props }: TextAreaFieldProps) {
  return (
    <FieldShell label={label} detail={detail}>
      <textarea className="textarea" {...props} />
    </FieldShell>
  );
}

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  detail?: ReactNode;
  children: ReactNode;
}

export function SelectField({ label, detail, children, ...props }: SelectFieldProps) {
  return (
    <FieldShell label={label} detail={detail}>
      <select className="input" {...props}>
        {children}
      </select>
    </FieldShell>
  );
}
