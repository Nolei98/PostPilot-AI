// ============================================================
// resolveRenderSpec — a fonte ÚNICA de "o que decide a arte deste post".
//
// É o contrato central do modelo render-on-approval (migration 040). A
// MESMA função é chamada dos dois lados:
//   - pela FILA, ao vivo, contra o brand_kit atual → o preview desenha
//     com o resultado, então mudar cor/template em Ajustes aparece na
//     hora, sem nenhum job;
//   - pelo job de APROVAÇÃO, cujo resultado é gravado em
//     posts.render_spec e nunca mais muda.
// Um caminho de código só é o que garante que o preview e a arte final
// não podem divergir — se divergissem, o preview seria decorativo.
//
// Também acaba com uma divergência real que existia antes: havia QUATRO
// construtores de CardBrand (actions.ts, resync-layout-preset.ts,
// image.ts/fetchCoverBrand e generate-carousel.ts) e dois deles
// esqueciam `singlePostStyle`, então o mesmo Brand Kit produzia artes
// diferentes dependendo de quem renderizou.
// ============================================================
import { createAdminClient } from "@/lib/supabase/admin";
import { boostAccent, pickTheme, relativeLuminanceOfHex, textColorForTheme } from "@/lib/contrast";
import { resolvePostFontFamily } from "@/lib/font-data";
import { resolveTemplateSpecs } from "@/lib/template-selection";
import type { CardBrand } from "@/lib/render-shared";
import type {
  BackgroundMode,
  BrandTemplate,
  MarkMode,
  IgProfile,
  PostFormat,
  RenderSpec,
  Surface,
  TemplateSpec,
  VideoShape,
  VisualIdentity,
} from "@/lib/types";

/** Linha crua de brand_kits. Aceita null — todo campo tem default. */
export type BrandKitRow = Record<string, unknown> | null | undefined;

