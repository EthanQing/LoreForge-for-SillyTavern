import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
}

export function Button({ children, icon, variant = "secondary", className = "", ...props }: ButtonProps) {
  return (
    <button className={`button button-${variant} ${className}`} type="button" {...props}>
      {icon}
      {children ? <span>{children}</span> : null}
    </button>
  );
}
