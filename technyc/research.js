// Identifies the person to write to at a newly funded company, and finds their
// email address.
//
// Runs on Vercel rather than in a Claude Code session, because the sandbox's
// egress proxy allows only an allowlist and company websites are not on it.
// Here there is open outbound HTTPS, so the site sweep in findEmail.js works
// and Claude's server-side web_search tool can do the identification.

const { findEmail } = require("./findEmail");

const MODEL = "claude-opus-5";

// Dynamic-filtering variant, supported on Opus 5.
const WEB_SEARCH_TOOL = {
  type: "web_search_20260209",
  name: "web_search",
  max_uses: 10,
};

const SYSTEM = `You research the leadership of newly funded startups so a lawyer can send a congratulations note.

Two jobs, in order of importance.

1. Identify who to address. The CEO. Only if the company has no CEO, the founder, or the senior-most of several co-founders. Founder and CEO are often different people, and getting this wrong is the most visible way to fail, so check the title rather than assuming the founder runs the company.

2. Find that person's email address. This is the part that matters most. Try the company site including its contact, about, team, press, privacy policy and terms pages, the funding press release's media contact block, SEC EDGAR Form D filings, the person's own writing and conference speaker bios, and their public profiles.

Rules you do not break:
- Never invent a name, a title, or an email address.
- Report an address as verified only if you actually saw it written somewhere. Say where.
- Never construct an address from a guessed pattern. If you saw at least two real addresses at that domain sharing a shape, applying that shape is an inference, not a guess: report it with confidence "pattern" and name the addresses it is based on.
- A shared inbox such as press@ or hello@ is a legitimate fallback. Report it with confidence "role".
- If you find nothing, say so. An honest blank beats a plausible fabrication.

Reply with a single JSON object and nothing else:
{"fullName": string|null, "firstName": string|null, "title": string|null, "isCeo": boolean, "otherLeaders": string[], "email": string|null, "emailConfidence": "verified"|"pattern"|"role"|null, "sources": string[], "notes": string}

"sources" are URLs you actually read. "notes" is one or two sentences for the lawyer: what you could not find, and where a human should look next.`;

/**
 * Pull the first JSON object out of a model response.
 * Tolerant on purpose: this runs unattended, and a run that throws because the
 * model wrapped its JSON in a code fence would lose the whole company.
 * @param {string} text
 * @returns {object|null}
 */
function extractJson(text) {
  const raw = String(text == null ? "" : text);
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates = [fenced && fenced[1], raw].filter(Boolean);

  for (const candidate of candidates) {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end <= start) continue;
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch {
      // Fall through to the next candidate.
    }
  }
  return null;
}

function collectText(content) {
  return (content || [])
    .filter((block) => block && block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

/**
 * @param {object} funding a record from parseFundingSection
 * @param {object} [deps] injection points for tests
 * @returns {Promise<object>} contact details, always an object, never a throw
 */
async function researchContact(funding, deps = {}) {
  const deadline = deps.deadline || null;
  // Required lazily, like googleapis in gmailDraft.js, so the pure helpers
  // here stay importable without the SDK installed.
  const client = deps.client || new (require("@anthropic-ai/sdk"))();
  const fetchImpl = deps.fetchImpl || globalThis.fetch;

  const { company, website, description, amountText, round } = funding;
  const raise = [amountText, round].filter(Boolean).join(" ");

  const prompt = [
    `Company: ${company}`,
    website ? `Website: ${website}` : null,
    description ? `Described as: ${description}` : null,
    raise ? `Just raised: ${raise}` : null,
    "",
    "Find the CEO, or the founder if there is no CEO, and their email address.",
  ]
    .filter(Boolean)
    .join("\n");

  let parsed = null;
  let researchError = null;

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      thinking: { type: "adaptive" },
      output_config: { effort: "high" },
      tools: [WEB_SEARCH_TOOL],
      messages: [{ role: "user", content: prompt }],
    });

    // Safety classifiers can decline; content is meaningless when they do.
    if (response.stop_reason === "refusal") {
      researchError = `model declined: ${
        (response.stop_details && response.stop_details.category) || "unknown"
      }`;
    } else {
      parsed = extractJson(collectText(response.content));
      if (!parsed) researchError = "could not parse a JSON object from the research reply";
    }
  } catch (err) {
    researchError = `research call failed: ${err.message}`;
  }

  const result = {
    company,
    fullName: (parsed && parsed.fullName) || null,
    firstName: (parsed && parsed.firstName) || null,
    title: (parsed && parsed.title) || null,
    isCeo: !!(parsed && parsed.isCeo),
    otherLeaders: (parsed && parsed.otherLeaders) || [],
    email: (parsed && parsed.email) || null,
    emailConfidence: (parsed && parsed.emailConfidence) || null,
    sources: (parsed && parsed.sources) || [],
    notes: (parsed && parsed.notes) || "",
    errors: researchError ? [researchError] : [],
  };

  // Second pass at the address. The site sweep is deterministic and reads the
  // pages the model may have skimmed, so it can beat the model's own answer:
  // a verified hit here replaces anything softer, and it fills a blank.
  if (result.fullName && website && fetchImpl) {
    try {
      const sweep = await findEmail({
        website,
        personName: result.fullName,
        fetchImpl,
        deadline,
      });
      const beatsCurrent =
        sweep.email &&
        (!result.email ||
          (sweep.confidence === "verified" && result.emailConfidence !== "verified"));

      if (beatsCurrent) {
        result.email = sweep.email;
        result.emailConfidence = sweep.confidence;
        result.sources = [...new Set([...result.sources, ...sweep.evidence])];
        if (sweep.notes.length) result.notes = [result.notes, ...sweep.notes].filter(Boolean).join(" ");
      }
    } catch (err) {
      result.errors.push(`site sweep failed: ${err.message}`);
    }
  }

  return result;
}

module.exports = { researchContact, extractJson, MODEL, WEB_SEARCH_TOOL };
