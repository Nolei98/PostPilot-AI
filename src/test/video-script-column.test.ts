// ============================================================
// Integração (pglite): migration 049 — o roteiro e a ORIGEM do vídeo.
// Verifica o que o job de geração assume: que dá pra guardar o roteiro,
// que todo post nasce como 'upload' (backfill dos que já existiam) e que
// origem inválida não entra.
// ============================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { bootTestDb, signup, type Db } from "@/test/pg";

let db: Db;
let userId: string;
let clientId: string;
let newsItemId: string;

beforeAll(async () => {
  db = await bootTestDb();
  userId = await signup(db, { email: "video@teste.com", niche: "tecnologia" });
  const { rows: cli } = await db.query<{ id: string }>(
    "select id from clients where owner_user_id = $1",
    [userId]
  );
  clientId = cli[0].id;
  const { rows: src } = await db.query<{ id: string }>(
    "select id from source_configs where client_id = $1 limit 1",
    [clientId]
  );
  const { rows: news } = await db.query<{ id: string }>(
    `insert into news_items (source_id, client_id, url, title, status)
     values ($1, $2, 'https://ex.com/v1', 'Notícia de vídeo', 'candidate') returning id`,
    [src[0].id, clientId]
  );
  newsItemId = news[0].id;
}, 60_000);

afterAll(async () => {
  await db?.close();
});

async function novoPost(url: string): Promise<string> {
  const { rows: src } = await db.query<{ id: string }>(
    "select id from source_configs where client_id = $1 limit 1",
    [clientId]
  );
  const { rows: n } = await db.query<{ id: string }>(
    `insert into news_items (source_id, client_id, url, title, status)
     values ($1, $2, $3, 'Outra', 'candidate') returning id`,
    [src[0].id, clientId, url]
  );
  const { rows } = await db.query<{ id: string }>(
    `insert into posts (news_item_id, user_id, client_id, hook, caption, hashtags, image_prompt, status)
     values ($1, $2, $3, 'hook', 'cap', '#a', 'p', 'pending_approval') returning id`,
    [n[0].id, userId, clientId]
  );
  return rows[0].id;
}

describe("migration 049 — video_script + video_origin", () => {
  it("post nasce como 'upload': é o que todo vídeo existente é", async () => {
    const { rows } = await db.query<{ video_origin: string; video_script: unknown }>(
      `insert into posts (news_item_id, user_id, client_id, hook, caption, hashtags, image_prompt, status)
       values ($1, $2, $3, 'hook', 'cap', '#a', 'p', 'pending_approval')
       returning video_origin, video_script`,
      [newsItemId, userId, clientId]
    );
    expect(rows[0].video_origin).toBe("upload");
    expect(rows[0].video_script).toBeNull();
  });

  it("guarda o roteiro inteiro e devolve os beats na ordem", async () => {
    const postId = await novoPost("https://ex.com/v2");
    const script = {
      hook: "Isso muda tudo",
      beats: [
        { idx: 0, text: "primeiro ponto", seconds: 4 },
        { idx: 1, text: "segundo ponto", seconds: 5 },
      ],
      cta: "segue pra mais",
      caption: "legenda",
      hashtags: "#ia",
      totalSeconds: 12,
    };
    await db.query("update posts set video_script = $1, video_origin = 'generated' where id = $2", [
      JSON.stringify(script),
      postId,
    ]);
    const { rows } = await db.query<{ video_script: typeof script; video_origin: string }>(
      "select video_script, video_origin from posts where id = $1",
      [postId]
    );
    expect(rows[0].video_origin).toBe("generated");
    expect(rows[0].video_script.beats.map((b) => b.text)).toEqual([
      "primeiro ponto",
      "segundo ponto",
    ]);
    expect(rows[0].video_script.totalSeconds).toBe(12);
  });

  it("origem fora de upload|generated é rejeitada — a coluna existe pra distinguir os dois", async () => {
    const postId = await novoPost("https://ex.com/v3");
    await expect(
      db.query("update posts set video_origin = 'sei-la' where id = $1", [postId])
    ).rejects.toThrow();
  });
});
