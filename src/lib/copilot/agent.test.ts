import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const nvidiaChatJsonMock = vi.fn();
vi.mock("@/lib/ai/nvidia", () => ({
  nvidiaChatJson: (...args: unknown[]) => nvidiaChatJsonMock(...args),
}));

const buscarReferenciasMock = vi.fn();
const gerarBriefMock = vi.fn();
const gerarPostUnicoMock = vi.fn();
const gerarCarrosselMock = vi.fn();
vi.mock("@/lib/copilot/tools", () => ({
  buscarReferencias: (...args: unknown[]) => buscarReferenciasMock(...args),
  gerarBrief: (...args: unknown[]) => gerarBriefMock(...args),
  gerarPostUnico: (...args: unknown[]) => gerarPostUnicoMock(...args),
  gerarCarrossel: (...args: unknown[]) => gerarCarrosselMock(...args),
}));

const CTX = { userId: "u1", clientId: "c1" };
const envOriginal = { ...process.env };

async function coletar(gen: AsyncGenerator<unknown>): Promise<unknown[]> {
  const eventos: unknown[] = [];
  for await (const e of gen) eventos.push(e);
  return eventos;
}

describe("rodarTurno", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // proximaAcao cai no mock (sem rede) quando NVIDIA_API_KEY está
    // ausente — estes testes exercitam o CAMINHO REAL (nvidiaChatJson
    // mockado acima), não o mock determinístico. O mock em si tem sua
    // própria suíte (describe mais abaixo).
    process.env.NVIDIA_API_KEY = "test-key";
  });

  afterEach(() => {
    process.env = { ...envOriginal };
  });

  it("responde direto quando o modelo já devolve 'responder'", async () => {
    nvidiaChatJsonMock.mockResolvedValueOnce(
      JSON.stringify({ acao: "responder", input: { texto: "Oi! Como posso ajudar?" } })
    );
    const { rodarTurno } = await import("@/lib/copilot/agent");
    const eventos = await coletar(rodarTurno("oi", "", CTX));
    expect(eventos).toEqual([{ tipo: "mensagem", texto: "Oi! Como posso ajudar?" }]);
  });

  it("encadeia buscar_referencias → gerar_brief → responder", async () => {
    nvidiaChatJsonMock
      .mockResolvedValueOnce(JSON.stringify({ acao: "buscar_referencias", input: {} }))
      .mockResolvedValueOnce(
        JSON.stringify({ acao: "gerar_brief", input: { referencias: [{ title: "X" }] } })
      )
      .mockResolvedValueOnce(
        JSON.stringify({ acao: "responder", input: { texto: "Aqui está o brief." } })
      );
    buscarReferenciasMock.mockResolvedValueOnce({ referencias: [{ title: "X" }], vazio: false });
    gerarBriefMock.mockResolvedValueOnce({ padrao: "p", porQueFunciona: "q", ganchos: ["g"], angulo: "a" });

    const { rodarTurno } = await import("@/lib/copilot/agent");
    const eventos = await coletar(rodarTurno("me dá uma ideia", "", CTX));

    expect(buscarReferenciasMock).toHaveBeenCalledTimes(1);
    expect(gerarBriefMock).toHaveBeenCalledTimes(1);
    expect(eventos.at(-1)).toEqual({ tipo: "mensagem", texto: "Aqui está o brief." });
    // passo de início + fim pra cada ferramenta chamada
    expect(eventos.filter((e) => (e as { tipo: string }).tipo === "passo")).toHaveLength(4);
  });

  it("resposta fora do contrato JSON tenta 1 retry, depois degrada", async () => {
    nvidiaChatJsonMock
      .mockResolvedValueOnce("não sou json")
      .mockResolvedValueOnce("ainda não sou json");
    const { rodarTurno } = await import("@/lib/copilot/agent");
    const eventos = await coletar(rodarTurno("oi", "", CTX));
    expect(nvidiaChatJsonMock).toHaveBeenCalledTimes(2);
    expect(eventos).toEqual([
      { tipo: "mensagem", texto: "Não consegui entender o pedido agora. Pode reformular?" },
    ]);
  });

  it("retry se recupera quando a segunda resposta vem certa", async () => {
    nvidiaChatJsonMock
      .mockResolvedValueOnce("texto quebrado")
      .mockResolvedValueOnce(JSON.stringify({ acao: "responder", input: { texto: "recuperei" } }));
    const { rodarTurno } = await import("@/lib/copilot/agent");
    const eventos = await coletar(rodarTurno("oi", "", CTX));
    expect(eventos).toEqual([{ tipo: "mensagem", texto: "recuperei" }]);
  });

  it("ferramenta que lança não derruba o turno — segue e registra o erro", async () => {
    nvidiaChatJsonMock
      .mockResolvedValueOnce(JSON.stringify({ acao: "buscar_referencias", input: {} }))
      .mockResolvedValueOnce(
        JSON.stringify({ acao: "responder", input: { texto: "não achei nada" } })
      );
    buscarReferenciasMock.mockRejectedValueOnce(new Error("banco fora do ar"));

    const { rodarTurno } = await import("@/lib/copilot/agent");
    const eventos = await coletar(rodarTurno("busca aí", "", CTX));
    expect(eventos).toContainEqual({
      tipo: "passo",
      ferramenta: "buscar_referencias",
      status: "erro",
      rotulo: "Buscando referências no Radar…",
    });
    expect(eventos.at(-1)).toEqual({ tipo: "mensagem", texto: "não achei nada" });
  });

  it("estoura o teto de passos sem chegar em 'responder' → mensagem final segura", async () => {
    nvidiaChatJsonMock.mockResolvedValue(
      JSON.stringify({ acao: "buscar_referencias", input: {} })
    );
    buscarReferenciasMock.mockResolvedValue({ referencias: [], vazio: true });

    const { rodarTurno } = await import("@/lib/copilot/agent");
    const eventos = await coletar(rodarTurno("insiste", "", CTX));
    expect(eventos.at(-1)).toMatchObject({ tipo: "mensagem" });
    // 4 passos (MAX_PASSOS), cada um com início+fim = 8 eventos de passo + 1 mensagem final
    expect(eventos.filter((e) => (e as { tipo: string }).tipo === "passo")).toHaveLength(8);
  });
});

