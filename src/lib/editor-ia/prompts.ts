/**
 * Editor IA — sistema de prompts em 3 camadas
 *
 * CAMADA 1 (PRESERVAÇÃO) — trava absoluta na joia original, nunca muda
 * CAMADA 2 (CATEGORIA)   — contexto técnico por tipo de peça
 * CAMADA 3 (CENÁRIO)     — direção artística (fundo, luz, composição)
 */

export const LAYER_1_PRESERVATION = `PRESERVATION LOCK — ABSOLUTE RULE:

You are editing an existing photograph. The input image shows a jewelry piece that MUST be preserved EXACTLY as it appears, pixel-for-pixel in its geometry, proportions, and design.

IDENTIFY the jewelry piece in the input image. Treat it as a FIXED, IMMUTABLE REFERENCE.

FORBIDDEN actions on the jewelry:
- DO NOT redraw, redesign, re-render, or reinterpret the piece
- DO NOT change link structure, chain pattern, or mesh geometry
- DO NOT modify stone positions, cuts, settings, or quantities
- DO NOT alter proportions, thickness, width, length, or curvature
- DO NOT add or remove elements (charms, links, stones, details)
- DO NOT smooth, blur, or "beautify" the physical structure
- DO NOT stylize or make it look "AI-generated"

ALLOWED actions on the jewelry:
- Enhance lighting reflections on existing surfaces
- Improve color grading of gold (keep warm, natural 18k tone)
- Sharpen existing textures (never add new textures)
- Cast realistic shadows based on the new scene
- Adjust white balance and exposure

The original jewelry must be RECOGNIZABLY IDENTICAL when compared side-by-side with the input. A jeweler must be able to confirm it is the SAME piece.`;

export const LAYER_2_CATEGORY: Record<string, string> = {
  "PINGENTES FEMININO": `CATEGORY: Feminine pendant in 18k gold.
Focus: Delicate details, chain loop (bail), stone settings if present.
Perspective: Front-facing or 3/4 view showing the pendant face clearly.
Scale: Macro close-up — pendant fills 60-70% of frame.`,
  "PINGENTES MASCULINO": `CATEGORY: Masculine pendant in 18k gold.
Focus: Solid geometry, bold design, weight presence of the metal.
Perspective: Front-facing, slight angle to reveal depth.
Scale: Macro close-up — pendant fills 60-70% of frame.`,
  "BRINCOS": `CATEGORY: Earrings (pair) in 18k gold.
Focus: Both pieces visible, symmetrically aligned as in the original.
Perspective: Front view, same angle for both earrings.
Scale: Macro — earrings fill 50-60% of frame, with visible spacing.`,
  "CORRENTE FEMININA": `CATEGORY: Feminine chain in 18k gold.
Focus: Link pattern, fluidity, natural drape of the chain.
Perspective: The chain must lay naturally — never straightened into a rigid line. Preserve the exact link count and pattern.
Scale: Show the full chain arrangement as in the original.`,
  "CORRENTE MASCULINA": `CATEGORY: Masculine chain in 18k gold.
Focus: Heavy link structure, metallic weight, bold presence.
Perspective: The chain must lay naturally — never straightened into a rigid line. Preserve the exact link count and pattern.
Scale: Show the full chain arrangement as in the original.`,
  "ANEL FEMININO": `CATEGORY: Feminine ring in 18k gold.
Focus: Setting, stones, shank profile, inner finish.
Perspective: 3/4 angle showing the top setting and the band curve.
Scale: Macro close-up — ring fills 50-60% of frame.`,
  "ANEL MASCULINO": `CATEGORY: Masculine ring in 18k gold.
Focus: Band thickness, engravings if present, solid presence.
Perspective: 3/4 angle showing top face and band depth.
Scale: Macro close-up — ring fills 50-60% of frame.`,
  "PULSEIRA FEMININA": `CATEGORY: Feminine bracelet in 18k gold.
Focus: Link pattern, clasp detail, delicate drape.
Perspective: The bracelet must lay naturally curved. Preserve exact link structure.
Scale: Show the full bracelet as arranged in the original.`,
  "PULSEIRA MASCULINA": `CATEGORY: Masculine bracelet in 18k gold.
Focus: Heavy link structure, bold clasp, weight presence.
Perspective: The bracelet must lay naturally curved. Preserve exact link structure.
Scale: Show the full bracelet as arranged in the original.`,
};

