import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  CheckCircle2,
  ClipboardPaste,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileArchive,
  FileJson,
  FolderOpen,
  ImageDown,
  ListChecks,
  Plus,
  Redo2,
  Save,
  Scissors,
  Settings,
  Sparkles,
  Tags,
  Trash2,
  Undo2,
  Upload,
} from "lucide-react";
import { useProjectActions } from "../app/useProjectActions";
import { getContextMenuTarget, type ContextMenuTarget } from "../lib/contextMenuTargets";
import { useI18n, type TranslationKey } from "../lib/i18n";
import type { AgentFieldAction } from "../lib/agent/uiContext";

type MenuItem =
  | {
      type: "item";
      id: string;
      label: string;
      icon: ReactNode;
      danger?: boolean;
      disabled?: boolean;
      action: () => void | Promise<void>;
    }
  | { type: "separator"; id: string };

type ClipboardTextStatus = "unknown" | "has-text" | "empty" | "unavailable";

interface MenuState {
  anchorX: number;
  anchorY: number;
  left: number;
  top: number;
  contextElement: HTMLElement | null;
  contextTarget: ContextMenuTarget | null;
  editableElement: HTMLElement | null;
  clipboardTextStatus: ClipboardTextStatus;
  kind: string;
}

const MENU_MARGIN = 8;

function isTextInput(element: Element): element is HTMLInputElement | HTMLTextAreaElement {
  if (element instanceof HTMLTextAreaElement) {
    return true;
  }
  if (!(element instanceof HTMLInputElement)) {
    return false;
  }
  return !["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"].includes(element.type);
}

function findEditableElement(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) {
    return null;
  }
  const editable = target.closest("textarea, input, [contenteditable='true'], .cm-content");
  if (!editable) {
    return null;
  }
  if (isTextInput(editable) && !editable.disabled) {
    return editable;
  }
  if (editable instanceof HTMLElement && (editable.isContentEditable || editable.classList.contains("cm-content"))) {
    return editable;
  }
  return null;
}

function isReadOnlyEditable(element: HTMLElement | null): boolean {
  if (!element) {
    return false;
  }
  if (isTextInput(element)) {
    return element.readOnly || element.disabled;
  }
  return element.closest<HTMLElement>("[data-editor-readonly='true'], [aria-readonly='true']") !== null;
}

function focusEditable(element: HTMLElement | null): void {
  element?.focus({ preventScroll: true });
}

function setTextInputValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  descriptor?.set?.call(element, value);
}

async function insertClipboardText(element: HTMLElement | null): Promise<void> {
  if (!element || isReadOnlyEditable(element)) {
    return;
  }

  focusEditable(element);
  const text = await (navigator.clipboard?.readText ? navigator.clipboard.readText().catch(() => "") : Promise.resolve(""));
  if (!text) {
    document.execCommand("paste");
    return;
  }

  if (isTextInput(element)) {
    const start = element.selectionStart ?? element.value.length;
    const end = element.selectionEnd ?? start;
    const next = `${element.value.slice(0, start)}${text}${element.value.slice(end)}`;
    setTextInputValue(element, next);
    const caret = start + text.length;
    element.setSelectionRange(caret, caret);
    element.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertFromPaste" }));
    return;
  }

  document.execCommand("insertText", false, text);
}

function selectEditable(element: HTMLElement | null): void {
  if (!element) {
    return;
  }
  focusEditable(element);
  if (isTextInput(element)) {
    element.select();
    return;
  }
  document.execCommand("selectAll");
}

function runEditCommand(command: "undo" | "redo" | "cut" | "copy", element: HTMLElement | null): void {
  if (!element) {
    return;
  }
  focusEditable(element);
  document.execCommand(command);
}

function panelText(element: HTMLElement | null): string {
  return element?.innerText.trim() || "";
}

function selectedText(element: HTMLElement | null): string {
  if (!element) {
    return "";
  }

  if (isTextInput(element)) {
    const start = element.selectionStart ?? 0;
    const end = element.selectionEnd ?? start;
    return start === end ? "" : element.value.slice(start, end);
  }

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return "";
  }

  for (let index = 0; index < selection.rangeCount; index += 1) {
    const range = selection.getRangeAt(index);
    try {
      if (range.intersectsNode(element)) {
        return selection.toString();
      }
    } catch {
      return "";
    }
  }

  return "";
}

