"use client";

// ============================================================
// Editor visual de uma spec de template (Sprint B+, TAREFA B14) — v1:
// painel de campos por elemento selecionado + prévia renderizada no
// servidor (debounce), sem drag-and-drop ainda (evolui depois com
// feedback de layout). Ver EditTemplateButton/settings/templates/[id].
// ============================================================
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { previewTemplateSpec, saveTemplateSpec } from "@/app/actions";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
// De template-fonts e NÃO de template-render: aquele importa `sharp`, que
// não pode entrar no bundle do navegador.
import { FONTES_DO_TEMPLATE, pesosDaFonte, pesoMaisProximo } from "@/lib/template-fonts";
import type { Template, TemplateAnchor, TemplateElement, TemplateSpec } from "@/lib/types";

const ANCHORS: TemplateAnchor[] = [
  "top-left", "top-center", "top-right",
  "center-left", "center", "center-right",
  "bottom-left", "bottom-center", "bottom-right",
];

const fieldClasses =
  "w-full rounded-control border border-line bg-surface-2 px-2.5 py-2 text-caption text-content outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/25";

const TEXTLIKE_TYPES = new Set(["headline", "body", "cta", "handleLabel", "wordmark"]);

/**
 * O que dá pra acrescentar num modelo. Só entram tipos que o renderizador
 * REALMENTE desenha (`renderFromSpec`): oferecer `media`, `logo`, `badge`
 * ou `dots` criaria elemento que some na arte final, o que é pior do que
 * não oferecer.
 */
const ELEMENTOS_DISPONIVEIS = [
  { type: "headline", rotulo: "Título", bind: "content.headline", textLike: true },
  { type: "body", rotulo: "Corpo do texto", bind: "content.body", textLike: true },
  { type: "cta", rotulo: "Chamada (CTA)", bind: "content.cta", textLike: true },
  { type: "wordmark", rotulo: "Wordmark (texto)", bind: "brand.wordmark", textLike: true },
  { type: "handleLabel", rotulo: "@handle + palavras-chave", bind: "brand.label", textLike: true },
  { type: "divider", rotulo: "Divisor com wordmark", bind: undefined, textLike: false },
] as const;

/** Onde cada superfície aparece no produto — a prévia sozinha não conta. */
const SUPERFICIE_LABEL: Record<string, string> = {
  cover_image: "Capa do carrossel / post único",
  carousel_page: "Cards do meio do carrossel",
  carousel_last: "Contra-capa (última página)",
  video_cover: "Capa do vídeo",
};

const SUPERFICIE_AJUDA: Record<string, string> = {
  cover_image: "primeira imagem que aparece no feed",
  carousel_page: "vale para todas as páginas do miolo",
  carousel_last: "leva o chip de perfil e fecha o carrossel",
  video_cover: "quadro de abertura do vídeo",
};

function proporcaoLegivel(canvas?: { w: number; h: number }): string {
  const w = canvas?.w ?? 1080;
  const h = canvas?.h ?? 1350;
  const mdc = (a: number, b: number): number => (b === 0 ? a : mdc(b, a % b));
  const d = mdc(w, h);
  return `${w / d}:${h / d}`;
}

