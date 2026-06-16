import { RailConfigItem } from "./types";

export interface RailNameParts {
  group: string;
  direction: string;
  descriptor: string;
  familyKey: string;
}

const SIZE_TOKEN = /^X\d+$/i;

function titleToken(token: string): string {
  return token.charAt(0) + token.slice(1).toLowerCase();
}

export function parseRailNameParts(rowName: string): RailNameParts {
  const base = rowName.replace(/^BP_/, "").replace(/_Rail$/, "");
  const tokens = base.split("_").filter(Boolean);
  const group = tokens[0] ?? "Special";
  const direction = tokens[1] ?? "F";
  const descriptorTokens: string[] = [];

  for (const token of tokens.slice(2)) {
    if (SIZE_TOKEN.test(token)) break;
    descriptorTokens.push(token);
  }

  const descriptor = descriptorTokens.length > 0
    ? descriptorTokens.map(titleToken).join(" ")
    : "Normal";
  const familyKey = [group, descriptor, direction].join("|");

  return { group, direction, descriptor, familyKey };
}

export function railDisplayName(rail: RailConfigItem, language: "zh" | "en"): string {
  return language === "en"
    ? rail.enName || rail.displayName || rail.cnName || rail.rowName
    : rail.cnName || rail.displayName || rail.enName || rail.rowName;
}

export function railFamilyDisplayName(variants: RailConfigItem[], language: "zh" | "en"): string {
  const named = variants.find((rail) => rail.cnName || rail.enName || rail.displayName) ?? variants[0];
  return named ? railDisplayName(named, language) : "";
}

export function railDirectionDisplayName(direction: string, language: "zh" | "en"): string {
  const labels: Record<string, { zh: string; en: string }> = {
    F: { zh: "直行", en: "Forward" },
    FD: { zh: "前下", en: "Forward Down" },
    FU: { zh: "前上", en: "Forward Up" },
    FL90: { zh: "前左 90", en: "Forward Left 90" },
    FR90: { zh: "前右 90", en: "Forward Right 90" },
    L90: { zh: "左转 90", en: "Left 90" },
    R90: { zh: "右转 90", en: "Right 90" },
    U90: { zh: "上转 90", en: "Up 90" },
    D90: { zh: "下转 90", en: "Down 90" },
    T: { zh: "T 型", en: "T Junction" },
    CR: { zh: "十字", en: "Cross" },
  };
  return labels[direction]?.[language] ?? direction;
}

export function buildFamilyDisplayName(
  variants: RailConfigItem[],
  direction: string,
  language: "zh" | "en",
): string {
  const named = variants.find((rail) => rail.cnName || rail.enName || rail.displayName);
  return named ? railDisplayName(named, language) : railDirectionDisplayName(direction, language);
}
