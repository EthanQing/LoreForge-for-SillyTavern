import { useLayoutEffect, useRef } from "react";
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

export function AutoResizeTextarea({ className, onInput, rows = 1, value, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    resizeTextarea(textareaRef.current);
  }, [value]);

  return (
    <textarea
      {...props}
      className={["textarea", className].filter(Boolean).join(" ")}
      ref={textareaRef}
      rows={rows}
      value={value}
      onInput={(event) => {
        resizeTextarea(event.currentTarget);
        onInput?.(event);
      }}
    />
  );
}

interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  detail?: ReactNode;
}

export function TextAreaField({ label, detail, ...props }: TextAreaFieldProps) {
  return (
    <FieldShell label={label} detail={detail}>
      <AutoResizeTextarea {...props} />
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

function resizeTextarea(element: HTMLTextAreaElement | null): void {
  if (!element) {
    return;
  }

  element.style.height = "auto";
  const maxHeight = Number.parseFloat(window.getComputedStyle(element).maxHeight);
  const nextHeight = element.scrollHeight;
  if (Number.isFinite(maxHeight)) {
    element.style.height = `${Math.min(nextHeight, maxHeight)}px`;
    element.style.overflowY = nextHeight > maxHeight ? "auto" : "hidden";
    return;
  }
  element.style.height = `${nextHeight}px`;
  element.style.overflowY = "hidden";
}
