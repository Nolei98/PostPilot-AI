// ============================================================
// Integração RLS (pglite, migrations reais): prova o isolamento
// multi-tenant — usuário A nunca lê/escreve dados de B — e que o
// trigger de signup cria o tenant (client + brand_kit + fontes).
// ============================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { bootTestDb, signup, asUser, type Db } from "@/test/pg";

let db: Db;

beforeAll(async () => {
  db = await bootTestDb();
}, 60_000);

afterAll(async () => {
  await db?.close();
});

/** id do client de um usuário (consulta admin, ignora RLS). */
async function clientOf(uid: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "select id from clients where owner_user_id = $1",
    [uid]
  );
  return rows[0].id;
}

describe("signup trigger (handle_new_user)", () => {
  it("cria 1 client + 1 brand_kit + notification_configs ativo + fontes do nicho", async () => {
    const uid = await signup(db, { email: "signup@x.com", niche: "marketing", brandName: "Marca X" });

    const clients = await db.query("select * from clients where owner_user_id = $1", [uid]);
    expect(clients.rows).toHaveLength(1);

    const clientId = (clients.rows[0] as { id: string }).id;
    const bk = await db.query("select * from brand_kits where client_id = $1", [clientId]);
    expect(bk.rows).toHaveLength(1);
    expect((bk.rows[0] as { brand_name: string }).brand_name).toBe("Marca X");
    expect((bk.rows[0] as { niche: string }).niche).toBe("marketing");

    const nc = await db.query<{ active_client_id: string }>(
      "select active_client_id from notification_configs where user_id = $1",
      [uid]
    );
    expect(nc.rows[0].active_client_id).toBe(clientId);

    // nicho marketing semeia 3 fontes curadas, já vinculadas ao client
    const src = await db.query("select * from source_configs where client_id = $1", [clientId]);
    expect(src.rows).toHaveLength(3);
  });
});

describe("cleanup 024: notification_configs enxuto", () => {
  it("não tem mais colunas de marca; mantém telegram + active_client_id", async () => {
    const { rows } = await db.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_name = 'notification_configs'"
    );
    const cols = rows.map((r) => r.column_name);
    // migradas para brand_kits → devem ter sumido
    for (const gone of [
      "niche",
      "brand_name",
      "ig_handle",
      "color_accent",
      "post_font_family",
      "text_provider",
      "template_apply_mode",
    ]) {
      expect(cols).not.toContain(gone);
    }
    // per-usuário → devem permanecer
    for (const kept of ["telegram_chat_id", "notify_on_candidate", "active_client_id"]) {
      expect(cols).toContain(kept);
    }
  });
});

