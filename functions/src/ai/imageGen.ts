// ── Re-export all image generation Cloud Functions from imageTasks/ ──
// Each image generation function is now in its own file for maintainability.
// This file preserves the original export surface for backwards compatibility.

export {
  generateImage,
  buildImagePrompt,
} from "./imageTasks/generateImage.js";
export type {
  ImageGenRequest,
  ImageGenResponse,
} from "./imageTasks/generateImage.js";

export { generateAvatarPiece } from "./imageTasks/avatarPiece.js";
export type {
  AvatarPieceRequest,
  AvatarPieceResponse,
} from "./imageTasks/avatarPiece.js";

export { generateStarterAvatar } from "./imageTasks/starterAvatar.js";
export type {
  StarterAvatarRequest,
  StarterAvatarResponse,
} from "./imageTasks/starterAvatar.js";

export { transformAvatarPhoto } from "./imageTasks/photoTransform.js";
export type {
  PhotoTransformRequest,
  PhotoTransformResponse,
} from "./imageTasks/photoTransform.js";

export { generateArmorPiece } from "./imageTasks/armorPiece.js";
export type {
  NewArmorPieceRequest,
  NewArmorPieceResponse,
} from "./imageTasks/armorPiece.js";

export { generateBaseCharacter } from "./imageTasks/baseCharacter.js";
export type {
  BaseCharacterRequest,
  BaseCharacterResponse,
} from "./imageTasks/baseCharacter.js";

export { generateArmorSheet } from "./imageTasks/armorSheet.js";
export type {
  ArmorSheetRequest,
  ArmorSheetResponse,
} from "./imageTasks/armorSheet.js";

export { generateArmorReference } from "./imageTasks/armorReference.js";
export type {
  ArmorReferenceRequest,
  ArmorReferenceResponse,
} from "./imageTasks/armorReference.js";

export { extractFeatures } from "./imageTasks/extractFeatures.js";
export type {
  ExtractFeaturesRequest,
  ExtractFeaturesResponse,
} from "./imageTasks/extractFeatures.js";

export { generateMinecraftSkin } from "./imageTasks/minecraftSkin.js";
export type {
  MinecraftSkinRequest,
  MinecraftSkinResponse,
} from "./imageTasks/minecraftSkin.js";