export function TemplateSpecEditor({ template }: { template: Template }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(template.name);
  const [spec, setSpec] = useState<TemplateSpec>(template.spec);
  const [selectedId, setSelectedId] = useState<string | null>(spec.elements[0]?.id ?? null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [previewPending, startPreview] = useTransition();
  const [savePending, startSave] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Prévia com debounce: cada mudança de spec re-renderiza no servidor
  // (mesmo motor do post real) depois de 500ms sem novas mudanças.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      startPreview(async () => {
        try {
          const src = await previewTemplateSpec(spec);
          setPreviewSrc(src);
        } catch {
          /* prévia falhou — mantém a última válida */
        }
      });
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec]);

  const selected = spec.elements.find((e) => e.id === selectedId) ?? null;

  /** Acrescenta um elemento do catálogo. O `id` precisa ser único dentro
   *  da spec — é ele que a lista e a seleção usam. */
  function addElement(tipo: (typeof ELEMENTOS_DISPONIVEIS)[number]) {
    const usados = new Set(spec.elements.map((e) => e.id));
    let id: string = tipo.type;
    let n = 2;
    while (usados.has(id)) id = `${tipo.type}-${n++}`;

    const novo: TemplateElement = {
      id,
      type: tipo.type,
      anchor: "center",
      offset: { x: 0.5, y: 0.5 },
      ...(tipo.bind ? { bind: tipo.bind } : {}),
      ...(tipo.textLike
        ? {
            size: { fontSize: 40, maxWidth: 0.84 },
            style: { color: "auto", weight: 400, align: "center" },
          }
        : {}),
      z: spec.elements.length + 1,
    };
    setSpec((s) => ({ ...s, elements: [...s.elements, novo] }));
    setSelectedId(id);
  }

  function removeSelected() {
    if (!selectedId) return;
    setSpec((s) => {
      const restantes = s.elements.filter((e) => e.id !== selectedId);
      setSelectedId(restantes[0]?.id ?? null);
      return { ...s, elements: restantes };
    });
  }

  function updateSelected(patch: Partial<TemplateElement>) {
    if (!selectedId) return;
    setSpec((s) => ({
      ...s,
      elements: s.elements.map((e) => (e.id === selectedId ? { ...e, ...patch } : e)),
    }));
  }

  function updateSelectedStyle(patch: Partial<NonNullable<TemplateElement["style"]>>) {
    if (!selectedId) return;
    setSpec((s) => ({
      ...s,
      elements: s.elements.map((e) =>
        e.id === selectedId ? { ...e, style: { ...e.style, ...patch } } : e
      ),
    }));
  }

  function updateSelectedSize(patch: Partial<NonNullable<TemplateElement["size"]>>) {
    if (!selectedId) return;
    setSpec((s) => ({
      ...s,
      elements: s.elements.map((e) =>
        e.id === selectedId ? { ...e, size: { ...e.size, ...patch } } : e
      ),
    }));
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[280px_1fr_320px]">
      {/* Lista de elementos */}
      <Card className="h-fit p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-caption font-semibold text-muted">Elementos</p>
          <span className="text-micro text-subtle">{spec.elements.length}</span>
        </div>
        <div className="space-y-1">
          {spec.elements.map((el) => (
            <button
              key={el.id}
              type="button"
              onClick={() => setSelectedId(el.id)}
              className={`flex w-full items-center justify-between rounded-control px-2.5 py-1.5 text-left text-caption transition-colors ${
                selectedId === el.id
                  ? "bg-primary/15 text-primary"
                  : "text-muted hover:bg-surface-2 hover:text-content"
              }`}
            >
              <span>{el.id}</span>
              <span className="text-micro text-subtle">
                {el.type}
                {el.visible === false ? " · oculto" : ""}
              </span>
            </button>
          ))}
        </div>

        {/* Acrescentar e remover — antes o modelo era fechado nos elementos
            que o preset trouxe, e "editar" parava aí. */}
        <div className="mt-3 space-y-1.5 border-t border-line pt-3">
          <label className="block text-caption text-muted">Acrescentar elemento</label>
          <select
            value=""
            onChange={(e) => {
              const t = ELEMENTOS_DISPONIVEIS.find((x) => x.type === e.target.value);
              if (t) addElement(t);
              e.target.value = "";
            }}
            className={fieldClasses}
          >
            <option value="">Escolha um tipo...</option>
            {ELEMENTOS_DISPONIVEIS.map((t) => (
              <option key={t.type} value={t.type}>
                {t.rotulo}
              </option>
            ))}
          </select>
          {selected && (
            <Button
              variant="danger"
              size="sm"
              className="w-full"
              onClick={removeSelected}
              disabled={spec.elements.length <= 1}
              title={
                spec.elements.length <= 1
                  ? "Um modelo precisa de ao menos um elemento"
                  : undefined
              }
            >
              Remover &quot;{selected.id}&quot;
            </Button>
          )}
        </div>
      </Card>

      {/* Prévia */}
      <div className="flex flex-col items-center gap-2">
        {/* Onde este modelo é usado. Sem isso a pessoa abria o editor e não
            tinha como saber se estava mexendo na capa, no miolo ou na
            contra-capa — a prévia sozinha não diz. */}
        <div className="w-full max-w-sm rounded-card bg-surface-2 px-3 py-2">
          <p className="text-caption font-semibold text-content">
            {SUPERFICIE_LABEL[spec.surface] ?? spec.surface}
          </p>
          <p className="text-micro text-subtle">
            {SUPERFICIE_AJUDA[spec.surface] ?? ""} · {spec.canvas?.w ?? 1080}×
            {spec.canvas?.h ?? 1350}px ({proporcaoLegivel(spec.canvas)})
          </p>
        </div>
        <div
          className="relative w-full max-w-sm overflow-hidden rounded-card bg-black"
          style={{ aspectRatio: `${spec.canvas?.w ?? 1080} / ${spec.canvas?.h ?? 1350}` }}
        >
          {previewSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewSrc} alt="Prévia do modelo" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-caption text-subtle">
              Gerando prévia...
            </div>
          )}
          {previewPending && (
            <div className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-micro text-white">
              atualizando...
            </div>
          )}
        </div>
        <p className="text-center text-micro text-subtle">
          Prévia com conteúdo de exemplo e as cores/fonte reais da marca — sem foto de fundo aqui (o post de verdade compõe sobre foto quando houver).
        </p>
      </div>

      {/* Painel do elemento selecionado */}
      <Card className="h-fit space-y-3 p-4">
        <Input label="Nome do modelo" value={name} onChange={(e) => setName(e.target.value)} />

        {selected ? (
          <div className="space-y-3 border-t border-line pt-3">
            <p className="text-caption font-semibold text-muted">
              {selected.id} <span className="text-subtle">({selected.type})</span>
            </p>
            {selected.bind && (
              <p className="text-micro text-subtle">Conteúdo: {selected.bind}</p>
            )}

            <label className="flex cursor-pointer items-center gap-2 text-caption text-content">
              <input
                type="checkbox"
                checked={selected.visible !== false}
                onChange={(e) => updateSelected({ visible: e.target.checked })}
                className="h-4 w-4 accent-primary"
              />
              Visível
            </label>

            <div className="space-y-1.5">
              <label className="block text-caption text-muted">Âncora</label>
              <select
                value={selected.anchor}
                onChange={(e) => updateSelected({ anchor: e.target.value as TemplateAnchor })}
                className={fieldClasses}
              >
                {ANCHORS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <label className="block text-caption text-muted">Posição X (0–1)</label>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={selected.offset?.x ?? 0.5}
                  onChange={(e) =>
                    updateSelected({ offset: { x: Number(e.target.value), y: selected.offset?.y ?? 0.5 } })
                  }
                  className={fieldClasses}
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-caption text-muted">Posição Y (0–1)</label>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={selected.offset?.y ?? 0.5}
                  onChange={(e) =>
                    updateSelected({ offset: { x: selected.offset?.x ?? 0.5, y: Number(e.target.value) } })
                  }
                  className={fieldClasses}
                />
              </div>
            </div>

            {TEXTLIKE_TYPES.has(selected.type) && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <label className="block text-caption text-muted">Tamanho da fonte</label>
                    <input
                      type="number"
                      min={8}
                      max={160}
                      value={selected.size?.fontSize ?? 40}
                      onChange={(e) => updateSelectedSize({ fontSize: Number(e.target.value) })}
                      className={fieldClasses}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-caption text-muted">Largura máx. (0–1)</label>
                    <input
                      type="number"
                      min={0.1}
                      max={1}
                      step={0.01}
                      value={selected.size?.maxWidth ?? 0.84}
                      onChange={(e) => updateSelectedSize({ maxWidth: Number(e.target.value) })}
                      className={fieldClasses}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-caption text-muted">Cor</label>
                  <select
                    value={selected.style?.color ?? "auto"}
                    onChange={(e) => updateSelectedStyle({ color: e.target.value })}
                    className={fieldClasses}
                  >
                    <option value="auto">Automática (por contraste)</option>
                    <option value="accent">Cor de destaque da marca</option>
                    <option value="bg">Cor de fundo da marca</option>
                    <option value="text">Cor de texto da marca</option>
                  </select>
                </div>

                {/* Fonte por elemento. Antes isto não existia na tela E o
                    renderizador ignorava `style.font` (os dois ramos do
                    ternário eram iguais) — então "mudar a fonte do modelo"
                    era impossível por dois motivos ao mesmo tempo. */}
                <div className="space-y-1.5">
                  <label className="block text-caption text-muted">Fonte</label>
                  <select
                    value={selected.style?.font ?? "marca"}
                    onChange={(e) => {
                      const font = e.target.value;
                      // Reencaixa o peso: Anton e Varela só têm 400, e
                      // manter 800 aqui faria o texto sair com aparência
                      // errada sem o usuário entender por quê.
                      updateSelectedStyle({
                        font,
                        weight: pesoMaisProximo(selected.style?.weight ?? 400, font),
                      });
                    }}
                    className={fieldClasses}
                  >
                    {FONTES_DO_TEMPLATE.map((f) => (
                      <option key={f.valor} value={f.valor}>
                        {f.rotulo}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <label className="block text-caption text-muted">Peso</label>
                    {/* Só os pesos que a família REALMENTE tem gravados. O
                        campo numérico livre deixava pedir 437, o
                        rasterizador caía noutro arquivo e o texto saía
                        deformado. */}
                    <select
                      value={String(
                        pesoMaisProximo(selected.style?.weight ?? 400, selected.style?.font)
                      )}
                      onChange={(e) => updateSelectedStyle({ weight: Number(e.target.value) })}
                      className={fieldClasses}
                    >
                      {pesosDaFonte(selected.style?.font).map((p) => (
                        <option key={p} value={p}>
                          {p}
                          {p === 400 ? " (normal)" : p >= 800 ? " (pesado)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-caption text-muted">Opacidade</label>
                    <input
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      value={selected.style?.opacity ?? 1}
                      onChange={(e) => updateSelectedStyle({ opacity: Number(e.target.value) })}
                      className={fieldClasses}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-caption text-muted">Alinhamento</label>
                  <select
                    value={selected.style?.align ?? "center"}
                    onChange={(e) =>
                      updateSelectedStyle({ align: e.target.value as "left" | "center" | "right" })
                    }
                    className={fieldClasses}
                  >
                    <option value="left">Esquerda</option>
                    <option value="center">Centro</option>
                    <option value="right">Direita</option>
                  </select>
                </div>

                {/* tracking e lineHeight já existiam no tipo e no
                    renderizador, mas não tinham controle na tela — dava
                    pra "mexer em tudo" menos nos dois. */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <label className="block text-caption text-muted">
                      Espaçamento entre letras
                    </label>
                    <input
                      type="number"
                      min={-0.05}
                      max={0.4}
                      step={0.01}
                      value={selected.style?.tracking ?? 0}
                      onChange={(e) => updateSelectedStyle({ tracking: Number(e.target.value) })}
                      className={fieldClasses}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-caption text-muted">Altura da linha</label>
                    <input
                      type="number"
                      min={0.8}
                      max={2}
                      step={0.05}
                      value={selected.style?.lineHeight ?? 1.15}
                      onChange={(e) => updateSelectedStyle({ lineHeight: Number(e.target.value) })}
                      className={fieldClasses}
                    />
                  </div>
                </div>

                <label className="flex cursor-pointer items-center gap-2 text-caption text-content">
                  <input
                    type="checkbox"
                    checked={selected.style?.case === "upper"}
                    onChange={(e) => updateSelectedStyle({ case: e.target.checked ? "upper" : "none" })}
                    className="h-4 w-4 accent-primary"
                  />
                  Caixa alta
                </label>
              </>
            )}
          </div>
        ) : (
          <p className="text-caption text-subtle">Selecione um elemento pra editar.</p>
        )}

        <Button
          className="w-full"
          loading={savePending}
          onClick={() =>
            startSave(async () => {
              await saveTemplateSpec(template.id, spec, name);
              toast("Modelo salvo.");
              router.push("/settings");
            })
          }
        >
          Salvar modelo
        </Button>
      </Card>
    </div>
  );
}
