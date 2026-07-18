// ============================================================
// Integração (pglite): garante as uniques multi-tenant da migration
// 022 — idempotência de post por (cliente × notícia) e dedup de fonte
// por cliente (não mais por usuário).
// ============================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { bootTestDb, signup, type Db } from "@/test/pg";

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

// Cria uma notícia (item de fonte) para um cliente e devolve seu id.
async function makeNews(clientId: string, url: string): Promise<string> {
  const { rows: src } = await db.query<{ id: string }>(
    "select id from source_configs where client_id = $1 limit 1",
    [clientId]
  );
  const { rows } = await db.query<{ id: string }>(
    `insert into news_items (source_id, client_id, url, title, status)
     values ($1, $2, $3, 'Notícia', 'candidate') returning id`,
    [src[0].id, clientId, url]
  );
  return rows[0].id;
}

async function insertPost(clientId: string, userId: string, newsItemId: string) {
  return db.query(
    `insert into posts (news_item_id, user_id, client_id, hook, caption, hashtags, image_prompt, status)
     values ($1, $2, $3, 'hook', 'cap', '#a', 'prompt', 'pending_approval')`,
    [newsItemId, userId, clientId]
  );
}

describe("idempotência de posts (unique client_id, news_item_id)", () => {
  it("não cria dois posts para a mesma (cliente × notícia)", async () => {
    const uid = await signup(db, { email: "idem@x.com" });
    const clientId = await clientOf(uid);
    const newsId = await makeNews(clientId, "https://ex.com/idem-1");

    await insertPost(clientId, uid, newsId); // 1º ok
    await expect(insertPost(clientId, uid, newsId)).rejects.toThrow(); // 2º viola unique
  });
});

describe("dedup de fonte por cliente (unique client_id, feed_url)", () => {
  it("o MESMO usuário pode ter o mesmo feed em dois clientes diferentes", async () => {
    const uid = await signup(db, { email: "feed@x.com" });
    const client1 = await clientOf(uid);

    // segundo cliente do mesmo dono (via admin, como o app faria)
    const { rows: c2 } = await db.query<{ id: string }>(
      "insert into clients (owner_user_id, name) values ($1, 'Marca 2') returning id",
      [uid]
    );
    const client2 = c2[0].id;
    await db.query("insert into brand_kits (client_id) values ($1)", [client2]);

    const feed = "https://mesmo-feed.com/rss";
    await db.query(
      "insert into source_configs (user_id, client_id, name, feed_url) values ($1,$2,'F1',$3)",
      [uid, client1, feed]
    );
    // Sob a unique antiga (user_id, feed_url) isto violaria; com a nova
    // (client_id, feed_url) é permitido.
    await expect(
      db.query(
        "insert into source_configs (user_id, client_id, name, feed_url) values ($1,$2,'F2',$3)",
        [uid, client2, feed]
      )
    ).resolves.toBeTruthy();
  });

  it("bloqueia o mesmo feed duplicado DENTRO do mesmo cliente", async () => {
    const uid = await signup(db, { email: "dup@x.com" });
    const clientId = await clientOf(uid);
    const feed = "https://dup-feed.com/rss";

    await db.query(
      "insert into source_configs (user_id, client_id, name, feed_url) values ($1,$2,'A',$3)",
      [uid, clientId, feed]
    );
    await expect(
      db.query(
        "insert into source_configs (user_id, client_id, name, feed_url) values ($1,$2,'B',$3)",
        [uid, clientId, feed]
      )
    ).rejects.toThrow();
  });
});

describe("mesmo artigo, clientes distintos → posts distintos", () => {
  it("dois clientes com o mesmo feed geram news_items e posts separados", async () => {
    const a = await signup(db, { email: "art-a@x.com" });
    const b = await signup(db, { email: "art-b@x.com" });
    const ca = await clientOf(a);
    const cb = await clientOf(b);

    const url = "https://news.com/mesmo-artigo";
    const newsA = await makeNews(ca, url); // news_item do cliente A
    const newsB = await makeNews(cb, url); // news_item do cliente B (source_id diferente)
    expect(newsA).not.toBe(newsB);

    // cada cliente gera seu próprio post para o mesmo artigo — sem conflito
    await expect(insertPost(ca, a, newsA)).resolves.toBeTruthy();
    await expect(insertPost(cb, b, newsB)).resolves.toBeTruthy();
  });
});
