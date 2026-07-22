// ============================================================
// Integração (pglite + pgvector): valida a migration 023 — coluna
// caption_embedding e a RPC find_duplicate_caption (dedup intra-cliente
// por distância de cosseno).
// ============================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { bootTestDb, signup, type Db } from "@/test/pg";
import { mockEmbed, toPgVector, DUPLICATE_MAX_DISTANCE } from "@/lib/ai/embedding";

let db: Db;

beforeAll(async () => {
  db = await bootTestDb();
}, 60_000);

afterAll(async () => {
  await db?.close();
});

async function clientOf(uid: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "select id from clients where owner_user_id = $1",
    [uid]
  );
  return rows[0].id;
}

// Insere um post com legenda + embedding, devolve o id.
async function insertPostWithCaption(
  clientId: string,
  userId: string,
  url: string,
  caption: string
): Promise<string> {
  const { rows: src } = await db.query<{ id: string }>(
    "select id from source_configs where client_id = $1 limit 1",
    [clientId]
  );
  const { rows: news } = await db.query<{ id: string }>(
    `insert into news_items (source_id, client_id, url, title, status)
     values ($1,$2,$3,'t','candidate') returning id`,
    [src[0].id, clientId, url]
  );
  const { rows } = await db.query<{ id: string }>(
    `insert into posts (news_item_id, user_id, client_id, hook, caption, hashtags, image_prompt, caption_embedding, status)
     values ($1,$2,$3,'h',$4,'#a','p',$5,'pending_approval') returning id`,
    [news[0].id, userId, clientId, caption, toPgVector(mockEmbed(caption))]
  );
  return rows[0].id;
}

async function findDuplicate(clientId: string, caption: string): Promise<string | null> {
  const { rows } = await db.query<{ find_duplicate_caption: string | null }>(
    "select find_duplicate_caption($1, $2, $3) as find_duplicate_caption",
    [clientId, toPgVector(mockEmbed(caption)), DUPLICATE_MAX_DISTANCE]
  );
  return rows[0].find_duplicate_caption;
}

describe("find_duplicate_caption (pgvector, intra-cliente)", () => {
  it("acha o post com legenda idêntica", async () => {
    const uid = await signup(db, { email: "dup-vec@x.com" });
    const client = await clientOf(uid);
    const postId = await insertPostWithCaption(
      client,
      uid,
      "https://ex.com/v1",
      "OpenAI lançou um modelo que muda tudo na IA generativa"
    );

    const hit = await findDuplicate(
      client,
      "OpenAI lançou um modelo que muda tudo na IA generativa"
    );
    expect(hit).toBe(postId);
  });

  it("não acha nada para uma legenda bem diferente", async () => {
    const uid = await signup(db, { email: "nodup-vec@x.com" });
    const client = await clientOf(uid);
    await insertPostWithCaption(
      client,
      uid,
      "https://ex.com/v2",
      "Robôs chineses trabalham a noite inteira sem parar"
    );

    const hit = await findDuplicate(
      client,
      "Dez receitas veganas fáceis para o jantar de hoje"
    );
    expect(hit).toBeNull();
  });

  it("não cruza clientes: legenda igual em outro cliente não conta", async () => {
    const a = await signup(db, { email: "a-vec@x.com" });
    const b = await signup(db, { email: "b-vec@x.com" });
    const ca = await clientOf(a);
    const cb = await clientOf(b);
    const caption = "Notícia bombástica idêntica entre clientes distintos";

    await insertPostWithCaption(ca, a, "https://ex.com/va", caption);

    // cliente B procura a MESMA legenda → não deve achar o post de A
    expect(await findDuplicate(cb, caption)).toBeNull();
    // cliente A procura → acha o próprio
    expect(await findDuplicate(ca, caption)).not.toBeNull();
  });
});