describe("migration 038: renovação de token + erro de métricas", () => {
  it("social_connections tem o rastro da renovação (last_refreshed_at/last_error)", async () => {
    const { rows } = await db.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_name = 'social_connections'"
    );
    const cols = rows.map((r) => r.column_name);
    for (const kept of ["token_expires_at", "connected_at", "last_refreshed_at", "last_error"]) {
      expect(cols).toContain(kept);
    }
  });

  it("migration 041: rerender_status morreu junto com o resync de layout", async () => {
    // O sinal de "aplicando layout" (039) existia pro re-render em massa
    // dos posts da fila. Com o preview ao vivo (040) não há o que
    // re-renderizar na fila — nem job, nem espera, nem coluna.
    const { rows } = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_name = 'posts' and column_name = 'rerender_status'`
    );
    expect(rows).toHaveLength(0);
  });

  it("migration 040: posts nasce com render_status 'none' e só aceita os 5 estados", async () => {
    const { rows } = await db.query<{ column_name: string; column_default: string }>(
      `select column_name, column_default from information_schema.columns
       where table_name = 'posts' and column_name = 'render_status'`
    );
    expect(rows).toHaveLength(1);
    // Post recém-gerado NÃO tem arte: ela só nasce na aprovação.
    expect(rows[0].column_default).toContain("none");

    await expect(
      db.query(
        `insert into posts (user_id, client_id, news_item_id, hook, caption, hashtags, image_prompt, render_status)
         values (gen_random_uuid(), gen_random_uuid(), null, 'h', 'c', '#a', 'p', 'montando')`
      )
    ).rejects.toThrow();
  });

  it("migration 040: colunas do snapshot congelado e da base existem", async () => {
    const { rows } = await db.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_name = 'posts'"
    );
    const cols = rows.map((r) => r.column_name);
    for (const c of [
      "render_error",
      "render_spec",
      "render_token",
      "base_image_url",
      "base_luminance",
      "video_shape",
    ]) {
      expect(cols).toContain(c);
    }

    // Cada card tem o próprio fundo, logo a própria luminância — preview e
    // render final decidem contraste pelo MESMO número.
    const { rows: cardCols } = await db.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_name = 'carousel_cards'"
    );
    expect(cardCols.map((r) => r.column_name)).toContain("bg_luminance");
  });

  it("migration 040: video_shape só aceita os quadros que o render conhece", async () => {
    await expect(
      db.query(
        `insert into posts (user_id, client_id, news_item_id, hook, caption, hashtags, image_prompt, video_shape)
         values (gen_random_uuid(), gen_random_uuid(), null, 'h', 'c', '#a', 'p', 'quadrado')`
      )
    ).rejects.toThrow();
  });

  it("migration 045: todo post nasce com um código curto e único", async () => {
    // posts exige news_item_id (NOT NULL + FK), então monta a cadeia real:
    // usuário → client → fonte → notícia.
    const uid = await signup(db, { email: "ref@x.com" });
    const clientId = await clientOf(uid);
    const { rows: src } = await db.query<{ id: string }>(
      "select id from source_configs where client_id = $1 limit 1",
      [clientId]
    );
    const novaNoticia = async (slug: string) => {
      const { rows } = await db.query<{ id: string }>(
        `insert into news_items (source_id, client_id, url, title, summary, published_at)
         values ($1, $2, $3, 'T', 'S', now()) returning id`,
        [src[0].id, clientId, `https://x.test/${slug}`]
      );
      return rows[0].id;
    };
    const novoPost = async (newsId: string) =>
      db.query<{ ref: string }>(
        `insert into posts (user_id, client_id, news_item_id, hook, caption, hashtags, image_prompt)
         values ($1, $2, $3, 'h', 'c', '#a', 'p') returning ref`,
        [uid, clientId, newsId]
      );

    const a = await novoPost(await novaNoticia("a"));
    const b = await novoPost(await novaNoticia("b"));
    expect(Number(a.rows[0].ref)).toBeGreaterThan(0);
    // sequência: o segundo post nunca repete o código do primeiro
    expect(Number(b.rows[0].ref)).toBeGreaterThan(Number(a.rows[0].ref));

    // gravar um código já usado à mão tem que falhar — é identificação
    const noticiaC = await novaNoticia("c");
    await expect(
      db.query(
        `insert into posts (user_id, client_id, news_item_id, hook, caption, hashtags, image_prompt, ref)
         values ($1, $2, $3, 'h', 'c', '#a', 'p', $4)`,
        [uid, clientId, noticiaC, a.rows[0].ref]
      )
    ).rejects.toThrow();
  });

  it("migration 044: convert_status só aceita idle/pending", async () => {
    await expect(
      db.query(
        `insert into posts (user_id, client_id, news_item_id, hook, caption, hashtags, image_prompt, convert_status)
         values (gen_random_uuid(), gen_random_uuid(), null, 'h', 'c', '#a', 'p', 'convertendo')`
      )
    ).rejects.toThrow();
  });

  it("posts tem metrics_error (falha de coleta deixa de ser invisível)", async () => {
    const { rows } = await db.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_name = 'posts'"
    );
    const cols = rows.map((r) => r.column_name);
    expect(cols).toContain("metrics_error");
    expect(cols).toContain("publish_error");
  });
});

