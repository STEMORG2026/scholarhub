# Reading the applicant's documents, and comparing them to requirements

**Status:** design proposal, not implemented. Written 2026-10-07 after measuring what the catalog can actually support.

This answers one question: *how would ScholarHub read a reader's transcript and CV, extract the facts from them, compare those facts against what each institution requires, and then drive the tracker and the recommendations?*

It is a design document rather than code because **the second half of that sentence is blocked on a data problem, not a programming one**, and building the extractor first would mean building on an unproven premise. The measurement is in §2.

---

## 1. The constraint that shapes every decision

`AGENTS.md` lists backend servers, authentication, cloud databases and analytics pipelines as **out of scope**. The privacy section says **no PII leaves the browser**. Those two lines decide the whole architecture:

- **A document is read locally and never uploaded.** There is no ScholarHub server to upload it to. A transcript is the most sensitive file an applicant owns.
- **Extraction runs in the browser**, so every extractor has to be either hand-written or a client-side library, and its bundle cost is paid by the reader.
- **Any path that would send document text to a model provider is an explicit, per-document, opt-in action** with a plain warning — not a default and not a silent fallback. The provider seam built in v0.26.0 makes this possible; it does not make it appropriate by default.

## 2. The measured blocker: the catalog does not carry requirements as data

This was the first thing checked, because it determines whether "compare against the institution's requirements" is buildable at all. Measured against all 50 records:

| Field | Records | Form |
|---|---|---|
| `eligibility.gpa_minimum` | 50 | field exists on every record |
| — `null` (no requirement recorded) | **45** | nothing to compare against |
| — a **number** (directly comparable) | **0** | — |
| — a **string** (prose) | **5** | see below |
| `eligibility.language_requirements` | 50 | field exists on every record |
| — empty `{}` | **35** | nothing to compare against |
| — populated | **15** | prose strings |

**And the five prose values cannot be reduced to a number without inventing one:**

- `gks-graduate` — *"A cumulative GPA of at least 2.64/4.0, 2.80/4.3, 2.91/4.5 or 3.23/5.0 — or a score percentile of 80% or above on a 100-point scale"*
- `mext-research-students` — *"The Embassy of Japan in Nepal requires 70% marks (CGPA 3.1) for Natural Sciences and 60% marks (CGPA 2.5) for Humanities"*
- `groundwater-emjm` — *"CGPA of at least B/B+ on the US system, or a 2nd upper classification on the UK system"*
- `kaust-fellowship` — *"3.0 on a 4-point scale (or equivalent) is the minimum permitted GPA"*
- `pec-pg-brazil` — *"No minimum GPA is stated in the Edital"* — a requirement that is *explicitly absent*

Those are not "unstructured data waiting to be parsed". They are **faithful records of rules that have no single scalar form**: GKS's threshold depends on which scale your transcript uses, MEXT's depends on the field, Groundwater's depends on which country's grading system you are in, and PEC-PG's states that there is no threshold at all. Collapsing any of them to `{ min_gpa: 3.1 }` would invent a requirement — the one thing this repository refuses to do anywhere else.

**Consequence:** the comparison engine can be written today, but for 45 of 50 records it will honestly answer *"the catalog does not record this requirement"*. That is a useful answer, and it is the correct one — but it is not the feature the question implies. Making the feature real is a **data pass** across the catalog, of the same kind as the provenance pass that filled in `source_url` and `last_verified`.

## 3. The pipeline

Four stages, each independently useful, each with a hard boundary:

```
  file  ──▶  INGEST  ──▶  EXTRACT  ──▶  COMPARE  ──▶  TRACK / RECOMMEND
            local read    proposals    3-valued      evidence-backed
            no upload     per value    verdicts      reasons
```

The important property: **each stage degrades to "we do not know" rather than to a guess.** An unreadable file is not an empty profile. An unextracted GPA is not a 0. An unrecorded requirement is not a pass.

## 4. Stage 1 — Ingest (buildable now, fully local)

