// ============================================================
// Integração (pglite): schema do Carousel Engine (migration 025) —
// posts.format, carousel_cards, cascade e unique(post_id, idx).
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

async function makePost(email: string, format?: string): Promise<{ postId: string }> {
  const uid = await signup(db, { email });
  const { rows: c } = await db.query<{ id: string }>(
    "select id from clients where owner_user_id = $1",
    [uid]
  );
  const clientId = c[0].id;
  const { rows: src } = await db.query<{ id: string }>(
    "select id from source_configs where client_id = $1 limit 1",
    [clientId]
  );
  const { rows: news } = await db.query<{ id: string }>(
    `insert into news_items (source_id, client_id, url, title, status)
     values ($1,$2,$3,'t','candidate') returning id`,
    [src[0].id, clientId, `https://ex.com/${email}`]
  );
  const cols = format ? ", format" : "";
  const vals = format ? ", $5" : "";
  const params: (string | undefined)[] = [news[0].id, uid, clientId, "cap"];
  if (format) params.push(format);
  const { rows } = await db.query<{ id: string }>(
    `insert into posts (news_item_id, user_id, client_id, hook, caption, hashtags, image_prompt, status${cols})
     values ($1,$2,$3,'h',$4,'#a','p','draft'${vals}) returning id`,
    params
  );
  return { postId: rows[0].id };
}

async function insertCard(postId: string, idx: number, role = "value") {
  return db.query(
    `insert into carousel_cards (post_id, idx, role, headline, body)
     values ($1,$2,$3,'h','b')`,
    [postId, idx, role]
  );
}

describe("brand_kits identidade de rótulo (027)", () => {
  it("defaults no signup: brand_mark='auto', template_defaults={} e check do brand_mark", async () => {
    const uid = await signup(db, { email: "label027@x.com" });
    const { rows } = await db.query<{ id: string; brand_mark: string; template_defaults: unknown }>(
      "select bk.id, bk.brand_mark, bk.template_defaults from brand_kits bk join clients cl on cl.id = bk.client_id where cl.owner_user_id = $1",
      [uid]
    );
    expect(rows[0].brand_mark).toBe("auto");
    expect(rows[0].template_defaults).toEqual({});

    await db.query("update brand_kits set brand_mark = 'wordmark' where id = $1", [rows[0].id]);
    await expect(
      db.query("update brand_kits set brand_mark = 'sticker' where id = $1", [rows[0].id])
    ).rejects.toThrow();
  });
});

describe("brand_kits.default_format (026)", () => {
  it("default é 'single' no signup e aceita 'carousel'; rejeita inválido", async () => {
    const uid = await signup(db, { email: "deffmt@x.com" });
    const { rows: c } = await db.query<{ id: string; default_format: string }>(
      "select bk.id, bk.default_format from brand_kits bk join clients cl on cl.id = bk.client_id where cl.owner_user_id = $1",
      [uid]
    );
    expect(c[0].default_format).toBe("single");

    await db.query("update brand_kits set default_format = 'carousel' where id = $1", [c[0].id]);
    await expect(
      db.query("update brand_kits set default_format = 'gif' where id = $1", [c[0].id])
    ).rejects.toThrow();
  });
});

describe("posts.format", () => {
  it("default é 'single'", async () => {
    const { postId } = await makePost("fmt-default@x.com");
    const { rows } = await db.query<{ format: string }>(
      "select format from posts where id = $1",
      [postId]
    );
    expect(rows[0].format).toBe("single");
  });

  it("aceita 'carousel' e rejeita valor inválido", async () => {
    const { postId } = await makePost("fmt-carousel@x.com", "carousel");
    const { rows } = await db.query<{ format: string }>(
      "select format from posts where id = $1",
      [postId]
    );
    expect(rows[0].format).toBe("carousel");
    await expect(makePost("fmt-bad@x.com", "gif")).rejects.toThrow();
  });
});

describe("carousel_cards", () => {
  it("unique(post_id, idx): não deixa dois cards no mesmo índice", async () => {
    const { postId } = await makePost("cards-uniq@x.com", "carousel");
    await insertCard(postId, 0, "hook");
    await expect(insertCard(postId, 0, "value")).rejects.toThrow();
  });

  it("valida o role (check constraint)", async () => {
    const { postId } = await makePost("cards-role@x.com", "carousel");
    await expect(insertCard(postId, 1, "banner")).rejects.toThrow();
  });

  it("cascade: apagar o post apaga os cards", async () => {
    const { postId } = await makePost("cards-cascade@x.com", "carousel");
    await insertCard(postId, 0, "hook");
    await insertCard(postId, 1, "value");
    await db.query("delete from posts where id = $1", [postId]);
    const { rows } = await db.query("select id from carousel_cards where post_id = $1", [postId]);
    expect(rows).toHaveLength(0);
  });
});
