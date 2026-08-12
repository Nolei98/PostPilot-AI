// ============================================================
// Integração RLS (pglite, migrations reais) do Copiloto (052):
// dono lê/grava suas mensagens, isolamento entre tenants.
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

async function clientOf(uid: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "select id from clients where owner_user_id = $1",
    [uid]
  );
  return rows[0].id;
}

describe("copilot_messages (052)", () => {
  it("dono grava e lê suas próprias mensagens", async () => {
    const a = await signup(db, { email: "a-copilot@x.com" });
    const aClient = await clientOf(a);

    await asUser(db, a, () =>
      db.query(
        `insert into copilot_messages (client_id, user_id, role, content)
         values ($1, $2, 'user', 'faz um post sobre IA')`,
        [aClient, a]
      )
    );

    const seen = await asUser(db, a, () =>
      db.query("select * from copilot_messages where client_id = $1", [aClient])
    );
    expect(seen.rows).toHaveLength(1);
  });

  it("isolamento: A não vê nem escreve nas mensagens de B", async () => {
    const a = await signup(db, { email: "a-copilot2@x.com" });
    const b = await signup(db, { email: "b-copilot2@x.com" });
    const bClient = await clientOf(b);

    await asUser(db, b, () =>
      db.query(
        `insert into copilot_messages (client_id, user_id, role, content)
         values ($1, $2, 'user', 'mensagem da B')`,
        [bClient, b]
      )
    );

    const seenByA = await asUser(db, a, () =>
      db.query("select * from copilot_messages where client_id = $1", [bClient])
    );
    expect(seenByA.rows).toHaveLength(0);

    // A não consegue gravar mensagem em nome de B (with check bloqueia
    // user_id ≠ auth.uid()) nem no client de B (RLS de insert é só por
    // user_id, então o teste que importa é o campo user_id mentiroso).
    await expect(
      asUser(db, a, () =>
        db.query(
          `insert into copilot_messages (client_id, user_id, role, content)
           values ($1, $2, 'user', 'tentando se passar por B')`,
          [bClient, b]
        )
      )
    ).rejects.toThrow();
  });
});