| Format | How | Cost |
|---|---|---|
| `.txt`, `.md`, `.csv`, `.json` | `File.text()` | **zero** |
| `.docx` | DOCX is a ZIP of XML: inflate `word/document.xml` with the native `DecompressionStream`, strip tags | **zero** — verified available in Node 24 and baseline in browsers since 2023 |
| `.pdf` (text layer) | `pdfjs-dist` | **one lazy chunk, ~1.4 MB raw / ~400 kB gzip** — measured, and comparable to the entire current bundle (484 kB) |
| scanned PDF, photo | OCR | **out of scope for now.** `tesseract.js` plus language data is an order of magnitude larger again, and OCR output is a *guess* about pixels rather than a reading of characters |

The PDF dependency is the one real cost, and the pattern is already established in this codebase: **load it as a lazy chunk**, exactly as `src/AiSettings.jsx` is loaded. A reader who never attaches a PDF never downloads it. A reader who attaches a `.docx` never downloads it either.

**Refusals are part of the design.** A scanned PDF must produce *"this PDF has no text layer — it is a picture of a page. ScholarHub cannot read it, and will not guess."* Not an empty extraction, and not a silent fall-through to OCR that does not exist.

## 5. Stage 2 — Extract (deterministic first)

Two extractors, in priority order:

**Deterministic, hand-written, unit-tested.** Regular shapes that can be matched reliably and tested offline:

- GPA / CGPA **with its scale** — `3.62/4.0`, `CGPA 3.1`, `80%`, `Second Class Upper`. The scale is part of the value; a bare `3.62` is meaningless.
- English test scores **per instrument** — `IELTS 7.0 (L7.5 R7.0 W6.5 S7.0)`, `TOEFL iBT 96`, `PTE 71`. Sub-scores matter because some programmes set a per-skill floor.
- Degree and classification, institution names, dates, country.

**Model-assisted, opt-in only.** For shapes the deterministic pass misses. This is where the privacy boundary is crossed, so:

- It is **per-document and off by default**, with the warning naming the provider the text will be sent to.
- The model is asked for **the source span it read the value from**, so the extraction is checkable rather than merely plausible.
- A model extraction is never more trusted than a regex one — both are proposals.

**Every extracted value is a proposal, never a fact.** The UI shows each one beside the text it came from, editable, with an explicit *"we read this — correct it if we are wrong"*. This is the same rule the catalog already applies to its own records: *"Records are human-reviewed proposals. AI-generated content is not canonical until a human commits it."* The reader is the human.

A value the reader has not confirmed is **not** used in a comparison. That is what stops a mis-read transcript becoming a confident wrong answer about eligibility.

## 6. Stage 3 — Compare (three-valued, and `unknown` is the default)

A comparison returns one of **three** verdicts, never two:

| Verdict | Meaning | When |
|---|---|---|
| `meets` | the recorded requirement is satisfied | the catalog records a comparable rule **and** the reader confirmed a value |
| `fails` | the recorded requirement is not satisfied | same, and the value is outside the rule |
| **`unknown`** | **the comparison cannot be made** | the requirement is not recorded, is prose that cannot be reduced, or the reader has not confirmed the value |

This is the same discipline as `nationality_scope`: `unstated` renders **"Check eligibility"** and never "open to everyone", because a silent default in a tool like this is the one thing it must not do. A comparison engine whose default is `meets` would tell an applicant they qualify when the catalog simply never said.

**Worked example — why the verdict is not a number.** For a reader with a confirmed `3.62/4.0`:

- `kaust-fellowship` (recorded `3.0/4.0`) → **`meets`** — the scale matches, so the comparison is real.
- `gks-graduate` (four scales, or an 80th percentile) → **`unknown`** — 3.62/4.0 against a rule that also accepts 3.23/5.0 and a percentile is not a comparison anyone can make without knowing which branch applies. The UI says *"GKS states a threshold per scale; your transcript is on a 4.0 scale, so compare against 2.64/4.0 yourself"* — it hands back the rule rather than pretending to apply it.
- `mext-research-students` (field-dependent: 3.1 sciences, 2.5 humanities) → **`unknown`**, with the branch named.
- `pec-pg-brazil` (*"No minimum GPA is stated"*) → **`unknown`**, and specifically *"the provider states there is no GPA threshold"* — a different sentence from *"we do not know"*, because the two are different facts.
- 45 records with `gpa_minimum: null` → **`unknown`**, *"the catalog does not record a GPA requirement for this programme — check the provider."*

