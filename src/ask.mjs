import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { search, WEAK_THRESHOLD } from "./search.mjs";
import { SYSTEM_MESSAGE, buildPrompt } from "./prompt.mjs";
import { pingOllama, chatStream } from "./ollama.mjs";

function parseArgs(args) {
  let k = 3;
  let showPrompt = false;
  let noRag = false;
  const questions = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--k" && i + 1 < args.length) {
      k = parseInt(args[i + 1], 10);
      i++;
    } else if (arg === "--show-prompt") {
      showPrompt = true;
    } else if (arg === "--no-rag") {
      noRag = true;
    } else {
      questions.push(arg);
    }
  }

  return { k, showPrompt, noRag, question: questions.join(" ").trim() };
}

async function ensureOllama() {
  const isAlive = await pingOllama();
  if (!isAlive) {
    console.error("Ollama가 실행 중인지 확인하세요 (확인: curl.exe http://localhost:11434/api/tags)");
    process.exit(1);
  }
}

async function handleQuestion(question, { k, showPrompt, noRag }) {
  if (showPrompt) {
    const hits = await search(question, k);
    const userPrompt = buildPrompt(question, hits);
    console.log("=== [system] ===");
    console.log(SYSTEM_MESSAGE);
    console.log("\n=== [user] ===");
    console.log(userPrompt);
    return;
  }

  if (noRag) {
    await ensureOllama();
    console.log("💬 답변");
    const t0Answer = performance.now();
    const answer = await chatStream([{ role: "user", content: question }], token => {
      process.stdout.write(token);
    });
    console.log();
    const answerSec = ((performance.now() - t0Answer) / 1000).toFixed(1);
    console.log(`⏱ 답변 ${answerSec}초`);
    return;
  }

  // 일반 RAG 모드
  const t0Search = performance.now();
  const hits = await search(question, k);
  const searchSec = ((performance.now() - t0Search) / 1000).toFixed(1);

  const topScore = hits.length > 0 ? hits[0].score : 0;
  const isWeak = topScore < WEAK_THRESHOLD;

  console.log("🔎 검색 결과");
  for (const hit of hits) {
    const hitWeak = hit.score < WEAK_THRESHOLD ? " ⚠" : "";
    console.log(`  ${hit.id}  ${hit.score.toFixed(3)}  ${hit.section}${hitWeak}`);
  }

  await ensureOllama();

  const userPrompt = buildPrompt(question, hits);
  const messages = [
    { role: "system", content: SYSTEM_MESSAGE },
    { role: "user", content: userPrompt }
  ];

  console.log("💬 답변");
  const t0Answer = performance.now();
  const answer = await chatStream(messages, token => {
    process.stdout.write(token);
  });
  console.log();
  const answerSec = ((performance.now() - t0Answer) / 1000).toFixed(1);

  console.log("📚 근거 (LLM에게 넘긴 자료 · ✓ = 답변에 ID가 표시된 자료)");
  let checkedCount = 0;
  for (const hit of hits) {
    const isCited = answer.includes(hit.id);
    if (isCited) checkedCount++;
    const mark = isCited ? "✓" : " ";
    console.log(`  ${mark} ${hit.id}  ${hit.section}  ${hit.url}`);
  }

  if (isWeak) {
    console.log("  ⚠ 관련 자료가 약해 이 자료들을 답변의 근거로 보기 어렵습니다");
  } else if (checkedCount === 0) {
    console.log("  (답변에 ID 표시가 없습니다. 위 자료와 답변을 비교해 확인하세요)");
  }

  console.log(`⏱ 검색 ${searchSec}초 · 답변 ${answerSec}초`);
}

async function runInteractive(k) {
  await ensureOllama();
  // 모델 웜업
  await search("웜업", 1);

  console.log("물류창고 재고 조사 안내 챗봇입니다. 질문을 입력하세요. (끝내려면 exit)");
  const rl = readline.createInterface({ input, output });

  try {
    while (true) {
      const q = await rl.question("\n질문> ");
      const trimmed = q.trim();
      if (!trimmed) continue;
      if (trimmed.toLowerCase() === "exit" || trimmed.toLowerCase() === "quit") {
        break;
      }
      try {
        await handleQuestion(trimmed, { k, showPrompt: false, noRag: false });
      } catch (err) {
        console.error("오류 발생:", err.message);
      }
    }
  } finally {
    rl.close();
  }
}

async function main() {
  const { k, showPrompt, noRag, question } = parseArgs(process.argv.slice(2));

  if (!question && !showPrompt && !noRag) {
    await runInteractive(k);
    return;
  }

  if (!question) {
    console.error("오류: 질문을 입력하세요. 예: node src/ask.mjs \"재고 실사 차이가 나면 어떻게 처리해?\"");
    process.exit(1);
  }

  await handleQuestion(question, { k, showPrompt, noRag });
}

main().catch(err => {
  console.error("실행 중 오류:", err);
  process.exit(1);
});