describe("rodarTurno — mock sem NVIDIA_API_KEY (mesmo espírito de mockBrief/mockGenerate)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NVIDIA_API_KEY;
  });

  afterEach(() => {
    process.env = { ...envOriginal };
  });

  it("pedido sem menção a post/carrossel responde direto, sem chamar nenhuma ferramenta", async () => {
    const { rodarTurno } = await import("@/lib/copilot/agent");
    const eventos = await coletar(rodarTurno("oi", "", CTX));
    expect(nvidiaChatJsonMock).not.toHaveBeenCalled();
    expect(buscarReferenciasMock).not.toHaveBeenCalled();
    expect(eventos).toHaveLength(1);
    expect((eventos[0] as { tipo: string }).tipo).toBe("mensagem");
  });

  it("pedido de post encadeia buscar_referencias → gerar_brief → gerar_post_unico, sem rede", async () => {
    buscarReferenciasMock.mockResolvedValueOnce({
      referencias: [{ title: "X", platform: "hackernews", points: 1, comments: 1, score: 1 }],
      vazio: false,
    });
    gerarBriefMock.mockResolvedValueOnce({
      padrao: "p",
      porQueFunciona: "q",
      ganchos: ["g"],
      angulo: "ângulo mock",
    });
    gerarPostUnicoMock.mockResolvedValueOnce({
      newsItemId: "n1",
      mensagem: "Post entrou na fila.",
    });

    const { rodarTurno } = await import("@/lib/copilot/agent");
    await coletar(rodarTurno("faz um post sobre IA", "", CTX));

    expect(nvidiaChatJsonMock).not.toHaveBeenCalled();
    expect(buscarReferenciasMock).toHaveBeenCalledTimes(1);
    expect(gerarBriefMock).toHaveBeenCalledTimes(1);
    expect(gerarPostUnicoMock).toHaveBeenCalledTimes(1);
    expect(gerarCarrosselMock).not.toHaveBeenCalled();
  });

  it("pedido de carrossel usa gerar_carrossel, não gerar_post_unico", async () => {
    buscarReferenciasMock.mockResolvedValueOnce({
      referencias: [{ title: "X", platform: "hackernews", points: 1, comments: 1, score: 1 }],
      vazio: false,
    });
    gerarBriefMock.mockResolvedValueOnce({
      padrao: "p",
      porQueFunciona: "q",
      ganchos: ["g"],
      angulo: "ângulo mock",
    });
    gerarCarrosselMock.mockResolvedValueOnce({ newsItemId: "n1", mensagem: "Carrossel na fila." });

    const { rodarTurno } = await import("@/lib/copilot/agent");
    await coletar(rodarTurno("faz um carrossel sobre IA", "", CTX));

    expect(gerarCarrosselMock).toHaveBeenCalledTimes(1);
    expect(gerarPostUnicoMock).not.toHaveBeenCalled();
  });
});