**So the comparison is only ever as strong as the data behind it, and the interface has to say which of those five sentences applies.** That is more work than a percentage match, and it is the only version worth building.

## 7. Stage 4 — Track and recommend

**Tracking becomes evidence-backed.** Today a document is "present" because the reader ticked a box (`sh-docs`). With ingestion, a document is present because it was **attached and parsed**, and the tracker can say what is missing *from the parsed set* rather than from the ticked set. The existing readiness count ("7 of 10 documents not ready") then means something stronger.

**Recommendations get reasons, not a score.** The existing `matching()` heuristic already carries the disclaimer *"a simple local heuristic, not an eligibility assessment"*. Extending it must preserve that. Each ranked result should carry **traceable reasons**, each of which is either a catalog field or a confirmed extracted value:

- *Eligible* — from `nationality_scope` (already built).
- *Requirement met / not met / not recorded* — from §6, naming which.
- *Deadline feasible* — from the tracker: 54 days out, 7 documents still missing.
- *Profile fit* — field and degree level, as today.

A black-box percentage is exactly what this project keeps refusing to ship. **A ranked list where every line can be traced to a source is worth more than a number nobody can audit** — and it is the only kind of recommendation that survives contact with a real application.

## 8. Honesty rules this must keep

1. **No document leaves the device.** Not by default, not "anonymised", not to a provider that promises not to train.
2. **An unreadable document is a refusal, not an empty result.** A scan without a text layer says so.
3. **An extraction is a proposal.** Shown with its source span, editable, and not used until confirmed.
4. **`unknown` is the default verdict**, and a missing requirement is never a pass.
5. **"The provider states there is no threshold" is different from "we do not know"**, and the two must not share a sentence.
6. **No number is invented** — not a GPA, not a requirement, not a cost, not a fit percentage.
7. **A model is never in the default path.** Deterministic first; the model is an explicit opt-in with the egress named.

## 9. Phased plan

**Phase 1 — unblocked, useful on its own.**
Zero-dependency ingest (text, DOCX) plus the deterministic extractor plus the confirm-before-use UI. The reader's profile gains confirmed values, which immediately improves the *existing* eligibility verdicts and the profile-fit ordering. No catalog change needed. **The PDF lazy chunk can be added here or deferred; the feature works without it for `.docx` and pasted text.**

**Phase 2 — blocked on a data decision, not on code.**
Give the catalog a requirement shape that can hold what providers actually publish, including prose it cannot reduce, with `source` and `last_verified` per requirement — then run the sourcing pass across the 50 records. The comparison engine from §6 is written in Phase 1 and starts returning `meets`/`fails` for the records that have real data, and keeps saying `unknown` for the rest until the data lands.

**Phase 3 — optional.**
OCR for scans and photographs. Explicitly deferred: it is the largest dependency by far and the least reliable output, and its results would need the strongest confirmation UI of all.

## 10. Decisions for the owner

1. **Does Phase 2 happen?** It is a sourcing pass across 50 records — comparable in effort to the provenance pass that filled in `source_url` on every record. Without it, the comparison feature is honest but mostly says `unknown`. **This is the decision the whole feature turns on.**
2. **Is a PDF dependency acceptable?** ~1.4 MB raw in a lazy chunk. The alternative is telling readers to paste text or supply `.docx`.
3. **May document text ever be sent to a model provider?** Off by default, per-document, with the egress named — or never?
4. **Does the extracted profile live in `sh-profile`** (alongside the hand-typed field/degree/GPA, with each value marked confirmed or not), or in its own key?

## 11. What I would build first

**Phase 1, with the PDF chunk deferred and the model path off.** It is the part that is unblocked, needs no catalog change, ships no new heavy dependency, and makes the existing features sharper: confirmed real values replace hand-typed ones, the eligibility verdicts and the profile-fit ordering both improve, and the tracker's readiness count starts counting documents that actually exist.

The comparison engine gets written in the same pass — with every verdict returning `unknown` for now — so that when the Phase 2 data lands, the feature turns on without a rewrite. **The one thing worth deciding before any code is decision 1: whether the catalog is going to carry requirements as data.** Everything else follows from that.
