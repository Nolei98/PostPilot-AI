// ============================================================
// Tipos do domínio — espelham o schema do Supabase
// ============================================================

export type NewsStatus = "new" | "scored" | "candidate" | "discarded";

// 'scheduled' e 'published' reservados para a Fase 2 (Graph API)
export type PostStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "discarded"
  | "scheduled"
  | "published";

/** Cliente (tenant). Um usuário-dono pode ter N clientes. */
export interface Client {
  id: string;
  owner_user_id: string;
  name: string;
  created_at: string;
}

/**
 * Brand Kit — config de conteúdo/marca por cliente. Espelha as
 * colunas migradas de notification_configs (ver migration 020).
 * É a fonte da verdade da identidade de cada cliente.
 */
export interface BrandKit {
  id: string;
  client_id: string;
  // geração
  post_language: string;
  text_provider: "claude" | "gemini" | "pollinations";
  image_provider: "fal" | "gemini" | "pollinations" | "stock";
  default_format: "single" | "carousel"; // formato que o pipeline gera
  niche: string | null;
  // perfil IG
  ig_handle: string;
  ig_display_name: string;
  ig_avatar_url: string | null;
  ig_verified: boolean;
  show_profile_chip: boolean;
  // identidade visual (contra-capa)
  color_background: string;
  color_accent: string;
  color_text: string;
  color_keyword_box: string;
  tpl_keyword: string;
  tpl_top_text: string;
  tpl_bottom_text: string;
  tpl_cta_enabled: boolean;
  template_apply_mode: TemplateApplyMode;
  // template da marca
  brand_name: string | null;
  logo_url: string | null;
  show_brand_logo: boolean;
  post_font_family: string;
  // identidade de rótulo/tipografia (Sprint B+, @0verlens) — migration 027.
  // O handle do rótulo reusa ig_handle acima.
  keywords: string[] | null; // {DESIGN, ARTE, TECH}
  wordmark: string | null; // OVERLENS® (divisor da capa)
  font_heading_url: string | null; // fonte embutida no Satori
  brand_mark: BrandMark; // tratamento de marca padrão dos cards
  template_defaults: TemplateDefaults;
  created_at: string;
}

/** Tratamento de marca de um card/capa (ver HANDOFF-overlens-template.md). */
export type BrandMark =
  | "wordmark"
  | "handle"
  | "icon"
  | "wordmark+handle"
  | "none"
  | "auto";

/**
 * Contrato de layout (template_defaults no Brand Kit; layout por card
 * sobrescreve). Campos opcionais — o renderer aplica defaults sensatos.
 * Ver HANDOFF-overlens-template.md seção 5.
 */
export interface TemplateDefaults {
  background?: "image" | "solid" | "gradient";
  colorGrade?: { enabled: boolean; darken: number; desaturate: number };
  labelPosition?: "auto" | "top" | "bottom";
  showLabel?: "auto" | true | false;
  textColor?: "auto" | "light" | "dark";
  scrim?: "auto" | "on" | "off";
  scrimMaxAlpha?: number;
  blur?: "off" | "on";
  brandMark?: BrandMark;
  colorScheme?: "brand" | "inverse" | "mono-light" | "mono-dark" | "accent";
  showDivider?: boolean;
  contrastTarget?: number;
}

export interface SourceConfig {
  id: string;
  user_id: string;
  client_id: string;
  name: string;
  feed_url: string;
  threshold: number; // score mínimo (0-100) para virar candidato
  enabled: boolean;
  created_at: string;
}

/**
 * Config per-USUÁRIO. Depois da migration 024, guarda só notificação
 * (Telegram) e o cliente ativo — toda a identidade de marca vive em
 * [[BrandKit]] por cliente.
 */
export interface NotificationConfig {
  id: string;
  user_id: string;
  telegram_chat_id: string | null;
  notify_on_candidate: boolean;
  active_client_id: string | null; // cliente ativo (fan-out do cron)
  created_at: string;
}

/** Template visual da marca (logo + fonte) aplicado na renderização das artes */
export interface BrandTemplate {
  logoUrl: string | null;
  showLogo: boolean; // false = não desenha o selo, mesmo com logoUrl setada
  fontFamily: string; // nome da família resolvido (ver resolvePostFontFamily)
}

/** Dados do perfil usados no preview e no chip da arte */
export interface IgProfile {
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  verified: boolean;
  showProfileChip: boolean;
}

/** Quando o template de identidade visual é aplicado */
export type TemplateApplyMode = "all" | "on_approval";

/** Identidade visual da CONTRA-CAPA (defaults em Ajustes; override por post) */
export interface VisualIdentity {
  colorBackground: string; // fundo do slide (HEX)
  colorAccent: string; // realce (barra, @handle)
  colorText: string; // textos
  colorKeywordBox: string; // caixa da palavra-chave
  keyword: string; // palavra em destaque (na caixa)
  topText: string; // linha(s) acima do "COMENTE:"/palavra-chave (aceita quebra de linha)
  bottomText: string; // linha(s) abaixo da palavra-chave (aceita quebra de linha)
  ctaEnabled: boolean; // mostra a palavra fixa "COMENTE:" acima da palavra-chave
}

export interface NewsItem {
  id: string;
  source_id: string;
  client_id: string;
  url: string;
  title: string;
  summary: string | null;
  published_at: string | null;
  viral_score: number | null;
  score_reason: string | null;
  status: NewsStatus;
  // Imagem original da matéria (do feed RSS), se houver — usada como
  // base da arte em vez do Flux. image_license_hint é heurística, não
  // confirmação jurídica (ver src/lib/image-license.ts).
  image_url: string | null;
  image_license_hint: "likely_free" | "verify" | null;
  created_at: string;
}

export type PostFormat = "single" | "carousel" | "video";

/** Card de um post do tipo carrossel (ver carousel_cards) */
export interface CarouselCardRow {
  id: string;
  post_id: string;
  idx: number;
  role: "hook" | "value" | "cta";
  headline: string | null;
  body: string | null;
  image_url: string | null;
  created_at: string;
}

export interface Post {
  id: string;
  news_item_id: string;
  user_id: string;
  client_id: string;
  format: PostFormat;
  hook: string;
  caption: string;
  hashtags: string;
  image_prompt: string;
  image_url: string | null;
  status: PostStatus;
  approved_at: string | null;
  scheduled_for: string | null; // Fase 2
  ig_media_id: string | null; // Fase 2
  // Página 2 do carrossel (a CONTRA-CAPA). null = post de 1 página.
  closing_image_url: string | null;
  // Foto real de banco usada na página de conteúdo (Pexels/Unsplash),
  // se o provider escolhido foi 'stock'. null = imagem gerada por IA.
  stock_photo_id: string | null;
  stock_photo_credit: string | null;
  // Identidade visual da contra-capa (override; null = default)
  template_applied: boolean;
  tpl_keyword: string | null;
  tpl_top_text: string | null;
  tpl_bottom_text: string | null;
  tpl_cta_enabled: boolean | null;
  tpl_color_background: string | null;
  tpl_color_accent: string | null;
  tpl_color_text: string | null;
  tpl_color_keyword_box: string | null;
  created_at: string;
}

// Post com a notícia de origem embutida (para o dashboard)
export interface PostWithNews extends Post {
  news_items: Pick<
    NewsItem,
    "title" | "url" | "viral_score" | "image_url" | "image_license_hint"
  >;
  // Presente só em posts format='carousel' (embed do PostgREST).
  carousel_cards?: Pick<
    CarouselCardRow,
    "id" | "idx" | "role" | "headline" | "body" | "image_url"
  >[];
}
