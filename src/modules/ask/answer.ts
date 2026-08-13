/**
 * The "Ask" engine — cited Q&A strictly over the user's own indexed corpus
 * (notes, knowledge, Obsidian vault, ideas, tasks, files, and Notion when
 * connected). Retrieval is hybrid:
 *   1. Entity-aware: if the question names a known project, pull EVERYTHING
 *      directly linked to it (tasks, notes, files, goal/health, open
 *      attention) — complete and authoritative, not just similar-sounding.
 *   2. Semantic: the existing embedding search, for anything relevant that
 *      isn't formally linked (e.g. a vault note that mentions it in passing).
 * Synthesis is an Ollama-first model that must cite sources inline as [n].
 * Worker-safe (no next/cache).
 */
import { and, eq } from "drizzle-orm";
import { resolveRoute } from "@/core/ai/routing";
import { searchEverything, RELATED_MAX_DISTANCE } from "@/core/embeddings";
import { db } from "@/core/db/client";
import { projectFiles, projects } from "@/modules/projects/schema";
import { tasks } from "@/modules/tasks/schema";
import { notes } from "@/modules/notes/schema";
import { attentionItems } from "@/modules/today/schema";
import type { AskSource } from "./schema";
export type { AskSource } from "./schema";

export interface AskAnswer {
  answer: string;
  sources: AskSource[];
  model: string;
}

// Per-block item caps — a safety net against a huge project blowing the
// prompt budget, not a real limit at today's data scale.
const MAX_TASKS = 40;
const MAX_NOTES = 15;
const MAX_FILES = 8;
const MAX_ATTENTION = 15;

/**
 * If the question names a known project (by a plain substring match — these
 * are distinctive proper names, not common words), pull a complete dossier of
 * everything linked to it via projectRef/projectId. This is what makes "get
 * me everything on X" work: a direct, complete pull beats top-K similarity
 * search, which only surfaces vaguely-related text and misses most of what's
 * actually tagged to the project.
 */
