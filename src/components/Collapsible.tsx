import { type DragEventHandler, type HTMLAttributes, type ReactNode, type Ref, useEffect, useRef, useState } from "react";

interface CollapsibleProps extends Pick<HTMLAttributes<HTMLDivElement>, "onDragOver" | "onDrop"> {
  title: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  triggerClassName?: string;
  bodyClassName?: string;
  contextMenu?: string;
  contextTargetId?: string;
  validationPath?: string;
  triggerDraggable?: boolean;
  onTriggerDragStart?: DragEventHandler<HTMLButtonElement>;
  onTriggerDragEnd?: DragEventHandler<HTMLButtonElement>;
  rootRef?: Ref<HTMLDivElement>;
  lazyMount?: boolean;
  unmountOnClose?: boolean;
}

export function Collapsible({
  title,
  children,
  defaultOpen = false,
  open,
  onOpenChange,
  className = "",
  triggerClassName = "",
  bodyClassName = "",
  contextMenu,
  contextTargetId,
  validationPath,
  triggerDraggable = false,
  onTriggerDragStart,
  onTriggerDragEnd,
  rootRef,
  lazyMount = false,
  unmountOnClose = false,
  onDragOver,
  onDrop
}: CollapsibleProps) {
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : localOpen;
  const shouldAlwaysRender = !lazyMount && !unmountOnClose;
  const [shouldRenderContent, setShouldRenderContent] = useState(shouldAlwaysRender || isOpen);
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    if (isOpen || shouldAlwaysRender) {
      setShouldRenderContent(true);
      return undefined;
    }

    if (unmountOnClose) {
      closeTimerRef.current = window.setTimeout(() => {
        setShouldRenderContent(false);
        closeTimerRef.current = null;
      }, 220);

      return () => {
        if (closeTimerRef.current !== null) {
          window.clearTimeout(closeTimerRef.current);
          closeTimerRef.current = null;
        }
      };
    }

    return undefined;
  }, [isOpen, shouldAlwaysRender, unmountOnClose]);

  const handleToggle = () => {
    const nextOpen = !isOpen;
    if (nextOpen) {
      setShouldRenderContent(true);
    }
    if (!isControlled) {
      setLocalOpen(nextOpen);
    }
    onOpenChange?.(nextOpen);
  };

  return (
    <div
      ref={rootRef}
      className={`collapsible ${isOpen ? "is-open" : "is-closed"} ${className}`}
      data-context-menu={contextMenu}
      data-context-target-id={contextTargetId}
      data-validation-path={validationPath}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <button
        type="button"
        className={`collapsible-trigger ${triggerClassName}`}
        aria-expanded={isOpen}
        draggable={triggerDraggable}
        onClick={handleToggle}
        onDragEnd={onTriggerDragEnd}
        onDragStart={onTriggerDragStart}
      >
        <span className="collapsible-icon" aria-hidden="true" />
        {title}
      </button>
      <div className="collapsible-content" role="region">
        <div className={`collapsible-content-inner ${bodyClassName}`}>
          {shouldRenderContent ? children : null}
        </div>
      </div>
    </div>
  );
}
