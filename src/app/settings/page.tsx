// ============================================================
// AJUSTES — fontes RSS (adicionar/remover/threshold) e Telegram.
// Usa os componentes do design system.
// ============================================================
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
/* eslint-disable @next/next/no-img-element */
import {
  addSource,
  saveBrandTemplate,
  saveIgProfile,
  saveNiche,
  saveTelegramChatId,
  saveVisualIdentity,
} from "@/app/actions";
import { IdentityForm } from "@/components/IdentityForm";
import { AvatarFileInput } from "@/components/AvatarFileInput";
import { BrandColorPicker } from "@/components/BrandColorPicker";
import { AppShell } from "@/components/ui/AppShell";
import { Card } from "@/components/ui/Card";
import { DeleteSourceButton } from "@/components/DeleteSourceButton";
import { SubmitButton } from "@/components/SubmitButton";
import { getMonthlyQuota } from "@/lib/subscription";
import { PLANS } from "@/lib/plans";
import { POST_FONTS } from "@/lib/font-data";
import { NICHES } from "@/lib/niches";
import type { NotificationConfig, SourceConfig } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = createClient();

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
    .order("created_at");

  const { data: notif } = await supabase
    .from("notification_configs")
    .select("*")
    .maybeSingle();

  const { count: readyCount } = await supabase
    .from("posts")
    .select("id", { count: "exact", head: true })
    .eq("status", "approved");

  const sourceList = (sources ?? []) as SourceConfig[];
  const notifConfig = notif as NotificationConfig | null;

  const fieldClasses =
    "w-full rounded-control border border-line bg-surface-2 px-3 py-2.5 text-body text-content placeholder:text-subtle outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/25";

  return (
    <AppShell
      readyCount={readyCount ?? 0}
      brandName={notifConfig?.brand_name}
      logoUrl={notifConfig?.logo_url}
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
              {notifConfig?.ig_avatar_url ? (
                <img
                  src={notifConfig.ig_avatar_url}
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
                  {notifConfig?.ig_display_name ?? "Seu Perfil de IA"}
                  {notifConfig?.ig_verified && (
                    /* selo azul de verificado */
                    <svg width="14" height="14" viewBox="0 0 24 24" aria-label="Verificado">
                      <circle cx="12" cy="12" r="11" fill="#3897F0" />
                      <path d="m7.5 12.5 3 3 6-6.5" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </p>
                <p className="truncate text-caption text-muted">
                  @{notifConfig?.ig_handle ?? "seuperfil.ia"}
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
                defaultValue={notifConfig?.ig_display_name ?? ""}
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
                defaultValue={notifConfig?.ig_handle ?? ""}
                placeholder="Ex: joaodaia (sem @)"
                className={fieldClasses}
              />
            </div>
            {/* Toggles: selo de verificado + chip na arte */}
            <label className="flex cursor-pointer items-center gap-3 rounded-control bg-surface-2 px-3 py-2.5">
              <input
                type="checkbox"
                name="ig_verified"
                defaultChecked={notifConfig?.ig_verified ?? false}
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
                defaultChecked={notifConfig?.show_profile_chip ?? true}
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
              colorBackground: notifConfig?.color_background ?? "#0B0B12",
              colorAccent: notifConfig?.color_accent ?? "#7C5CFF",
              colorText: notifConfig?.color_text ?? "#FFFFFF",
              colorKeywordBox: notifConfig?.color_keyword_box ?? "#7C5CFF",
              keyword: notifConfig?.tpl_keyword ?? "IA",
              topText: notifConfig?.tpl_top_text ?? "A NOVIDADE DE",
              bottomText: notifConfig?.tpl_bottom_text ?? "QUE MUDA TUDO",
              ctaEnabled: notifConfig?.tpl_cta_enabled ?? false,
            }}
            initialMode={
              notifConfig?.template_apply_mode === "on_approval"
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
                defaultValue={notifConfig?.brand_name ?? ""}
                placeholder="Ex: Sua Marca"
                className={fieldClasses}
              />
              <p className="text-micro text-subtle">
                Aparece na barra lateral do app (em vez de &quot;Sua Marca&quot;).
              </p>
            </div>
            <div className="flex items-center gap-4">
              {notifConfig?.logo_url ? (
                <img
                  src={notifConfig.logo_url}
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
                defaultChecked={notifConfig?.show_brand_logo ?? true}
                className="h-4 w-4 accent-[#7C5CFF]"
              />
              <span className="text-body">
                Mostrar logo na arte{" "}
                <span className="text-caption text-subtle">
                  (selo discreto no canto do conteúdo e da contra-capa)
                </span>
              </span>
            </label>
            <BrandColorPicker initial={notifConfig?.color_accent ?? "#E0219C"} />
            <div className="space-y-1.5">
              <label htmlFor="post_font_family" className="block text-caption text-muted">
                Fonte das artes
              </label>
              <select
                id="post_font_family"
                name="post_font_family"
                defaultValue={notifConfig?.post_font_family ?? "inter"}
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
                defaultValue={notifConfig?.niche ?? NICHES[0].key}
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
                defaultValue={notifConfig?.post_language ?? "pt-BR"}
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
                defaultValue={notifConfig?.text_provider ?? "gemini"}
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
                defaultValue={notifConfig?.image_provider ?? "stock"}
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
