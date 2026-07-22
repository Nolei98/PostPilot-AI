// ============================================================
// AJUSTES — fontes RSS (adicionar/remover/threshold) e Telegram.
// Usa os componentes do design system.
// ============================================================
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
/* eslint-disable @next/next/no-img-element */
import {
  addSource,
  disconnectInstagram,
  saveBrandTemplate,
  saveDefaultFormat,
  saveIgProfile,
  saveLayoutPreset,
  saveSinglePostStyle,
  saveNiche,
  saveTelegramChatId,
  saveVisualIdentity,
} from "@/app/actions";
import { IdentityForm } from "@/components/IdentityForm";
import { BrandLabelForm } from "@/components/BrandLabelForm";
import { AvatarFileInput } from "@/components/AvatarFileInput";
import { BrandColorPicker } from "@/components/BrandColorPicker";
import { AppShell } from "@/components/ui/AppShell";
import { getShellData } from "@/lib/shell";
import { Card } from "@/components/ui/Card";
import { DeleteSourceButton } from "@/components/DeleteSourceButton";
import { SubmitButton } from "@/components/SubmitButton";
import { getMonthlyQuota } from "@/lib/subscription";
import { PLANS } from "@/lib/plans";
import { POST_FONTS, resolvePostFontFamily } from "@/lib/font-data";
import { NICHES } from "@/lib/niches";
import { LayoutPreview } from "@/components/LayoutPreview";
import { PREVIEW_LAYOUTS, PREVIEW_FORMATS } from "@/lib/layout-preview";
import type { CardBrand, LayoutPreset } from "@/lib/render-shared";
import type { BrandKit, NotificationConfig, SocialConnection, SourceConfig } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: { ig?: string; reason?: string };
}) {
  const supabase = createClient();
  const shell = await getShellData();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const quota = user
    ? await getMonthlyQuota(user.id)
    : {
        plan: "free" as const,
        used: 0,
        limit: PLANS.free.postsPerMonth,
        remaining: PLANS.free.postsPerMonth,
        unlimited: false,
      };

  const { data: sources } = await supabase
    .from("source_configs")
    .select("*")
    .eq("client_id", shell.activeClientId ?? "")
    .order("created_at");

  const { data: notif } = await supabase
    .from("notification_configs")
    .select("*")
    .maybeSingle();

  // Identidade de marca vem do brand_kit do cliente ATIVO (por tenant).
  const { data: bk } = await supabase
    .from("brand_kits")
    .select("*")
    .eq("client_id", shell.activeClientId ?? "")
    .maybeSingle();

  const { data: igConn } = await supabase
    .from("social_connections")
    .select("*")
    .eq("client_id", shell.activeClientId ?? "")
    .eq("status", "connected")
    .maybeSingle();

  const sourceList = (sources ?? []) as SourceConfig[];
  const notifConfig = notif as NotificationConfig | null;
  const brandKit = bk as BrandKit | null;
  const socialConnection = igConn as SocialConnection | null;

  // Marca real do cliente (cores/fonte/rótulo) — os previews de layout
  // (kit v2 §7.7) usam a identidade de verdade, não uma cor genérica.
  const previewBrand: CardBrand = {
    colorBackground: brandKit?.color_background ?? "#0B0B12",
    colorAccent: brandKit?.color_accent ?? "#7C5CFF",
    colorText: brandKit?.color_text ?? "#FFFFFF",
    fontFamily: resolvePostFontFamily(brandKit?.post_font_family),
    brandName: brandKit?.brand_name ?? null,
    wordmark: brandKit?.wordmark ?? null,
    handle: brandKit?.ig_handle ?? null,
    keywords: brandKit?.keywords ?? null,
    brandMark: brandKit?.brand_mark ?? "auto",
  };

  const fieldClasses =
    "w-full rounded-control border border-line bg-surface-2 px-3 py-2.5 text-body text-content placeholder:text-subtle outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/25";

  return (
    <AppShell
      readyCount={shell.readyCount}
      brandName={brandKit?.brand_name}
      logoUrl={brandKit?.logo_url}
      clients={shell.clients}
      activeClientId={shell.activeClientId}
    >
      <div className="mb-5">
        <h1 className="text-display">Ajustes</h1>
        <p className="text-caption text-muted">
          Fontes monitoradas e notificações
        </p>
      </div>

      {/* ===== Plano ===== */}
      <section className="mb-8">
        <h2 className="mb-3 text-title text-muted">Plano</h2>
        <Card className="flex items-center justify-between gap-3 p-4">
          <div>
            <p className="text-body font-semibold">
              {quota.unlimited ? "Ilimitado (Pollinations.ai)" : PLANS[quota.plan].label}
            </p>
            <p className="text-caption text-muted">
              {quota.unlimited
                ? `${quota.used} posts gerados este mês`
                : `${quota.used}/${quota.limit} posts usados este mês`}
            </p>
            {quota.unlimited && (
              <p className="mt-1 text-caption text-warning">
                Conta ilimitada: texto e imagem sempre via Pollinations.ai (grátis), independente do que estiver selecionado em Preferências.
              </p>
            )}
          </div>
          <Link
            href="/pricing"
            className="shrink-0 rounded-control bg-surface-2 px-4 py-2.5 text-body transition-colors hover:bg-primary hover:text-white"
          >
            Gerenciar plano
          </Link>
        </Card>
      </section>

      {/* ===== Perfil do Instagram (aparece no topo do post) ===== */}
      <section className="mb-8">
        <h2 className="mb-3 text-title text-muted">Perfil do Instagram</h2>
        <Card className="p-4">
          <form action={saveIgProfile} className="space-y-4">
            {/* Preview ao vivo do header do post */}
            <div className="flex items-center gap-3 rounded-control bg-black p-3">
              {brandKit?.ig_avatar_url ? (
                <img
                  src={brandKit.ig_avatar_url}
                  alt="Foto de perfil"
                  className="h-11 w-11 rounded-full object-cover ring-2 ring-line"
                />
              ) : (
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-tr from-warning via-error to-primary text-lg">
                  🤖
                </div>
              )}
              <div className="min-w-0 leading-tight">
                <p className="flex items-center gap-1 truncate text-body font-semibold">
                  {brandKit?.ig_display_name ?? "Seu Perfil de IA"}
                  {brandKit?.ig_verified && (
                    /* selo azul de verificado */
                    <svg width="14" height="14" viewBox="0 0 24 24" aria-label="Verificado">
                      <circle cx="12" cy="12" r="11" fill="#3897F0" />
                      <path d="m7.5 12.5 3 3 6-6.5" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </p>
                <p className="truncate text-caption text-muted">
                  @{brandKit?.ig_handle ?? "seuperfil.ia"}
                </p>
              </div>
            </div>

            <AvatarFileInput />
            <div className="space-y-1.5">
              <label htmlFor="ig_display_name" className="block text-caption text-muted">
                Nome exibido
              </label>
              <input
                id="ig_display_name"
                name="ig_display_name"
                defaultValue={brandKit?.ig_display_name ?? ""}
                placeholder="Ex: João da IA"
                className={fieldClasses}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="ig_handle" className="block text-caption text-muted">
                @ do perfil
              </label>
              <input
                id="ig_handle"
                name="ig_handle"
                defaultValue={brandKit?.ig_handle ?? ""}
                placeholder="Ex: joaodaia (sem @)"
                className={fieldClasses}
              />
            </div>
            {/* Toggles: selo de verificado + chip na arte */}
            <label className="flex cursor-pointer items-center gap-3 rounded-control bg-surface-2 px-3 py-2.5">
              <input
                type="checkbox"
                name="ig_verified"
                defaultChecked={brandKit?.ig_verified ?? false}
                className="h-4 w-4 accent-[#3897F0]"
              />
              <span className="text-body">
                Selo de verificado{" "}
                <span className="text-caption text-subtle">
                  (azul, ao lado do nome)
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-center gap-3 rounded-control bg-surface-2 px-3 py-2.5">
              <input
                type="checkbox"
                name="show_profile_chip"
                defaultChecked={brandKit?.show_profile_chip ?? true}
                className="h-4 w-4 accent-[#7C5CFF]"
              />
              <span className="text-body">
                Mostrar chip de perfil na arte{" "}
                <span className="text-caption text-subtle">
                  (topo de cada slide)
                </span>
              </span>
            </label>
            <SubmitButton savingLabel="Salvando perfil...">
              Salvar perfil
            </SubmitButton>
          </form>
        </Card>
      </section>

      {/* ===== Contra-capa (identidade visual da 2ª página) ===== */}
      <section className="mb-8">
        <h2 className="mb-3 text-title text-muted">Contra-capa</h2>
        <Card className="p-4">
          <IdentityForm
            action={saveVisualIdentity}
            fieldClasses={fieldClasses}
            initial={{
              colorBackground: brandKit?.color_background ?? "#0B0B12",
              colorAccent: brandKit?.color_accent ?? "#7C5CFF",
              colorText: brandKit?.color_text ?? "#FFFFFF",
              colorKeywordBox: brandKit?.color_keyword_box ?? "#7C5CFF",
              keyword: brandKit?.tpl_keyword ?? "IA",
              topText: brandKit?.tpl_top_text ?? "A NOVIDADE DE",
              bottomText: brandKit?.tpl_bottom_text ?? "QUE MUDA TUDO",
              ctaEnabled: brandKit?.tpl_cta_enabled ?? false,
            }}
            initialMode={
              brandKit?.template_apply_mode === "on_approval"
                ? "on_approval"
                : "all"
            }
          />
        </Card>
      </section>

      {/* ===== Template da marca (logo + fonte das artes) ===== */}
      <section className="mb-8">
        <h2 className="mb-3 text-title text-muted">Template da marca</h2>
        <Card className="p-4">
          <form action={saveBrandTemplate} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="brand_name" className="block text-caption text-muted">
                Nome da marca
              </label>
              <input
                id="brand_name"
                name="brand_name"
                defaultValue={brandKit?.brand_name ?? ""}
                placeholder="Ex: Sua Marca"
                className={fieldClasses}
              />
              <p className="text-micro text-subtle">
                Aparece na barra lateral do app (em vez de &quot;Sua Marca&quot;).
              </p>
            </div>
            <div className="flex items-center gap-4">
              {brandKit?.logo_url ? (
                <img
                  src={brandKit.logo_url}
                  alt="Logo da marca"
                  className="h-14 w-14 rounded-full object-cover ring-2 ring-line"
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-micro text-subtle">
                  sem logo
                </div>
              )}
              <div className="flex-1">
                <AvatarFileInput
                  name="logo"
                  label="Logo da marca (JPG/PNG, máx 2MB)"
                />
              </div>
            </div>
            <label className="flex cursor-pointer items-center gap-3 rounded-control bg-surface-2 px-3 py-2.5">
              <input
                type="checkbox"
                name="show_brand_logo"
                defaultChecked={brandKit?.show_brand_logo ?? true}
                className="h-4 w-4 accent-[#7C5CFF]"
              />
              <span className="text-body">
                Mostrar logo na arte{" "}
                <span className="text-caption text-subtle">
                  (selo discreto no canto do conteúdo e da contra-capa)
                </span>
              </span>
            </label>
            <BrandColorPicker initial={brandKit?.color_accent ?? "#E0219C"} />
            <div className="space-y-1.5">
              <label htmlFor="post_font_family" className="block text-caption text-muted">
                Fonte das artes
              </label>
              <select
                id="post_font_family"
                name="post_font_family"
                defaultValue={brandKit?.post_font_family ?? "inter"}
                className={fieldClasses}
              >
                {POST_FONTS.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
              <p className="text-micro text-subtle">
                Usada no título, no chip de perfil e na contra-capa — salvar re-renderiza os posts na fila.
              </p>
            </div>
            <SubmitButton savingLabel="Salvando template...">
              Salvar template da marca
            </SubmitButton>
          </form>
        </Card>
      </section>

      {/* ===== Layout das artes (Fase 3) ===== */}
      <section className="mb-8">
        <h2 className="mb-3 text-title text-muted">Layout das artes</h2>
        <Card className="p-4">
          <form action={saveLayoutPreset} className="space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="layout_preset" className="block text-caption text-muted">
                Estilo visual dos cards (capa, interior e fechamento)
              </label>
              <select
                id="layout_preset"
                name="layout_preset"
                defaultValue={brandKit?.layout_preset ?? "editorial-noir"}
                className={fieldClasses}
              >
                <option value="editorial-noir">Editorial Noir (padrão)</option>
                <option value="brutalism">Brutalismo Editorial</option>
                <option value="serif-luxe">Serif Luxe</option>
                <option value="swiss-mono">Swiss Mono</option>
                <option value="pop-creator">Pop Creator</option>
              </select>
              <p className="text-micro text-subtle">
                Salvar re-renderiza na hora os carrosséis e fechamentos já na fila com o novo layout.
              </p>
            </div>
            <SubmitButton savingLabel="Salvando layout...">
              Salvar layout
            </SubmitButton>
          </form>
        </Card>

        {/* Previews (kit v2 §7.7): 5 layouts × 4 formatos, com a cor/fonte
            reais da marca — decida olhando antes de trocar acima. */}
        <div className="mt-4 space-y-4">
          {PREVIEW_LAYOUTS.map((layout) => (
            <Card
              key={layout.key}
              className={`p-4 ${
                (brandKit?.layout_preset ?? "editorial-noir") === layout.key
                  ? "ring-2 ring-primary"
                  : ""
              }`}
            >
              <p className="mb-3 text-body font-semibold">{layout.label}</p>
              <div className="flex gap-4 overflow-x-auto pb-1">
                {PREVIEW_FORMATS.map((fmt) => (
                  <div key={fmt.key} className="shrink-0">
                    <LayoutPreview
                      layoutPreset={layout.key as LayoutPreset}
                      format={fmt.key}
                      brand={previewBrand}
                    />
                    <p className="mt-1.5 text-center text-micro text-subtle">{fmt.label}</p>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* ===== Estilo do post único (kit v2 §3) ===== */}
      <section className="mb-8">
        <h2 className="mb-3 text-title text-muted">Estilo do post único</h2>
        <Card className="p-4">
          <form action={saveSinglePostStyle} className="space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="single_post_style" className="block text-caption text-muted">
                Como a página 1 (foto + título) é composta
              </label>
              <select
                id="single_post_style"
                name="single_post_style"
                defaultValue={brandKit?.single_post_style ?? "cover"}
                className={fieldClasses}
              >
                <option value="cover">Estilo capa (com wordmark, igual ao carrossel)</option>
                <option value="centered">Fonte no meio (minimalista, sem marca)</option>
              </select>
              <p className="text-micro text-subtle">
                &quot;Fonte no meio&quot; usa a mesma tipografia do layout escolhido acima, só centralizada e sem wordmark — deixa a foto respirar. Salvar re-renderiza a página 1 dos posts únicos já na fila.
              </p>
            </div>
            <SubmitButton savingLabel="Salvando estilo...">
              Salvar estilo
            </SubmitButton>
          </form>
        </Card>
      </section>

      {/* ===== Identidade de rótulo (@0verlens / Sprint B+) ===== */}
      <section className="mb-8">
        <h2 className="mb-3 text-title text-muted">Identidade de rótulo</h2>
        <Card className="p-4">
          <BrandLabelForm
            fieldClasses={fieldClasses}
            handle={brandKit?.ig_handle ?? "seuperfil.ia"}
            accent={brandKit?.color_accent ?? "#7C5CFF"}
            initial={{
              wordmark: brandKit?.wordmark ?? "",
              keywords: (brandKit?.keywords ?? []).join(", "),
              brandMark: brandKit?.brand_mark ?? "auto",
            }}
          />
        </Card>
      </section>

      {/* ===== Formato dos posts ===== */}
      <section className="mb-8">
        <h2 className="mb-3 text-title text-muted">Formato dos posts</h2>
        <Card className="p-4">
          <form action={saveDefaultFormat} className="space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="default_format" className="block text-caption text-muted">
                O que o piloto gera para cada notícia candidata
              </label>
              <select
                id="default_format"
                name="default_format"
                defaultValue={brandKit?.default_format ?? "single"}
                className={fieldClasses}
              >
                <option value="single">Post único (imagem 4:5)</option>
                <option value="carousel">Carrossel (7–10 cards)</option>
              </select>
              <p className="text-micro text-subtle">
                Vale para as próximas gerações deste cliente. Carrossel usa as
                cores/fonte da marca em cada card.
              </p>
            </div>
            <SubmitButton savingLabel="Salvando...">Salvar formato</SubmitButton>
          </form>
        </Card>
      </section>

      {/* ===== Publicação automática (Sprint C — Graph API) ===== */}
      <section className="mb-8">
        <h2 className="mb-3 text-title text-muted">Publicação automática</h2>
        <Card className="p-4 space-y-3">
          {searchParams?.ig === "connected" && (
            <p className="rounded-control border border-success/40 bg-success/10 px-3 py-2 text-caption text-success">
              ✓ Instagram conectado com sucesso.
            </p>
          )}
          {searchParams?.ig === "error" && (
            <p className="rounded-control border border-error/40 bg-error/10 px-3 py-2 text-caption text-error">
              ✕ Não foi possível conectar
              {searchParams.reason === "no_ig_business_account"
                ? " — a Página do Facebook não tem uma conta Instagram Business/Creator vinculada."
                : "."}
            </p>
          )}
          {socialConnection ? (
            <>
              <p className="text-body text-content">
                Conectado como <strong>@{socialConnection.ig_username}</strong>
              </p>
              <p className="text-micro text-subtle">
                Posts agendados (botão &quot;Agendar&quot; na Fila) publicam
                sozinhos no horário escolhido.
              </p>
              <form action={disconnectInstagram}>
                <SubmitButton savingLabel="Desconectando...">
                  Desconectar Instagram
                </SubmitButton>
              </form>
            </>
          ) : (
            <>
              <p className="text-micro text-subtle">
                Conecte a conta Instagram Business/Creator deste cliente para
                agendar posts e publicá-los automaticamente. Sem conexão, o
                fluxo manual (copiar legenda + baixar arte + &quot;Postei&quot;)
                continua funcionando normalmente.
              </p>
              <a
                href={`/api/instagram/connect?clientId=${shell.activeClientId ?? ""}`}
                className="inline-flex items-center justify-center gap-2 rounded-control bg-gradient-to-br from-[#E0219C] via-[#A020F0] to-[#7B2FF7] px-5 py-3 text-body font-medium text-white shadow-[0_0_34px_rgba(224,33,156,0.35)] transition-all hover:-translate-y-[2px] hover:shadow-[0_0_50px_rgba(224,33,156,0.6)]"
              >
                Conectar Instagram
              </a>
            </>
          )}
        </Card>
      </section>

      {/* ===== Fontes RSS ===== */}
      <section className="mb-8">
        <h2 className="mb-3 text-title text-muted">Fontes RSS</h2>

        <div className="mb-4 space-y-2">
          {sourceList.length === 0 && (
            <div className="rounded-card border border-dashed border-line p-5 text-center text-body text-subtle">
              Nenhuma fonte. Adicione abaixo ou rode o seed.sql.
            </div>
          )}
          {sourceList.map((s, i) => (
            <div
              key={s.id}
              style={{ animationDelay: `${i * 40}ms` }}
              className="animate-fade-up"
            >
              <Card
                interactive
                className="flex items-center justify-between gap-2 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-body font-medium">{s.name}</p>
                  <p className="truncate text-caption text-subtle">
                    {s.feed_url}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className="rounded-full bg-surface-2 px-2 py-0.5 text-micro text-muted"
                    title="Score mínimo para virar candidato"
                  >
                    ≥{s.threshold}
                  </span>
                  <DeleteSourceButton sourceId={s.id} />
                </div>
              </Card>
            </div>
          ))}
        </div>

        {/* Adicionar fonte (form nativo + server action) */}
        <Card className="p-4">
          <form action={addSource} className="space-y-3">
            <p className="text-body font-medium">Adicionar fonte</p>
            <input
              name="name"
              required
              placeholder="Nome (ex: TechCrunch AI)"
              className={fieldClasses}
            />
            <input
              name="feed_url"
              required
              type="url"
              placeholder="URL do feed RSS"
              className={fieldClasses}
            />
            <div className="flex items-center gap-3">
              <label htmlFor="threshold" className="text-caption text-muted">
                Score mínimo p/ virar candidato
              </label>
              <input
                id="threshold"
                name="threshold"
                type="number"
                min={0}
                max={100}
                defaultValue={70}
                className={`${fieldClasses} w-20`}
              />
            </div>
            <SubmitButton savingLabel="Adicionando...">
              + Adicionar fonte
            </SubmitButton>
          </form>
        </Card>
      </section>

      {/* ===== Nicho do negócio ===== */}
      <section className="mb-8">
        <h2 className="mb-3 text-title text-muted">Nicho do negócio</h2>
        <Card className="p-4">
          <form action={saveNiche} className="space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="niche" className="block text-caption text-muted">
                Direciona o tom dos posts e o critério de triagem viral
              </label>
              <select
                id="niche"
                name="niche"
                defaultValue={brandKit?.niche ?? NICHES[0].key}
                className={fieldClasses}
              >
                {NICHES.map((n) => (
                  <option key={n.key} value={n.key}>
                    {n.label}
                  </option>
                ))}
              </select>
            </div>
            <SubmitButton savingLabel="Salvando...">Salvar nicho</SubmitButton>
          </form>
        </Card>
      </section>

      {/* ===== Preferências (idioma + Telegram) ===== */}
      <section>
        <h2 className="mb-3 text-title text-muted">Preferências</h2>
        <Card className="p-4">
          <form action={saveTelegramChatId} className="space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="post_language" className="block text-caption text-muted">
                Idioma dos posts gerados
              </label>
              <select
                id="post_language"
                name="post_language"
                defaultValue={brandKit?.post_language ?? "pt-BR"}
                className={fieldClasses}
              >
                <option value="pt-BR">Português (Brasil)</option>
                <option value="en">Inglês</option>
                <option value="es">Espanhol</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="telegram_chat_id" className="block text-caption text-muted">
                Telegram (chat_id para notificações)
              </label>
              <input
                id="telegram_chat_id"
                name="telegram_chat_id"
                defaultValue={notifConfig?.telegram_chat_id ?? ""}
                placeholder="Seu chat_id do Telegram"
                className={fieldClasses}
              />
            </div>

            {quota.unlimited && (
              <p className="rounded-control bg-warning/10 px-3 py-2.5 text-caption text-warning">
                Sua conta é ilimitada — os providers abaixo são ignorados; texto e imagem saem sempre pelo Pollinations.ai (grátis).
              </p>
            )}
            <div className="space-y-1.5">
              <label htmlFor="text_provider" className="block text-caption text-muted">
                Provider de IA — texto (hook, legenda, hashtags)
              </label>
              <select
                id="text_provider"
                name="text_provider"
                defaultValue={brandKit?.text_provider ?? "gemini"}
                className={fieldClasses}
              >
                <option value="gemini">Gemini (Google AI Studio)</option>
                <option value="claude">Claude (Anthropic)</option>
                <option value="pollinations">Pollinations.ai (grátis, sem key)</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="image_provider" className="block text-caption text-muted">
                Provider de imagem (arte do post)
              </label>
              <select
                id="image_provider"
                name="image_provider"
                defaultValue={brandKit?.image_provider ?? "stock"}
                className={fieldClasses}
              >
                <option value="stock">Fotos reais (Pexels/Unsplash) — recomendado</option>
                <option value="gemini">Gemini (Google AI Studio)</option>
                <option value="fal">Fal.ai (Flux)</option>
                <option value="pollinations">Pollinations.ai (grátis, sem key)</option>
              </select>
            </div>
            <p className="text-caption text-subtle">
              &quot;Fotos reais&quot; busca uma foto de pessoa de verdade no
              banco (sem os artefatos de IA em rosto/mãos) e aplica o
              branding por cima; sem resultado, cai pra IA (ilustração sem
              pessoas). Se o provider escolhido não tiver a chave
              configurada no servidor, o app cai automaticamente pro outro
              disponível (ou MOCK, sem custo).
            </p>
            <p className="text-caption text-subtle">
              1. Crie um bot com o @BotFather e configure o token no servidor
              (TELEGRAM_BOT_TOKEN). 2. Mande /start para o bot. 3. Pegue seu
              chat_id em api.telegram.org/bot&lt;TOKEN&gt;/getUpdates e cole
              aqui.
            </p>
            <SubmitButton>Salvar</SubmitButton>
          </form>
        </Card>
      </section>
    </AppShell>
  );
}