describe("RLS: isolamento entre tenants", () => {
  it("clients: cada usuário só enxerga os próprios", async () => {
    const a = await signup(db, { email: "a-cli@x.com" });
    const b = await signup(db, { email: "b-cli@x.com" });

    const seenByA = await asUser(db, a, () => db.query("select owner_user_id from clients"));
    expect(seenByA.rows).toHaveLength(1);
    expect((seenByA.rows[0] as { owner_user_id: string }).owner_user_id).toBe(a);

    const seenByB = await asUser(db, b, () => db.query("select owner_user_id from clients"));
    expect(seenByB.rows).toHaveLength(1);
    expect((seenByB.rows[0] as { owner_user_id: string }).owner_user_id).toBe(b);
  });

  it("brand_kits: A não vê o brand_kit do client de B", async () => {
    const a = await signup(db, { email: "a-bk@x.com" });
    const b = await signup(db, { email: "b-bk@x.com" });
    const bClient = await clientOf(b);

    const rows = await asUser(db, a, () =>
      db.query("select * from brand_kits where client_id = $1", [bClient])
    );
    expect(rows.rows).toHaveLength(0);
  });

  it("source_configs: A não vê as fontes de B", async () => {
    const a = await signup(db, { email: "a-src@x.com" });
    const b = await signup(db, { email: "b-src@x.com" });

    const aSees = await asUser(db, a, () =>
      db.query<{ user_id: string }>("select distinct user_id from source_configs")
    );
    expect(aSees.rows.every((r) => r.user_id === a)).toBe(true);
    expect(aSees.rows.some((r) => r.user_id === b)).toBe(false);
  });

  it("posts: A vê o próprio post, B não", async () => {
    const a = await signup(db, { email: "a-post@x.com" });
    const b = await signup(db, { email: "b-post@x.com" });
    const aClient = await clientOf(a);

    // Backend (service role → ignora RLS): monta a cadeia source→news→post de A.
    const { rows: srcRows } = await db.query<{ id: string }>(
      "select id from source_configs where client_id = $1 limit 1",
      [aClient]
    );
    const sourceId = srcRows[0].id;
    const { rows: newsRows } = await db.query<{ id: string }>(
      `insert into news_items (source_id, client_id, url, title, status)
       values ($1, $2, 'https://ex.com/n1', 'Notícia A', 'candidate') returning id`,
      [sourceId, aClient]
    );
    await db.query(
      `insert into posts (news_item_id, user_id, client_id, hook, caption, hashtags, image_prompt, status)
       values ($1, $2, $3, 'hook', 'cap', '#a', 'prompt', 'pending_approval')`,
      [newsRows[0].id, a, aClient]
    );

    const aSees = await asUser(db, a, () => db.query("select id from posts"));
    expect(aSees.rows).toHaveLength(1);

    const bSees = await asUser(db, b, () => db.query("select id from posts"));
    expect(bSees.rows).toHaveLength(0);
  });
});