function hasSelectableText(element: HTMLElement | null): boolean {
  if (!element) {
    return false;
  }
  if (isTextInput(element)) {
    return element.value.length > 0;
  }
  return Boolean(element.textContent?.length);
}

function queryCommandEnabled(command: string): boolean | null {
  try {
    return document.queryCommandEnabled(command);
  } catch {
    return null;
  }
}

function separator(id: string): MenuItem {
  return { type: "separator", id };
}

function aiActionLabelKey(action: AgentFieldAction): TranslationKey {
  switch (action) {
    case "polish_expand":
      return "aiField.polishExpand";
    case "rewrite":
      return "aiField.rewrite";
    case "complete":
      return "aiField.complete";
    case "shorten":
      return "aiField.shorten";
    case "translate":
      return "aiField.translate";
    case "character_voice":
      return "aiField.characterVoice";
    case "conflict_check":
      return "aiField.conflictCheck";
    case "extract_keywords":
      return "aiField.extractKeywords";
    case "variants":
      return "aiField.variants";
  }
}

export function ContextMenu() {
  const { t } = useI18n();
  const actions = useProjectActions();
  const menuRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);

  const closeMenu = useCallback(() => {
    setMenu(null);
  }, []);

  useEffect(() => {
    const handleContextMenu = (event: MouseEvent) => {
      const target = event.target;

      if (!(target instanceof Element)) {
        return;
      }

      if (target.closest("[data-context-menu-root]")) {
        event.preventDefault();
        return;
      }

      event.preventDefault();

      const editableElement = findEditableElement(target);
      const contextElement = target.closest<HTMLElement>("[data-context-menu]");
      const contextTargetElement = target.closest<HTMLElement>("[data-context-target-id]");
      const contextTarget = getContextMenuTarget(contextTargetElement?.dataset.contextTargetId);
      const kind = editableElement ? contextElement?.dataset.contextMenu ?? "text" : contextElement?.dataset.contextMenu ?? "workspace";

      setMenu({
        anchorX: event.clientX,
        anchorY: event.clientY,
        left: event.clientX,
        top: event.clientY,
        contextElement,
        contextTarget,
        editableElement,
        clipboardTextStatus: "unknown",
        kind,
      });
    };

    window.addEventListener("contextmenu", handleContextMenu);
    return () => window.removeEventListener("contextmenu", handleContextMenu);
  }, []);

  useEffect(() => {
    if (!menu?.editableElement || isReadOnlyEditable(menu.editableElement) || !navigator.clipboard?.readText) {
      return;
    }

    const anchorX = menu.anchorX;
    const anchorY = menu.anchorY;
    const editableElement = menu.editableElement;
    let cancelled = false;

    navigator.clipboard
      .readText()
      .then((text) => {
        if (cancelled) {
          return;
        }
        setMenu((current) =>
          current && current.anchorX === anchorX && current.anchorY === anchorY && current.editableElement === editableElement
            ? { ...current, clipboardTextStatus: text ? "has-text" : "empty" }
            : current,
        );
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setMenu((current) =>
          current && current.anchorX === anchorX && current.anchorY === anchorY && current.editableElement === editableElement
            ? { ...current, clipboardTextStatus: "unavailable" }
            : current,
        );
      });

    return () => {
      cancelled = true;
    };
  }, [menu?.anchorX, menu?.anchorY, menu?.editableElement]);

  useEffect(() => {
    if (!menu) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) {
        return;
      }
      closeMenu();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeMenu, menu]);

  useLayoutEffect(() => {
    if (!menu || !menuRef.current) {
      return;
    }

    const rect = menuRef.current.getBoundingClientRect();
    const left = Math.max(MENU_MARGIN, Math.min(menu.anchorX, window.innerWidth - rect.width - MENU_MARGIN));
    const top = Math.max(MENU_MARGIN, Math.min(menu.anchorY, window.innerHeight - rect.height - MENU_MARGIN));
    if (left !== menu.left || top !== menu.top) {
      setMenu((current) => (current ? { ...current, left, top } : current));
    }
  }, [menu]);

  const items = useMemo<MenuItem[]>(() => {
    if (!menu) {
      return [];
    }

    const editableReadOnly = isReadOnlyEditable(menu.editableElement);
    const selection = selectedText(menu.editableElement);
    const hasSelection = selection.length > 0;
    const hasText = hasSelectableText(menu.editableElement);
    const undoEnabled = queryCommandEnabled("undo");
    const redoEnabled = queryCommandEnabled("redo");
    const pasteDisabled =
      editableReadOnly || menu.clipboardTextStatus === "empty" || menu.clipboardTextStatus === "unknown";

    const textItems: MenuItem[] = menu.editableElement
      ? editableReadOnly
        ? [
            {
              type: "item",
              id: "copy",
              label: t("common.copy"),
              icon: <Copy size={15} />,
              disabled: !hasSelection,
              action: () => runEditCommand("copy", menu.editableElement),
            },
            {
              type: "item",
              id: "select-all",
              label: t("common.selectAll"),
              icon: <FileJson size={15} />,
              disabled: !hasText,
              action: () => selectEditable(menu.editableElement),
            },
          ]
        : [
            {
              type: "item",
              id: "undo",
              label: t("common.undo"),
              icon: <Undo2 size={15} />,
              disabled: undoEnabled === false,
              action: () => runEditCommand("undo", menu.editableElement),
            },
            {
              type: "item",
              id: "redo",
              label: t("common.redo"),
              icon: <Redo2 size={15} />,
              disabled: redoEnabled === false,
              action: () => runEditCommand("redo", menu.editableElement),
            },
            separator("edit-1"),
            {
              type: "item",
              id: "cut",
              label: t("common.cut"),
              icon: <Scissors size={15} />,
              disabled: !hasSelection,
              action: () => runEditCommand("cut", menu.editableElement),
            },
            {
              type: "item",
              id: "copy",
              label: t("common.copy"),
              icon: <Copy size={15} />,
              disabled: !hasSelection,
              action: () => runEditCommand("copy", menu.editableElement),
            },
            {
              type: "item",
              id: "paste",
              label: t("common.paste"),
              icon: <ClipboardPaste size={15} />,
              disabled: pasteDisabled,
              action: () => insertClipboardText(menu.editableElement),
            },
            separator("edit-2"),
            {
              type: "item",
              id: "select-all",
              label: t("common.selectAll"),
              icon: <FileJson size={15} />,
              disabled: !hasText,
              action: () => selectEditable(menu.editableElement),
            },
          ]
      : [];

    const workspaceItems: MenuItem[] = [
      {
        type: "item",
        id: "new",
        label: t("project.newCard"),
        icon: <FileJson size={15} />,
        action: actions.createNewCard,
      },
      {
        type: "item",
        id: "import",
        label: t("common.open"),
        icon: <FolderOpen size={15} />,
        action: () => actions.openCard(),
      },
      {
        type: "item",
        id: "save",
        label: t("common.save"),
        icon: <Save size={15} />,
        action: actions.saveCurrentCard,
      },
      {
        type: "item",
        id: "copy-card-json",
        label: t("contextMenu.copyCardJson"),
        icon: <Copy size={15} />,
        action: () => actions.copyCurrentCardJson(),
      },
      separator("workspace-1"),
      {
        type: "item",
        id: "export-json",
        label: t("project.exportJson"),
        icon: <FileJson size={15} />,
        action: actions.exportJson,
      },
      {
        type: "item",
        id: "export-png",
        label: t("project.exportPng"),
        icon: <ImageDown size={15} />,
        action: actions.exportPng,
      },
      {
        type: "item",
        id: "export-charx",
        label: t("project.exportCharx"),
        icon: <FileArchive size={15} />,
        action: actions.exportCharxFile,
      },
      separator("workspace-2"),
      {
        type: "item",
        id: "validate",
        label: t("common.validate"),
        icon: <CheckCircle2 size={15} />,
        action: actions.validateCurrentCard,
      },
      {
        type: "item",
        id: "settings",
        label: t("common.settings"),
        icon: <Settings size={15} />,
        action: actions.openSettings,
      },
    ];

    const jsonItems: MenuItem[] = [
      {
        type: "item",
        id: "copy-json",
        label: t("common.copy"),
        icon: <Copy size={15} />,
        action: () => {
          const text = panelText(menu.contextElement);
          return text ? actions.copyArbitraryText(text) : actions.copyCurrentCardJson();
        },
      },
      {
        type: "item",
        id: "format-json",
        label: t("common.format"),
        icon: <FileJson size={15} />,
        action: actions.formatCurrentCardJson,
      },
      {
        type: "item",
        id: "validate-json",
        label: t("common.validate"),
        icon: <CheckCircle2 size={15} />,
        action: actions.validateCurrentCard,
      },
      {
        type: "item",
        id: "export-json",
        label: t("common.export"),
        icon: <Download size={15} />,
        action: actions.exportJson,
      },
    ];

    if (menu.editableElement && !["json", "preview", "validation"].includes(menu.kind)) {
      return textItems;
    }

    if (menu.kind === "ai-field" && menu.contextTarget?.kind === "ai-field") {
      const target = menu.contextTarget;
      const recommendedAction: AgentFieldAction | undefined = !target.value.trim()
        ? "complete"
        : target.value.length > 1400
          ? "shorten"
          : undefined;
      const aiActionCandidates: AgentFieldAction[] = [
        ...(recommendedAction ? [recommendedAction] : []),
        "polish_expand",
        "rewrite",
        "complete",
        "shorten",
        "translate",
        "character_voice",
        "conflict_check",
        "extract_keywords",
        "variants",
      ];
      const aiActions = aiActionCandidates.filter((action, index, all) => all.indexOf(action) === index);
      const disabled = !target.ready || target.busy;
      return [
        ...aiActions.map<MenuItem>((action, index) => ({
          type: "item",
          id: `ai-${action}`,
          label: index === 0 && action === recommendedAction ? t("contextMenu.recommendedAiAction", { action: t(aiActionLabelKey(action)) }) : t(aiActionLabelKey(action)),
          icon: action === "extract_keywords" ? <Tags size={15} /> : <Sparkles size={15} />,
          disabled,
          action: () => target.runAction(action),
        })),
        separator("ai-1"),
        {
          type: "item",
          id: "ai-settings",
          label: target.ready ? t("common.settings") : t("settings.apiKeyMissing"),
          icon: <Settings size={15} />,
          action: actions.openSettings,
        },
      ];
    }

    if (menu.kind === "lorebook-entry" && menu.contextTarget?.kind === "lorebook-entry") {
      const target = menu.contextTarget;
      return [
        {
          type: "item",
          id: target.isOpen ? "collapse-entry" : "expand-entry",
          label: target.isOpen ? t("contextMenu.collapseEntry") : t("contextMenu.expandEditEntry"),
          icon: target.isOpen ? <EyeOff size={15} /> : <Eye size={15} />,
          action: () => target.setOpen(!target.isOpen),
        },
        {
          type: "item",
          id: "copy-entry-json",
          label: t("contextMenu.copyEntryJson"),
          icon: <Copy size={15} />,
          action: target.copyJson,
        },
        separator("lore-entry-1"),
        {
          type: "item",
          id: "move-entry-up",
          label: t("common.moveUp"),
          icon: <ArrowUp size={15} />,
          disabled: !target.canMoveUp,
          action: target.moveUp,
        },
        {
          type: "item",
          id: "move-entry-down",
          label: t("common.moveDown"),
          icon: <ArrowDown size={15} />,
          disabled: !target.canMoveDown,
          action: target.moveDown,
        },
        {
          type: "item",
          id: "toggle-entry-enabled",
          label: target.isEnabled ? t("contextMenu.disableEntry") : t("contextMenu.enableEntry"),
          icon: target.isEnabled ? <EyeOff size={15} /> : <Eye size={15} />,
          action: target.toggleEnabled,
        },
        separator("lore-entry-2"),
        {
          type: "item",
          id: "delete-entry",
          label: t("common.delete"),
          icon: <Trash2 size={15} />,
          danger: true,
          action: target.deleteEntry,
        },
      ];
    }

    if (menu.kind === "lorebook-panel" && menu.contextTarget?.kind === "lorebook-panel") {
      const target = menu.contextTarget;
      return target.hasBook
        ? [
            {
              type: "item",
              id: "add-lorebook-entry",
              label: t("lorebook.entry"),
              icon: <Plus size={15} />,
              action: target.addEntry,
            },
            {
              type: "item",
              id: "import-lorebook",
              label: t("common.import"),
              icon: <Upload size={15} />,
              action: target.importLorebook,
            },
            {
              type: "item",
              id: "export-lorebook",
              label: t("common.export"),
              icon: <Download size={15} />,
              action: target.exportLorebook,
            },
            {
              type: "item",
              id: "fill-empty-memos",
              label: t("lorebook.fillEmptyMemos"),
              icon: <ListChecks size={15} />,
              action: target.fillEmptyMemos,
            },
          ]
        : [
            {
              type: "item",
              id: "create-lorebook",
              label: t("lorebook.create"),
              icon: <BookOpen size={15} />,
              action: target.createLorebook,
            },
          ];
    }

    if (menu.kind === "recent") {
      const path = menu.contextElement?.dataset.path ?? "";
      return [
        {
          type: "item",
          id: "open-recent",
          label: t("common.open"),
          icon: <FolderOpen size={15} />,
          disabled: !path,
          action: () => actions.openCard(path),
        },
        {
          type: "item",
          id: "copy-recent",
          label: t("common.copy"),
          icon: <Copy size={15} />,
          disabled: !path,
          action: () => actions.copyRecentPath(path),
        },
        {
          type: "item",
          id: "export-recent",
          label: t("common.export"),
          icon: <Download size={15} />,
          action: actions.exportJson,
        },
        separator("recent-1"),
        {
          type: "item",
          id: "delete-recent",
          label: t("common.delete"),
          icon: <Trash2 size={15} />,
          danger: true,
          disabled: !path,
          action: () => actions.removeRecentPath(path),
        },
      ];
    }

    if (menu.kind === "asset") {
      const index = Number(menu.contextElement?.dataset.index);
      const disabled = !Number.isInteger(index);
      return [
        {
          type: "item",
          id: "open-asset",
          label: t("common.open"),
          icon: <FolderOpen size={15} />,
          disabled,
          action: () => actions.openAsset(index),
        },
        {
          type: "item",
          id: "copy-asset",
          label: t("common.copy"),
          icon: <Copy size={15} />,
          disabled,
          action: () => actions.copyAsset(index),
        },
        {
          type: "item",
          id: "export-asset-card",
          label: t("common.export"),
          icon: <Download size={15} />,
          action: actions.exportJson,
        },
        separator("asset-1"),
        {
          type: "item",
          id: "delete-asset",
          label: t("common.delete"),
          icon: <Trash2 size={15} />,
          danger: true,
          disabled,
          action: () => actions.deleteAsset(index),
        },
      ];
    }

    if (menu.kind === "project") {
      return [
        {
          type: "item",
          id: "open-card",
          label: t("common.open"),
          icon: <FolderOpen size={15} />,
          action: () => actions.openCard(),
        },
        {
          type: "item",
          id: "copy-card",
          label: t("contextMenu.copyCardJson"),
          icon: <Copy size={15} />,
          action: () => actions.copyCurrentCardJson(),
        },
        {
          type: "item",
          id: "save-card",
          label: t("common.save"),
          icon: <Save size={15} />,
          action: actions.saveCurrentCard,
        },
        separator("project-1"),
        {
          type: "item",
          id: "export-json",
          label: t("project.exportJson"),
          icon: <FileJson size={15} />,
          action: actions.exportJson,
        },
        {
          type: "item",
          id: "export-png",
          label: t("project.exportPng"),
          icon: <ImageDown size={15} />,
          action: actions.exportPng,
        },
        {
          type: "item",
          id: "export-charx",
          label: t("project.exportCharx"),
          icon: <FileArchive size={15} />,
          action: actions.exportCharxFile,
        },
        separator("project-2"),
        {
          type: "item",
          id: "delete-card",
          label: t("common.delete"),
          icon: <Trash2 size={15} />,
          danger: true,
          action: actions.deleteCurrentCard,
        },
      ];
    }

    if (["json", "preview", "validation"].includes(menu.kind)) {
      return textItems.length ? [...textItems, separator("json-tools"), ...jsonItems] : jsonItems;
    }

    return textItems.length ? textItems : workspaceItems;
  }, [actions, menu, t]);

  if (!menu) {
    return null;
  }

  return createPortal(
    <div
      aria-label={t("contextMenu.label")}
      className="context-menu"
      data-context-menu-root
      ref={menuRef}
      role="menu"
      style={{ left: menu.left, top: menu.top }}
      onContextMenu={(event) => event.preventDefault()}
      onMouseDown={(event) => event.preventDefault()}
    >
      {items.map((item) => {
        if (item.type === "separator") {
          return <div className="context-menu-separator" key={item.id} role="separator" />;
        }

        return (
          <button
            className={item.danger ? "context-menu-item context-menu-danger" : "context-menu-item"}
            disabled={item.disabled}
            key={item.id}
            role="menuitem"
            type="button"
            onClick={() => {
              void Promise.resolve(item.action()).finally(closeMenu);
            }}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
