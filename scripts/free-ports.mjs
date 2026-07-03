// ============================================================
// Libera as portas do dev ANTES do Next subir (roda via "predev").
//
// Problema que isto resolve (Windows):
//   `npm run dev` cria uma árvore de processos aninhada
//   (npm → next → node start-server.js). Parar a task do topo nem
//   sempre mata o neto que realmente escuta a porta. O zumbi
//   continua segurando a 3000; o novo dev cai em 3001; o navegador
//   (ainda apontado pra 3000) fala com o zumbi — e quando o .next é
//   apagado, o zumbi passa a dar 404 em CSS/JS. É a "bugada do CSS".
//
// Aqui, antes de cada dev, matamos quem estiver escutando as portas
// alvo — só por porta (nunca por nome), então os MCP servers e
// outros processos node ficam intactos.
// ============================================================
import { execSync } from "node:child_process";

const PORTS = [3000, 8288]; // Next + Inngest dev

/** PIDs escutando (LISTENING) uma porta, por plataforma. */
function pidsOnPort(port) {
  const pids = new Set();
  try {
    if (process.platform === "win32") {
      // netstat: linhas "LISTENING" terminam com o PID
      const out = execSync(`netstat -ano -p tcp`, { encoding: "utf8" });
      for (const line of out.split(/\r?\n/)) {
        if (!line.includes("LISTENING")) continue;
        // ...  TCP  0.0.0.0:3000  0.0.0.0:0  LISTENING  12345
        const m = line.match(/:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/);
        if (m && Number(m[1]) === port) pids.add(m[2]);
      }
    } else {
      // lsof: 1 PID por linha
      const out = execSync(`lsof -ti tcp:${port} -s tcp:LISTEN`, {
        encoding: "utf8",
      });
      for (const pid of out.split(/\r?\n/)) if (pid.trim()) pids.add(pid.trim());
    }
  } catch {
    // netstat/lsof sem match → sai não-zero; porta livre, ignora
  }
  return [...pids];
}

function kill(pid) {
  try {
    if (process.platform === "win32") {
      execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore" });
    } else {
      process.kill(Number(pid), "SIGKILL");
    }
    return true;
  } catch {
    return false;
  }
}

let freed = 0;
for (const port of PORTS) {
  for (const pid of pidsOnPort(port)) {
    if (kill(pid)) {
      freed++;
      console.log(`[free-ports] porta ${port}: matou PID ${pid} (órfão)`);
    }
  }
}
if (freed === 0) console.log("[free-ports] portas já livres.");
