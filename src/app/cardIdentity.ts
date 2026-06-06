import type { CharacterCardV3 } from "../lib/schema";
import type { TranslationKey, TranslationValues } from "../lib/i18n";
import type { CardOrigin } from "./store";

type Translate = (key: TranslationKey, values?: TranslationValues) => string;

export interface CardIdentity {
  detail: string;
  label: string;
  tone: CardOrigin;
}

export function getCardDisplayName(card: CharacterCardV3, t: Translate): string {
  return card.data.nickname || card.data.name || t("app.untitledCard");
}

export function getCardIdentity(origin: CardOrigin, currentPath: string | null, t: Translate): CardIdentity {
  if (currentPath) {
    return {
      detail: currentPath,
      label: t("project.originFile"),
      tone: "file",
    };
  }

  if (origin === "new") {
    return {
      detail: t("project.originNewDetail"),
      label: t("project.originNew"),
      tone: "new",
    };
  }

  return {
    detail: t("project.originDraftDetail"),
    label: t("project.originDraft"),
    tone: "draft",
  };
}