async function buildProjectDossier(
  query: string,
): Promise<{ sources: AskSource[]; seen: Set<string>; matchedNames: string[] }> {
  const allProjects = await db
    .select({
      id: projects.id,
      name: projects.name,
      description: projects.description,
      goal: projects.goal,
      nextAction: projects.nextAction,
      health: projects.health,
      healthReason: projects.healthReason,
      status: projects.status,
    })
    .from(projects);

  const q = query.toLowerCase();
  // Guard on length so short/common project names can't false-positive-match
  // unrelated questions.
  const matched = allProjects.filter(
    (p) => p.name.length >= 4 && q.includes(p.name.toLowerCase()),
  );

  const sources: AskSource[] = [];
  const seen = new Set<string>(); // "kind:id" — dedupes against semantic hits later

  for (const p of matched) {
    const ref = `projects:${p.id}`;

    const overview = [
      `Project: ${p.name}`,
      `Status: ${p.status}`,
      p.description ? `Description: ${p.description}` : null,
      p.goal ? `Goal: ${p.goal}` : null,
      p.nextAction ? `Next action: ${p.nextAction}` : null,
      p.health ? `Health: ${p.health}${p.healthReason ? " — " + p.healthReason : ""}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    sources.push({ n: 0, kind: "project", title: p.name, href: `/m/projects/${p.id}`, snippet: overview });

    const [projTasks, projNotes, projFiles, projAttention] = await Promise.all([
      db
        .select({ title: tasks.title, status: tasks.status, notes: tasks.notes })
        .from(tasks)
        .where(eq(tasks.projectRef, ref))
        .limit(MAX_TASKS),
      db
        .select({ id: notes.id, title: notes.title, body: notes.body })
        .from(notes)
        .where(eq(notes.projectRef, ref))
        .limit(MAX_NOTES),
      db
        .select({ id: projectFiles.id, filename: projectFiles.filename, extractedText: projectFiles.extractedText })
        .from(projectFiles)
        .where(and(eq(projectFiles.projectId, p.id), eq(projectFiles.status, "ready")))
        .limit(MAX_FILES),
      db
        .select({ title: attentionItems.title, body: attentionItems.body, type: attentionItems.type })
        .from(attentionItems)
        .where(and(eq(attentionItems.projectRef, ref), eq(attentionItems.status, "open")))
        .limit(MAX_ATTENTION),
    ]);

    if (projTasks.length) {
      const text = projTasks
        .map((t) => `- [${t.status}] ${t.title}${t.notes ? ": " + t.notes.slice(0, 200) : ""}`)
        .join("\n");
      sources.push({
        n: 0,
        kind: "task",
        title: `${p.name} — tasks (${projTasks.length})`,
        href: "/m/tasks",
        snippet: text.slice(0, 3500),
      });
    }
    for (const n of projNotes) {
      sources.push({ n: 0, kind: "note", title: n.title, href: `/m/notes/${n.id}`, snippet: (n.body ?? "").slice(0, 2500) });
      seen.add(`note:${n.id}`);
    }
    for (const f of projFiles) {
      sources.push({
        n: 0,
        kind: "file",
        title: f.filename,
        href: `/api/projects/files/${f.id}`,
        snippet: (f.extractedText ?? "").slice(0, 3000),
      });
      seen.add(`file:${f.id}`);
    }
    if (projAttention.length) {
      const text = projAttention
        .map((a) => `- (${a.type}) ${a.title}${a.body ? ": " + a.body.slice(0, 200) : ""}`)
        .join("\n");
      sources.push({
        n: 0,
        kind: "attention",
        title: `${p.name} — needs you (${projAttention.length})`,
        href: `/m/projects/${p.id}`,
        snippet: text.slice(0, 1500),
      });
    }
  }

  return { sources, seen, matchedNames: matched.map((p) => p.name) };
}

/** Domains that return 200 but wall their content behind a login/subscription. */
const GATED_DOMAIN =
  /(^|\.)(gartner|forrester|idc|statista|wsj|ft|bloomberg|nytimes|economist|hbr|nature|sciencedirect|springer|ieee|academia)\.(com|org|net|edu)$/i;

/**
 * Crowd-sourced, blog, forum and SEO domains — reachable, but not the
 * primary/authoritative sources a professional answer should cite. Demoted to
 * plain text just like paywalls: Wikipedia et al. are tertiary references, not
 * a source you'd stand behind. Enrichment should point at standards bodies,
 * official docs and government/vendor primary sources instead.
 */
const LOW_AUTHORITY_DOMAIN =
  /(^|\.)(wikipedia|wikimedia|wiktionary|medium|substack|blogspot|wordpress|quora|reddit|stackoverflow|stackexchange|geeksforgeeks|w3schools|tutorialspoint|javatpoint|baeldung|dev\.to|hackernoon|freecodecamp|simplilearn|guru99|educative|programiz|towardsdatascience)\.(com|org|net|io)$/i;

/** A publicly-reachable, free-to-read, authoritative page? Fails closed on any doubt. */
async function linkAccessible(url: string): Promise<boolean> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  if (GATED_DOMAIN.test(u.hostname)) return false;
  if (LOW_AUTHORITY_DOMAIN.test(u.hostname)) return false;
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(6000),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      },
    });
    if (!res.ok) return false; // 4xx/5xx, incl. 401/403 gates
    // Redirected to a login/subscribe/consent page ⇒ not really accessible.
    const finalPath = new URL(res.url).pathname;
    if (/\/(login|sign[_-]?in|subscribe|register|account|paywall|consent)\b/i.test(finalPath))
      return false;
    return true;
  } catch {
    return false; // timeout, DNS, TLS, network — treat as inaccessible
  }
}

/**
 * Verify every external markdown link in the answer and demote the unreachable
 * or gated ones to plain text (keeping the label). Runs the checks concurrently
 * over the distinct URLs so it adds a fixed ~few seconds, not per-link.
 */
async function verifyExternalLinks(answer: string): Promise<string> {
  const linkRe = /\[([^\]]+)\]\(((?:https?:)?\/\/[^)\s]+)\)/gi;
  const urls = [...new Set([...answer.matchAll(linkRe)].map((m) => m[2]))];
  if (urls.length === 0) return answer;
  const ok = new Map<string, boolean>();
  await Promise.all(
    urls.map(async (u) => ok.set(u, await linkAccessible(u))),
  );
  return answer.replace(linkRe, (whole, label, url) =>
    ok.get(url) ? whole : label,
  );
}

export async function answerQuestion(query: string): Promise<AskAnswer> {
  const q = query.trim();
  if (!q) return { answer: "", sources: [], model: "" };

  const { sources: dossier, seen, matchedNames } = await buildProjectDossier(q);

  // The dossier already carries the bulk for an entity-specific question;
  // fewer semantic slots are needed alongside it.
  const raw = await searchEverything(q, dossier.length > 0 ? 6 : 10);
  const names = matchedNames.map((n) => n.toLowerCase());
  const hits = raw.filter((h) => {
    if (seen.has(`${h.kind}:${h.id}`)) return false; // already in the dossier
    // Drop weak-similarity noise everywhere (codebase-calibrated: >0.55 is
    // vocabulary overlap, not real relevance).
    if (h.distance > RELATED_MAX_DISTANCE) return false;
    // When answering about specific project(s), a semantic extra only earns a
    // slot if it actually mentions one of them — otherwise it's just
    // topically-adjacent clutter (e.g. a generic "Websites" vault note that
    // shares words with the project but says nothing about it).
    if (names.length > 0) {
      const hay = `${h.title} ${h.snippet ?? ""}`.toLowerCase();
      return names.some((n) => hay.includes(n));
    }
    return true;
  });

  const combined = [...dossier, ...hits];
  if (combined.length === 0) {
    return {
      answer:
        "I couldn't find anything in your saved data (notes, knowledge, vault, ideas, tasks, files) about that.",
      sources: [],
      model: "",
    };
  }

  const numbered = combined.map((h, i) => ({ ...h, n: i + 1 }));
  const context = numbered
    .map((h) => `[${h.n}] (${h.kind}) ${h.title}\n${h.snippet ?? ""}`)
    .join("\n\n");

  const route = await resolveRoute("ask");
  const material = [
    `QUESTION: ${q}`,
    "",
    dossier.length > 0
      ? `SOURCES 1-${dossier.length} are a COMPLETE, authoritative pull of everything directly linked to the project(s) named in the question — every task, note, file, and open item, not merely similar text. Treat them as ground truth and use them fully; don't hedge or say details are missing if they're present in these sources. Sources after that are additional context found by similarity.`
      : "SOURCES (from the user's own saved data):",
    context,
    "",
    "Answer the question using ONLY these sources for the substance, and cite them inline as [1], [2], etc. If the sources don't actually answer it, say so plainly rather than guessing. Be thorough when the sources are a complete project dossier — surface everything relevant, not just one line.",
    "You MAY add a few high-quality EXTERNAL links to enrich the answer, but hold them to a professional bar: link ONLY to PRIMARY, AUTHORITATIVE, publicly-readable sources — standards bodies and frameworks (NIST, ISO, IETF/RFCs, OWASP, MITRE ATT&CK/CVE, CISA), official product/vendor documentation, government or inter-governmental pages (.gov, europa.eu), and reputable technical primary sources. Do NOT link to tertiary or crowd/SEO sources (Wikipedia, Medium, blogs, Reddit, StackOverflow, W3Schools/GeeksforGeeks-style tutorial sites) or to paywalled/login-gated pages (Gartner, Forrester, IDC, WSJ, etc.). Use real markdown links `[label](https://…)`. These enrich; the [n] citations to the user's own data remain the backbone. If you can't name a genuinely authoritative source, add no link rather than a weak one.",
  ].join("\n");

  let answer = "";
  for await (const ev of route.provider.run({
    system:
      "You are the Ask engine of AIOS, the user's personal AI operating system. Write in a precise, professional register. The SUBSTANCE of your answer comes strictly from the user's own saved notes, knowledge, vault, ideas, tasks and files — never invented facts — and you cite those sources inline as [n]. You MAY additionally include a few external enrichment links, but only to PRIMARY, AUTHORITATIVE, publicly-readable sources (standards bodies like NIST/ISO/IETF/OWASP/MITRE, official product/vendor docs, government pages) — never tertiary/crowd sources (Wikipedia, Medium, blogs, forums) and never paywalled or login-gated ones. If the provided sources don't answer the question, say so.",
    messages: [{ role: "user", content: material }],
    tools: [],
    toolCtx: { db },
    model: route.model,
    maxTurns: 1,
    signal: AbortSignal.timeout(90_000),
  })) {
    if (ev.type === "text") answer = ev.text;
    if (ev.type === "done") answer = ev.text || answer;
    if (ev.type === "error") throw new Error(ev.message);
  }

  // The model may add external enrichment links, but they're often paywalled or
  // hallucinated. Verify each is actually reachable + free to read; keep the
  // good ones as links, demote the rest to plain text. The [n] citations (no
  // `(url)`) are untouched.
  const cleaned = await verifyExternalLinks(answer.trim());

  return {
    answer: cleaned,
    sources: numbered.map((h) => ({
      n: h.n,
      kind: h.kind,
      title: h.title,
      href: h.href,
      snippet: h.snippet,
    })),
    model: `${route.providerId}/${route.model}`,
  };
}