describe("RLS templates (028): sistema público, custom por dono", () => {
  const SPEC = `'{"surface":"cover_image","canvas":{"w":1080,"h":1350},"elements":[]}'::jsonb`;

  it("preset do sistema é legível por qualquer usuário; custom só do dono", async () => {
    const a = await signup(db, { email: "a-tpl@x.com" });
    const b = await signup(db, { email: "b-tpl@x.com" });
    const ca = await clientOf(a);

    // preset do sistema (admin/service role): client_id null, is_system true
    await db.query(
      `insert into templates (client_id, surface, name, spec, is_system) values (null, 'cover_image', 'Prisma', ${SPEC}, true)`
    );
    // template custom do A
    await db.query(
      `insert into templates (client_id, surface, name, spec) values ($1, 'cover_image', 'Meu', ${SPEC})`,
      [ca]
    );

    // B enxerga o preset do sistema, mas NÃO o custom de A
    const seenByB = await asUser(db, b, () =>
      db.query<{ name: string }>("select name from templates order by name")
    );
    const names = seenByB.rows.map((r) => r.name);
    expect(names).toContain("Prisma");
    expect(names).not.toContain("Meu");
  });

  it("usuário não consegue criar um preset do sistema (client_id null)", async () => {
    const a = await signup(db, { email: "a-tpl2@x.com" });
    await expect(
      asUser(db, a, () =>
        db.query(
          `insert into templates (client_id, surface, name, spec, is_system) values (null, 'cover_image', 'Hack', ${SPEC}, true)`
        )
      )
    ).rejects.toThrow();
  });
});

describe("RLS: escrita cruzada bloqueada (with check)", () => {
  it("A não consegue criar client para o usuário B", async () => {
    const a = await signup(db, { email: "a-w1@x.com" });
    const b = await signup(db, { email: "b-w1@x.com" });

    await expect(
      asUser(db, a, () =>
        db.query("insert into clients (owner_user_id, name) values ($1, 'hack')", [b])
      )
    ).rejects.toThrow();
  });

  it("A não consegue criar brand_kit no client de B", async () => {
    const a = await signup(db, { email: "a-w2@x.com" });
    const b = await signup(db, { email: "b-w2@x.com" });
    const bClient = await clientOf(b);

    await expect(
      asUser(db, a, () =>
        db.query("insert into brand_kits (client_id, brand_name) values ($1, 'hack')", [bClient])
      )
    ).rejects.toThrow();
  });

  it("social_connections: A não vê nem escreve na conexão IG de B (033)", async () => {
    const a = await signup(db, { email: "a-sc@x.com" });
    const b = await signup(db, { email: "b-sc@x.com" });
    const bClient = await clientOf(b);

    await db.query(
      "insert into social_connections (client_id, access_token, ig_username) values ($1, 'token-b', 'b.ig')",
      [bClient]
    );

    const seenByA = await asUser(db, a, () =>
      db.query("select * from social_connections where client_id = $1", [bClient])
    );
    expect(seenByA.rows).toHaveLength(0);

    const updateResult = await asUser(db, a, () =>
      db.query(
        "update social_connections set status = 'disconnected' where client_id = $1",
        [bClient]
      )
    );
    // RLS filtra a linha antes do WITH CHECK rodar — não dá erro, só não afeta nenhuma linha.
    expect(updateResult.affectedRows ?? 0).toBe(0);
  });

  it("post_metrics: A não vê métricas de posts de B (034)", async () => {
    const a = await signup(db, { email: "a-pm@x.com" });
    const b = await signup(db, { email: "b-pm@x.com" });
    const bClient = await clientOf(b);

    const { rows: srcRows } = await db.query<{ id: string }>(
      "select id from source_configs where client_id = $1 limit 1",
      [bClient]
    );
    const news = await db.query<{ id: string }>(
      `insert into news_items (source_id, client_id, url, title, status)
       values ($1, $2, 'https://ex.com/pm1', 'Notícia B', 'candidate') returning id`,
      [srcRows[0].id, bClient]
    );
    const post = await db.query<{ id: string }>(
      "insert into posts (news_item_id, user_id, client_id, hook, caption, hashtags, image_prompt) " +
        "values ($1, $2, $3, 'h', 'c', '#h', 'p') returning id",
      [news.rows[0].id, b, bClient]
    );
    await db.query(
      "insert into post_metrics (post_id, metric_window, reach) values ($1, '24h', 500)",
      [post.rows[0].id]
    );

    const seenByA = await asUser(db, a, () =>
      db.query("select * from post_metrics where post_id = $1", [post.rows[0].id])
    );
    expect(seenByA.rows).toHaveLength(0);
  });
});
