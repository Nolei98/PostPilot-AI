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

export interface SourceConfig {
  id: string;
  user_id: string;
  name: string;
  feed_url: string;
  threshold: number; // score mínimo (0-100) para virar candidato
  enabled: boolean;
  created_at: string;
}

export interface NotificationConfig {
  id: string;
  user_id: string;
  telegram_chat_id: string | null;
  notify_on_candidate: boolean;
  post_language: string; // idioma dos posts gerados (ex: "pt-BR", "en")
  ig_handle: string; // @ do perfil (sem @)
  ig_display_name: string; // nome exibido no topo do post
  ig_avatar_url: string | null; // foto de perfil
  ig_verified: boolean; // selo azul ao lado do nome
  show_profile_chip: boolean; // renderizar o chip na arte?
  // Identidade visual default da arte
  color_background: string;
  color_accent: string;
  color_text: string;
  color_keyword_box: string;
  tpl_keyword: string;
  tpl_top_text: string;
  tpl_bottom_text: string;
  tpl_cta_enabled: boolean; // mostra "COMENTE:" acima da palavra-chave na contra-capa
  template_apply_mode: TemplateApplyMode;
  // Provider de IA escolhido em Ajustes (default: gemini/gemini)
  text_provider: "claude" | "gemini" | "pollinations";
  image_provider: "fal" | "gemini" | "pollinations" | "stock";
  // Template da marca: nome, logo + fonte usadas na renderização das artes
  brand_name: string | null;
  logo_url: string | null;
  show_brand_logo: boolean; // liga/desliga o selo da logo nas artes geradas
  post_font_family: string; // chave de PostFontKey (ver src/lib/font-data.ts)
  // Nicho do negócio — escolhido no cadastro, ajustável depois.
  // Direciona o tom dos posts gerados e as fontes RSS padrão.
  niche: string | null;
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

export interface Post {
  id: string;
  news_item_id: string;
  user_id: string;
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
}
