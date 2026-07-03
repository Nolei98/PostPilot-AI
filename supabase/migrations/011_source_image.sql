-- ============================================================
-- Migration 011: imagem original da matéria (opcional).
-- Capturada no scan (RSS enclosure/media:content) e usada como
-- base da arte do post quando disponível (em vez de Flux/mock).
-- image_license_hint é HEURÍSTICA, não confirmação jurídica —
-- ver src/lib/image-license.ts. 'likely_free' = domínio conhecido
-- de banco de imagem livre; 'verify' = padrão (assumir direitos
-- reservados do veículo até o usuário confirmar).
-- Rodar no SQL Editor do Supabase.
-- ============================================================

alter table news_items
  add column if not exists image_url text,
  add column if not exists image_license_hint text
    check (image_license_hint in ('likely_free', 'verify'));