function str(bk: BrandKitRow, key: string): string | null {
  const v = bk?.[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

function bool(bk: BrandKitRow, key: string, fallback: boolean): boolean {
  const v = bk?.[key];
  return typeof v === "boolean" ? v : fallback;
}

/** Marca dos layouts (cores, tipografia, wordmark, preset). */
export function cardBrandFromKit(bk: BrandKitRow): CardBrand {
  return {
    colorBackground: str(bk, "color_background") ?? "#0B0B12",
    colorAccent: str(bk, "color_accent") ?? "#7C5CFF",
    colorText: str(bk, "color_text") ?? "#FFFFFF",
    fontFamily: resolvePostFontFamily(str(bk, "post_font_family")),
    brandName: str(bk, "brand_name"),
    wordmark: str(bk, "wordmark"),
    handle: str(bk, "ig_handle"),
    keywords: (bk?.keywords as string[] | null) ?? null,
    brandMark: (str(bk, "brand_mark") as CardBrand["brandMark"]) ?? "auto",
    layoutPreset: (str(bk, "layout_preset") as CardBrand["layoutPreset"]) ?? "editorial-noir",
    singlePostStyle: (str(bk, "single_post_style") as CardBrand["singlePostStyle"]) ?? "cover",
  };
}

/** Logo + fonte aplicados por cima de qualquer layout. */
export function brandTemplateFromKit(bk: BrandKitRow): BrandTemplate {
  return {
    fontFamily: resolvePostFontFamily(str(bk, "post_font_family")),
    logoUrl: str(bk, "logo_url"),
    showLogo: bool(bk, "show_brand_logo", true),
  };
}

/** Perfil usado no chip dos cards interiores e da contra-capa. */
export function profileFromKit(bk: BrandKitRow): IgProfile {
  return {
    handle: str(bk, "ig_handle") ?? "seuperfil.ia",
    displayName: str(bk, "ig_display_name") ?? "Seu Perfil de IA",
    avatarUrl: str(bk, "ig_avatar_url"),
    verified: bool(bk, "ig_verified", false),
    showProfileChip: bool(bk, "show_profile_chip", true),
  };
}

/** Identidade da CONTRA-CAPA vinda de Ajustes (default do cliente). */
export function identityFromKit(bk: BrandKitRow): VisualIdentity {
  return {
    colorBackground: str(bk, "color_background") ?? "#0B0B12",
    colorAccent: str(bk, "color_accent") ?? "#7C5CFF",
    colorText: str(bk, "color_text") ?? "#FFFFFF",
    colorKeywordBox: str(bk, "color_keyword_box") ?? "#7C5CFF",
    keyword: str(bk, "tpl_keyword") ?? "IA",
    topText: str(bk, "tpl_top_text") ?? "A NOVIDADE DE",
    bottomText: str(bk, "tpl_bottom_text") ?? "QUE MUDA TUDO",
    ctaEnabled: bool(bk, "tpl_cta_enabled", false),
  };
}

/** Fundos do sistema pros modos 'light'/'dark' (migration 042). */
const SYSTEM_BACKGROUNDS = { light: "#FFFFFF", dark: "#0B0B12" } as const;

/**
 * Aplica o fundo escolhido no post sobre a marca do Brand Kit.
 *
 * A cor de TEXTO é derivada, nunca herdada: um cliente com texto branco
 * que escolhe fundo branco ficaria com arte ilegível. Mesma régua do
 * contraste sobre foto (pickTheme/textColorForTheme), só que aqui a
 * luminância vem da própria cor, não de uma medição.
 */
export function resolveBackground(brand: CardBrand, post: RenderSpecPostInput): CardBrand {
  return applyEyebrow(
    applyMarkColor(
      applyBackground(brand, post.bg_mode, post.bg_color),
      post.mark_mode,
      post.mark_color
    ),
    post.eyebrow
  );
}

/**
 * Rótulo do topo da capa (046). Só entra na marca quando o post tem um
 * valor próprio: nulo (ou vazio) deixa o campo ausente, e cada layout cai
 * no default do seu preset — que é o que o app sempre desenhou.
 */
export function applyEyebrow(brand: CardBrand, eyebrow: string | null | undefined): CardBrand {
  const value = typeof eyebrow === "string" ? eyebrow.trim() : "";
  return value ? { ...brand, eyebrow: value } : brand;
}

/**
 * A mesma decisão, por MODO+COR soltos — é o que o card do carrossel usa,
 * já que o override dele mora no jsonb `layout` e não em colunas do post.
 * `mode` nulo/'brand' devolve a marca recebida, que no caso do card já é
 * o fundo do post: o card só sobrepõe se quiser.
 */
export function applyBackground(
  brand: CardBrand,
  mode: BackgroundMode | null | undefined,
  color: string | null | undefined
): CardBrand {
  if (!mode || mode === "brand") return brand;
  const colorBackground = mode === "custom" ? color || brand.colorBackground : SYSTEM_BACKGROUNDS[mode];
  const theme = pickTheme(relativeLuminanceOfHex(colorBackground));
  return { ...brand, colorBackground, colorText: textColorForTheme(theme) };
}

/**
 * Cor do wordmark (043). Roda DEPOIS do fundo de propósito: em 'title' a
 * marca acompanha o título, e o título já pode ter virado escuro por
 * causa do fundo escolhido.
 */
export function applyMarkColor(
  brand: CardBrand,
  mode: MarkMode | null | undefined,
  color: string | null | undefined
): CardBrand {
  // 'accent' não é "deixa como está": é a promessa de DESTAQUE. A cor da
  // marca costuma ser escolhida contra o fundo padrão do kit, e some
  // quando o post troca de fundo (042) — aí o wordmark deixava de
  // realçar. boostAccent só mexe quando o contraste é insuficiente.
  if (!mode || mode === "accent") {
    return { ...brand, markColor: boostedAccent(brand) };
  }
  const markColor = mode === "title" ? brand.colorText : color || brand.colorAccent;
  return { ...brand, markColor };
}

/** Realce da marca já garantido contra o fundo resolvido do post. */
function boostedAccent(brand: CardBrand): string {
  return boostAccent(brand.colorAccent, relativeLuminanceOfHex(brand.colorBackground));
}

/** Campos do post que o resolver precisa ler. */
export interface RenderSpecPostInput {
  format: PostFormat;
  bg_mode?: BackgroundMode | null;
  bg_color?: string | null;
  mark_mode?: MarkMode | null;
  mark_color?: string | null;
  /** Rótulo do topo da capa (migration 046); nulo = padrão do preset. */
  eyebrow?: string | null;
  /** Véu sobre a foto de fundo (migration 048). */
  bg_overlay?: "auto" | "on" | "off" | null;
  template_applied?: boolean | null;
  video_shape?: VideoShape | null;
  tpl_keyword?: string | null;
  tpl_top_text?: string | null;
  tpl_bottom_text?: string | null;
  tpl_cta_enabled?: boolean | null;
  tpl_color_background?: string | null;
  tpl_color_accent?: string | null;
  tpl_color_text?: string | null;
  tpl_color_keyword_box?: string | null;
}

/**
 * Identidade da contra-capa DESTE post: os `tpl_*` são o override por
 * post (editado na fila pelo modal de contra-capa) e vencem campo a
 * campo; o que estiver nulo cai no default de Ajustes.
 */
export function identityFromPost(post: RenderSpecPostInput, bk: BrandKitRow): VisualIdentity {
  const base = identityFromKit(bk);
  return {
    colorBackground: post.tpl_color_background ?? base.colorBackground,
    colorAccent: post.tpl_color_accent ?? base.colorAccent,
    colorText: post.tpl_color_text ?? base.colorText,
    colorKeywordBox: post.tpl_color_keyword_box ?? base.colorKeywordBox,
    keyword: post.tpl_keyword ?? base.keyword,
    topText: post.tpl_top_text ?? base.topText,
    bottomText: post.tpl_bottom_text ?? base.bottomText,
    ctaEnabled: post.tpl_cta_enabled ?? base.ctaEnabled,
  };
}

/**
 * Deriva a spec de UM post a partir de uma spec já resolvida pro cliente.
 * Só o que é por-post muda: formato, quadro do vídeo, se leva contra-capa
 * e os overrides `tpl_*`. Existe pra quem resolve muitos posts do mesmo
 * cliente de uma vez (a Fila, o resync) não reler brand_kit, templates e
 * plano por post — o resultado é idêntico ao de chamar resolveRenderSpec
 * com esse post.
 *
 * `base.identity` precisa ser a identidade de AJUSTES (sem override), que
 * é o que resolveRenderSpec devolve quando o post não tem `tpl_*`.
 */
export function withPost(base: RenderSpec, post: RenderSpecPostInput): RenderSpec {
  return {
    ...base,
    // O fundo é POR POST (042): a spec base traz o do Brand Kit, e cada
    // post pode trocar sem afetar os outros da mesma resolução.
    cardBrand: resolveBackground(base.cardBrand, post),
    format: post.format,
    videoShape: post.video_shape ?? base.videoShape,
    closingPage: post.template_applied ?? false,
    bgOverlay: post.bg_overlay ?? "auto",
    identity: {
      colorBackground: post.tpl_color_background ?? base.identity.colorBackground,
      colorAccent: post.tpl_color_accent ?? base.identity.colorAccent,
      colorText: post.tpl_color_text ?? base.identity.colorText,
      colorKeywordBox: post.tpl_color_keyword_box ?? base.identity.colorKeywordBox,
      keyword: post.tpl_keyword ?? base.identity.keyword,
      topText: post.tpl_top_text ?? base.identity.topText,
      bottomText: post.tpl_bottom_text ?? base.identity.bottomText,
      ctaEnabled: post.tpl_cta_enabled ?? base.identity.ctaEnabled,
    },
  };
}

/** Superfícies do Template Studio que alguma arte pode usar. */
const RESOLVED_SURFACES: Surface[] = ["cover_image", "carousel_page", "carousel_last"];

/**
 * Monta o snapshot. Ao vivo (fila) o resultado é descartado depois de
 * desenhar o preview; na aprovação ele é gravado em posts.render_spec.
 *
 * `brandKit` pode ser passado por quem já leu a linha (a fila lê uma vez
 * e resolve N posts) — sem ele, é buscado aqui.
 */
export async function resolveRenderSpec(input: {
  clientId: string;
  userId: string;
  post: RenderSpecPostInput;
  brandKit?: BrandKitRow;
}): Promise<RenderSpec> {
  const supabase = createAdminClient();
  let bk = input.brandKit;
  if (bk === undefined) {
    const { data } = await supabase
      .from("brand_kits")
      .select("*")
      .eq("client_id", input.clientId)
      .maybeSingle();
    bk = data;
  }

  const selection =
    (bk?.template_selection as Partial<Record<Surface, string>> | null | undefined) ?? {};
  const specs = await resolveTemplateSpecs(selection, RESOLVED_SURFACES);

  // Guarda a spec INLINE junto do id: editar o modelo no Template Studio
  // depois não pode reescrever arte de post já aprovado — que é o bug
  // que este modelo inteiro existe pra matar.
  const templates: Partial<Record<Surface, { id: string; spec: TemplateSpec }>> = {};
  for (const surface of RESOLVED_SURFACES) {
    const spec = specs[surface];
    const id = selection[surface];
    if (spec && id) templates[surface] = { id, spec };
  }

  const { getUserPlan } = await import("@/lib/subscription");
  const watermark = (await getUserPlan(input.userId)) === "free";

  const cardBrand = resolveBackground(cardBrandFromKit(bk), input.post);
  return {
    v: 1,
    frozenAt: new Date().toISOString(),
    format: input.post.format,
    layoutPreset: cardBrand.layoutPreset ?? "editorial-noir",
    singlePostStyle: cardBrand.singlePostStyle ?? "cover",
    videoShape: input.post.video_shape ?? undefined,
    cardBrand,
    brandTemplate: brandTemplateFromKit(bk),
    profile: profileFromKit(bk),
    identity: identityFromPost(input.post, bk),
    closingPage: input.post.template_applied ?? false,
    bgOverlay: input.post.bg_overlay ?? "auto",
    templates,
    watermark,
  };
}