export const CATEGORIES = Object.keys(LAYER_2_CATEGORY);

export interface Scene {
  id: string;
  name: string;
  prompt: string;
}

export const LAYER_3_SCENES: Scene[] = [
  {
    id: "white-ecommerce",
    name: "Fundo Branco E-commerce",
    prompt: `SCENE: Pure white seamless background (#FFFFFF), professional e-commerce product photography.
LIGHTING: Soft diffused studio lighting, multiple sources to eliminate harsh shadows, preserving metallic reflections on gold.
SHADOW: Very subtle contact shadow directly below the piece.
STYLE: Clean, minimal, catalog-ready. No props, no distractions.`,
  },
  {
    id: "soft-gray",
    name: "Cinza Ultraleve Premium",
    prompt: `SCENE: Ultra-light gray seamless background (#F5F5F5 gradient to #EEEEEE).
LIGHTING: Soft diffused light from above with subtle rim light.
SHADOW: Gentle drop shadow to give depth.
STYLE: Premium e-commerce, slightly more sophisticated than pure white.`,
  },
  {
    id: "green-leather",
    name: "Couro Verde ALISSON",
    prompt: `SCENE: Beige table surface (#D4C5A9) with a dark emerald green (#1C4A3C) thick leather fabric placed diagonally across the frame.
LIGHTING: Warm directional studio light from upper left, creating sophisticated shadows on the leather texture.
SHADOW: Natural soft shadow cast by the piece on the leather.
STYLE: Luxury brand aesthetic, editorial composition — matches ALISSON Joias identity.`,
  },
  {
    id: "marble",
    name: "Mármore Branco",
    prompt: `SCENE: Polished white marble surface with subtle gray veining.
LIGHTING: Soft natural daylight from above, creating gentle reflections on the marble.
SHADOW: Soft natural shadow integrated with the marble reflection.
STYLE: Fine jewelry editorial, sophisticated and timeless.`,
  },
  {
    id: "black-spot",
    name: "Fundo Preto Dramático",
    prompt: `SCENE: Pure black background (#000000) with subtle fade-out gradient.
LIGHTING: Dramatic single spotlight highlighting the gold, creating strong reflections and deep contrast.
SHADOW: Minimal — piece floats in darkness.
STYLE: High-end jewelry catalog, luxury brand presentation, dramatic and bold.`,
  },
  {
    id: "brushed-metal",
    name: "Metal Escovado Cinza",
    prompt: `SCENE: Brushed dark gray metal surface (#3A3A3A) with horizontal brush texture.
LIGHTING: Cold directional light creating metallic reflections.
SHADOW: Defined shadow showing the piece's contour.
STYLE: Industrial luxury, masculine editorial.`,
  },
];

export interface BuildPromptOptions {
  category?: string;
  sceneId: string;
  additionalDetails?: string;
}

export function buildFinalPrompt({
  category,
  sceneId,
  additionalDetails,
}: BuildPromptOptions): string {
  const layer2 = (category && LAYER_2_CATEGORY[category]) || "";
  const scene = LAYER_3_SCENES.find((s) => s.id === sceneId);
  const layer3 = scene?.prompt || "";

  const parts: string[] = [LAYER_1_PRESERVATION];
  if (layer2) parts.push("", "---", "", layer2);
  if (layer3) parts.push("", "---", "", layer3);

  if (additionalDetails && additionalDetails.trim()) {
    parts.push("", "---", "", `ADDITIONAL DETAILS FROM USER: ${additionalDetails.trim()}`);
  }

  parts.push(
    "",
    "---",
    "",
    "FINAL REMINDER: The jewelry in the input image is the ABSOLUTE REFERENCE. Do not redraw it. Only change the scene around it.",
  );

  return parts.join("\n");
}
