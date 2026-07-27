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
import type { Template, TemplateAnchor, TemplateElement, TemplateSpec } from "@/lib/types";

const ANCHORS: TemplateAnchor[] = [
  "top-left", "top-center", "top-right",
  "center-left", "center", "center-right",
  "bottom-left", "bottom-center", "bottom-right",
];

const fieldClasses =
  "w-full rounded-control border border-line bg-surface-2 px-2.5 py-2 text-caption text-content outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/25";

const TEXTLIKE_TYPES = new Set(["headline", "body", "cta", "handleLabel", "wordmark"]);

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
        <p className="mb-2 text-caption font-semibold text-muted">Elementos</p>
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
      </Card>

      {/* Prévia */}
      <div className="flex flex-col items-center gap-2">
        <div className="relative aspect-[4/5] w-full max-w-sm overflow-hidden rounded-card bg-black">
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

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <label className="block text-caption text-muted">Peso</label>
                    <input
                      type="number"
                      min={100}
                      max={900}
                      step={100}
                      value={selected.style?.weight ?? 400}
                      onChange={(e) => updateSelectedStyle({ weight: Number(e.target.value) })}
                      className={fieldClasses}
                    />
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
