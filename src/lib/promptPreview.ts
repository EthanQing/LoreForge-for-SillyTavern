import { CharacterCardV3 } from "./schema";
import { translate } from "./i18n";

export function displayName(card: CharacterCardV3): string {
  return card.data.nickname?.trim() || card.data.name.trim() || translate("app.unnamed");
}

export function replaceMacros(text: string, card: CharacterCardV3, userName = translate("app.userName")): string {
  const name = displayName(card);
  return text
    .replaceAll("{{char}}", name)
    .replaceAll("<char>", name)
    .replaceAll("<bot>", name)
    .replaceAll("{{user}}", userName);
}

export function buildPromptPreview(card: CharacterCardV3, greeting?: string): string {
  const parts = [
    card.data.system_prompt,
    card.data.description,
    card.data.personality,
    card.data.scenario,
    card.data.mes_example,
    card.data.post_history_instructions,
    greeting ?? card.data.first_mes,
  ].filter((part) => part.trim().length > 0);
  return replaceMacros(parts.join("\n\n"), card);
}
