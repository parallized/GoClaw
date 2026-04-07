import type { PointOfInterest } from "../domain/service-types";

const RUN_TERRAIN_LABELS: Record<string, string> = {
  track: "规范跑道和控配速体验",
  park: "公园或绿地环境",
  shaded: "树荫覆盖和更柔和的体感",
  waterfront: "临水开阔视野",
  flat: "相对平稳的步行或慢跑环境"
};

const PHOTO_THEME_LABELS: Record<string, string> = {
  nature: "自然景观",
  urban: "城市界面",
  humanity: "人文街区",
  night: "夜景氛围",
  architecture: "建筑线条",
  waterfront: "水边视野"
};

function formatDistance(distanceMeters: number): string {
  if (distanceMeters >= 1000) {
    return `距离当前位置约 ${(distanceMeters / 1000).toFixed(1)} 公里`;
  }

  return `距离当前位置约 ${Math.round(distanceMeters)} 米`;
}

function cleanText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function uniqueText(values: Array<string | undefined>): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const trimmed = cleanText(value);
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    result.push(trimmed);
  }

  return result;
}

function buildLocationPhrase(poi: PointOfInterest): string {
  const district = cleanText(poi.rawTags.district);
  const address = cleanText(poi.rawTags.address);

  if (district && address) {
    return `位于${district}${address}`;
  }

  if (address) {
    return `位于${address}`;
  }

  if (district) {
    return `位于${district}`;
  }

  return "位于当前活动范围内";
}

function joinFeatures(features: string[]): string {
  if (features.length === 0) {
    return "";
  }

  if (features.length === 1) {
    return features[0]!;
  }

  return `${features.slice(0, -1).join("、")}和${features.at(-1)}`;
}

function buildRunDescription(poi: PointOfInterest): string {
  const features = uniqueText(poi.terrains.map((terrain) => RUN_TERRAIN_LABELS[terrain]));
  const type = cleanText(poi.rawTags.type);
  const featureText = joinFeatures(features);
  const prefix = `${poi.name}${buildLocationPhrase(poi).startsWith("位于") ? "，" : " "}${buildLocationPhrase(poi)}`;

  if (featureText && type) {
    return `${prefix}，类型更接近${type}，适合看重${featureText}的路线。${formatDistance(poi.distanceMeters)}。`;
  }

  if (featureText) {
    return `${prefix}，适合看重${featureText}的路线。${formatDistance(poi.distanceMeters)}。`;
  }

  if (type) {
    return `${prefix}，类型更接近${type}。${formatDistance(poi.distanceMeters)}。`;
  }

  return `${prefix}，${formatDistance(poi.distanceMeters)}。`;
}

function buildPhotoDescription(poi: PointOfInterest): string {
  const themes = uniqueText(poi.themes.map((theme) => PHOTO_THEME_LABELS[theme]));
  const type = cleanText(poi.rawTags.type);
  const featureText = joinFeatures(themes);
  const prefix = `${poi.name}${buildLocationPhrase(poi).startsWith("位于") ? "，" : " "}${buildLocationPhrase(poi)}`;

  if (featureText && type) {
    return `${prefix}，更偏${featureText}题材，地点类型接近${type}。${formatDistance(poi.distanceMeters)}。`;
  }

  if (featureText) {
    return `${prefix}，更偏${featureText}题材。${formatDistance(poi.distanceMeters)}。`;
  }

  if (type) {
    return `${prefix}，地点类型接近${type}。${formatDistance(poi.distanceMeters)}。`;
  }

  return `${prefix}，${formatDistance(poi.distanceMeters)}。`;
}

export function describePointOfInterest(poi: PointOfInterest): string {
  return poi.category === "run" ? buildRunDescription(poi) : buildPhotoDescription(poi);
}

export function withPoiDescription(poi: PointOfInterest): PointOfInterest {
  return {
    ...poi,
    description: poi.description ?? describePointOfInterest(poi)
  };
}
