// Reading the reader's own documents, locally.
//
// Design: `docs/DOCUMENT-INGESTION.md`, §4 and §5. This file is Phase 1 of that
// plan — the part that was unblocked: text and DOCX reading with **zero new
// dependencies**, a deterministic extractor, and every extracted value returned
// as a *proposal* carrying the span it was read from.
//
// Two rules from that document are enforced here rather than in the UI, because
// they are properties of the data and not of the view:
//
//   * **An unreadable document is a refusal, not an empty result.** A scanned
//     PDF with no text layer, a binary blob mislabelled `.txt`, a corrupt
//     DOCX — each returns an explicit `refused` outcome with a reason. None of
//     them returns a blank profile that looks like "this person has no GPA".
//
//   * **Every extracted value is a proposal, never a fact.** Nothing here
//     writes to the profile. It returns candidates, each with the text it came
//     from, and the reader is the one who confirms one. A bare `3.62` with no
//     scale is *not* a GPA — the scale is part of the value, and a value whose
//     scale is unknown is reported as a proposal the reader must complete, not
//     silently assumed to be /4.0.
//
// No PDF support here. `pdfjs-dist` is ~1.4 MB and is deliberately deferred
// (design §4, decision 2), so a `.pdf` is refused with the honest reason and
// the two routes that do work.

/** Format the reader attached, from the file name. */
export function formatOf(name) {
  const lower = String(name || '').toLowerCase();
  if (lower.endsWith('.docx')) return 'docx';
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.txt') || lower.endsWith('.md') || lower.endsWith('.csv') || lower.endsWith('.json')) return 'text';
  if (lower.endsWith('.doc')) return 'doc-legacy';
  return 'unknown';
}

// --- DOCX -------------------------------------------------------------------
//
// A `.docx` is a ZIP container. The only member this needs is
// `word/document.xml`, and the inflate step is `DecompressionStream`, which is
// baseline in browsers and present in Node 24 — so reading a DOCX costs nothing
// in bundle size. This is a minimal ZIP central-directory reader, not a general
// archive library: it locates one named entry and stops.

const utf8 = new TextDecoder('utf-8');

/** Read a little-endian uint32 out of a DataView. */
function u32(view, offset) {
  return view.getUint32(offset, true);
}

function u16(view, offset) {
  return view.getUint16(offset, true);
}

/**
 * Pull one member out of a ZIP (`Uint8Array`), or null if it is not there.
 *
 * Walks the End Of Central Directory record, then the central directory, then
 * reads the local header it points at. Anything malformed returns null rather
 * than throwing, so the caller reports a refusal instead of a crash.
 */
export function readZipMember(bytes, wantedName) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 22) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // Find the End Of Central Directory signature (0x06054b50) scanning back —
  // a comment after it can be up to 64 KB, so the tail is the place to look.
  let eocd = -1;
  const scanFrom = Math.max(0, bytes.length - 66000);
  for (let i = bytes.length - 22; i >= scanFrom; i -= 1) {
    if (u32(view, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;

  const entryCount = u16(view, eocd + 10);
  let pointer = u32(view, eocd + 16);
  if (pointer === 0xffffffff) return null; // ZIP64: not supported, and not needed for a Word file.

  for (let i = 0; i < entryCount; i += 1) {
    if (pointer + 46 > bytes.length || u32(view, pointer) !== 0x02014b50) return null;

    const method = u16(view, pointer + 10);
    const compressedSize = u32(view, pointer + 20);
    const nameLength = u16(view, pointer + 28);
    const extraLength = u16(view, pointer + 30);
    const commentLength = u16(view, pointer + 32);
    const localOffset = u32(view, pointer + 42);

    const name = utf8.decode(bytes.subarray(pointer + 46, pointer + 46 + nameLength));

    if (name === wantedName) {
      if (localOffset + 30 > bytes.length || u32(view, localOffset) !== 0x04034b50) return null;
      const localNameLength = u16(view, localOffset + 26);
      const localExtraLength = u16(view, localOffset + 28);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const data = bytes.subarray(dataStart, dataStart + compressedSize);
      return { method, data };
    }

    pointer += 46 + nameLength + extraLength + commentLength;
  }

  return null;
}

/** Inflate a raw-deflate byte array, or return null if the stream is unusable. */
async function inflateRaw(bytes) {
  if (typeof DecompressionStream !== 'function') return null;
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    const buffer = await new Response(stream).arrayBuffer();
    return new Uint8Array(buffer);
  } catch {
    return null;
  }
}

/**
 * The `word/document.xml` text of a DOCX, or null when it cannot be read.
 *
 * Stores either the method the ZIP declares: 0 (stored) or 8 (deflate).
 */
export async function docxXml(bytes) {
  const member = readZipMember(bytes, 'word/document.xml');
  if (!member) return null;
  if (member.method === 0) return utf8.decode(member.data);
  if (member.method === 8) {
    const inflated = await inflateRaw(member.data);
    return inflated ? utf8.decode(inflated) : null;
  }
  return null;
}

/**
 * Turn the WordprocessingML into plain text.
 *
 * Word marks structure with tags that matter for a transcript: `w:p` is a
 * paragraph and `w:tab`/`w:br` are whitespace. Collapsing all tags to a single
 * space, which is the obvious implementation, runs a table row together and
 * loses the boundary between a label and its value — the very boundary a
 * transcript's "CGPA | 3.62 / 4.0" row depends on. So paragraphs and cells
 * become newlines and tabs become tabs.
 */
export function wpmlToText(xml) {
  if (typeof xml !== 'string') return '';
  return xml
    .replace(/<w:tab\b[^>]*\/?>/g, '\t')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<\/w:tr>/g, '\n')
    .replace(/<\/w:tc>/g, '\t')
    .replace(/<w:br\b[^>]*\/?>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\t+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

// --- reading a file into text ----------------------------------------------

/**
 * A plausible fraction of a text file's bytes that must be printable.
 *
 * A `.txt` that is really a scan, or a PDF that someone renamed, decodes into a
 * high proportion of control characters and replacement glyphs. Requiring the
 * text to *look* like text is what stops a binary being read as a document of
 * garbage and then mined for values that are not there.
 */
function looksLikeText(text) {
  if (!text || text.length < 8) return false;
  let printable = 0;
  const sample = text.slice(0, 4000);
  for (const char of sample) {
    const code = char.codePointAt(0);
    if (code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 0xfffd)) printable += 1;
  }
  return printable / sample.length >= 0.85;
}

/**
 * Read one attached file. Always resolves to an outcome object, never throws.
 *
 * Outcomes:
 *   `{ ok: true, text, format }`              — read; may still extract nothing.
 *   `{ ok: false, reason, detail }`           — a refusal the UI must show.
 *
 * `reason` is one of: `unsupported`, `pdf-deferred`, `not-text`, `empty`,
 * `unreadable`.
 */
export async function readDocument(file) {
  const name = file && file.name ? file.name : '';
  const format = formatOf(name);

  if (format === 'pdf') {
    return {
      ok: false,
      reason: 'pdf-deferred',
      format,
      detail:
        'ScholarHub does not read PDFs yet. The reader it would need is about three times the size of the whole app, so it is deferred rather than guessed at. Attach the .docx or paste the text instead.',
    };
  }
  if (format === 'doc-legacy') {
    return {
      ok: false,
      reason: 'unsupported',
      format,
      detail: 'This is the old Word format, which is a different container. Save it as .docx or .pdf, or paste the text.',
    };
  }
  if (format === 'unknown') {
    return {
      ok: false,
      reason: 'unsupported',
      format,
      detail: 'ScholarHub reads .docx and plain text (.txt, .md, .csv, .json). It will not open an unrecognised file.',
    };
  }

  let bytes;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return { ok: false, reason: 'unreadable', format, detail: 'The file could not be read from disk.' };
  }

  if (bytes.length === 0) {
    return { ok: false, reason: 'empty', format, detail: 'The file is empty.' };
  }

  if (format === 'docx') {
    const xml = await docxXml(bytes);
    if (xml === null) {
      return {
        ok: false,
        reason: 'unreadable',
        format,
        detail:
          'This does not look like a readable .docx. It may be corrupt, or it may be a format that only looks like one. ScholarHub will not guess at its contents.',
      };
    }
    const text = wpmlToText(xml);
    if (!looksLikeText(text)) {
      return { ok: false, reason: 'empty', format, detail: 'The document opened but contained no readable text.' };
    }
    return { ok: true, format, text };
  }

  // Plain text family.
  const text = utf8.decode(bytes);
  if (!looksLikeText(text)) {
    return {
      ok: false,
      reason: 'not-text',
      format,
      detail:
        'This file does not contain text — it is a picture or a binary file with a text extension. ScholarHub cannot read it, and will not guess.',
    };
  }
  return { ok: true, format, text };
}

// --- the deterministic extractor --------------------------------------------
//
// Every pattern here matches a *regular* shape. Anything irregular is left for
// the model path (which is off) or for the reader to type. A proposal carries
// the exact substring it was read from so the reader can check it rather than
// trust it.

// The gap a label and its value are allowed to sit across.
//
// `[^0-9]` alone is too loose (it jumps whole sentences) and `[^0-9\n]` is too
// tight: a Word table puts each cell's paragraph on its own line, so a
// transcript reads "CGPA\n\t3.62 / 4.0". The gap therefore allows at most one
// newline, no second newline, and no run of two spaces — enough for a table
// cell boundary, not enough to leap to an unrelated number in the next block.
const LABEL_GAP = '[^0-9\\n]{0,20}(?:\\n[\\t ]*[^0-9\\n]{0,20})?';

/**
 * English-test instruments, with the published score range each is scored on.
 *
 * The range is carried so that an out-of-range reading can be rejected rather
 * than proposed: the catalog already records a real provider (KAUST) printing
 * "TOEFL iBT 5 overall", which is impossible on a /120 instrument. If a value
 * outside the instrument's own range were proposed here, ScholarHub would be
 * repeating a provider's error as if it were a fact.
 */
// `overallRange` is the set of totals the instrument can actually award, and it
// is tighter than the arithmetic envelope. A TOEFL iBT total of 5 is *within*
// 0–120 and still impossible — the four sections each score at least 1, so the
// floor is 4 at the absolute minimum and no real total sits near it. The floor
// is what catches the KAUST shape ("TOEFL iBT 5 overall") that a naive
// `value <= 120` check waves through.
export const ENGLISH_TESTS = [
  // A decimal-capable pattern for IELTS, so `12.0` is read as 12 and rejected
  // rather than matched as `1` and accepted.
  { id: 'ielts', label: 'IELTS', pattern: new RegExp(`IELTS\\b${LABEL_GAP}(\\d{1,2}(?:\\.\\d)?)`, 'i'), overallRange: [0, 9] },
  { id: 'toefl', label: 'TOEFL iBT', pattern: new RegExp(`TOEFL\\b(?:\\s*iBT)?${LABEL_GAP}(\\d{1,3})`, 'i'), overallRange: [20, 120] },
  { id: 'pte', label: 'PTE Academic', pattern: new RegExp(`PTE\\b${LABEL_GAP}(\\d{1,3})`, 'i'), overallRange: [10, 90] },
  { id: 'duolingo', label: 'Duolingo English Test', pattern: new RegExp(`Duolingo\\b${LABEL_GAP}(\\d{1,3})`, 'i'), overallRange: [10, 160] },
];

/** IELTS sub-scores, e.g. `IELTS 7.0 (L7.5 R7.0 W6.5 S7.0)`. */
const IELTS_SUBS = /\b([LRWS])\s*(\d(?:\.\d)?)\b/g;

/**
 * Degree classifications a transcript may print, mapped to the band they mean.
 *
 * `rank` is only ever used to compare two values *on the same system* — a UK
 * class is never compared to a US GPA, because they are not on one scale.
 */
export const CLASSIFICATIONS = [
  { id: 'first', label: 'First Class', rank: 4, pattern: /\bFirst\s+Class(?:\s+Honours)?\b|\bFirst\s+Division\b/i },
  {
    id: 'upper-second',
    label: 'Second Class Upper',
    rank: 3,
    // Both word orders are in use: "Second Class Upper" (and its Division form)
    // in the South Asian and African systems, "Upper Second Class" in the UK.
    pattern:
      /\b(?:Second|2nd)\s+Class\s+(?:Upper|Honours\s+Upper|Upper\s+Division)\b|\bUpper\s+Second(?:\s+Class)?\b|\bSecond\s+Division\b/i,
  },
  {
    id: 'lower-second',
    label: 'Second Class Lower',
    rank: 2,
    pattern:
      /\b(?:Second|2nd)\s+Class\s+(?:Lower|Lower\s+Division)\b|\bLower\s+Second(?:\s+Class)?\b|\bThird\s+Division\b/i,
  },
  { id: 'third', label: 'Third Class', rank: 1, pattern: /\bThird\s+Class\b/i },
];

/**
 * Find a GPA/CGPA with its scale.
 *
 * The scale is mandatory. `3.62` alone is not a GPA — it could be /4.0, /4.3,
 * /4.5 or /5.0, and those are different values against every threshold in the
 * catalog. The pattern therefore requires the `/scale`, and a bare number is
 * deliberately *not* extracted. The catalog's own GKS record states its
 * threshold four different ways depending on which scale a transcript uses,
 * which is exactly why assuming one would invent a requirement comparison.
 *
 * `percent` catches the "80% or above" shape, which is its own scale.
 */
export function extractGpa(text) {
  const out = [];

  // `CGPA: 3.62 / 4.0`, `GPA 3.62/4.00`, `Cumulative GPA of 3.62 out of 4.0`,
  // and the table shape `CGPA\n\t3.62 / 4.0`.
  const withScale = new RegExp(`\\b(?:C?GPA|Grade\\s+Point\\s+Average)\\b${LABEL_GAP}(\\d(?:\\.\\d{1,2})?)\\s*(?:\\/|out\\s+of|of)\\s*(\\d(?:\\.\\d{1,2})?)`, 'gi');
  let match;
  while ((match = withScale.exec(text)) !== null) {
    const value = Number(match[1]);
    const scale = Number(match[2]);
    if (value > scale) continue; // 4.0/3.0 is not a reading; it is a typo or a different field.
    out.push({
      field: 'gpa',
      value,
      scale,
      label: `${value} / ${scale}`,
      span: match[0].replace(/\s+/g, ' ').trim(),
      confidence: 'high',
    });
  }

  // A bare `CGPA 3.1` with no scale is recorded as *incomplete*, not as a value.
  if (out.length === 0) {
    const bare = new RegExp(`\\b(?:C?GPA|Grade\\s+Point\\s+Average)\\b${LABEL_GAP}(\\d(?:\\.\\d{1,2})?)(?!\\s*(?:\\/|out\\s+of))`, 'i').exec(text);
    if (bare) {
      out.push({
        field: 'gpa',
        value: Number(bare[1]),
        scale: null,
        label: `${bare[1]} (scale not stated)`,
        span: bare[0].replace(/\s+/g, ' ').trim(),
        confidence: 'incomplete',
        note: 'The scale is not written next to this figure. A GPA has no meaning without one — set it before this can be compared against anything.',
      });
    }
  }

  // `80%` / `80 per cent` — a different scale, so a different proposal.
  const percent = new RegExp(`\\b(?:CGPA|GPA|aggregate|marks?)\\b${LABEL_GAP}(\\d{2,3})\\s*(?:%|per\\s?cent\\b)`, 'i').exec(text);
  if (percent) {
    const value = Number(percent[1]);
    if (value >= 0 && value <= 100) {
      out.push({ field: 'gpa', value, scale: 100, label: `${value}%`, span: percent[0].replace(/\s+/g, ' ').trim(), confidence: 'high' });
    }
  }

  return out;
}

/** Find English test scores, with per-instrument ranges enforced. */
export function extractEnglishTests(text) {
  const out = [];
  for (const test of ENGLISH_TESTS) {
    const match = test.pattern.exec(text);
    if (!match) continue;
    const value = Number(match[1]);
    const [low, high] = test.overallRange;

    if (value < low || value > high) {
      // Out of range for the instrument it names: quoted, but not proposed as
      // a comparable value, and never silently corrected.
      out.push({
        field: 'english',
        instrument: test.id,
        label: `${test.label} ${value}`,
        value: null,
        span: match[0].trim(),
        confidence: 'invalid',
        note: `This reads ${value}, which is outside the ${test.label} range of ${low}\u2013${high}. The provider's page or the document may have an error — ScholarHub will not correct it for you.`,
      });
      continue;
    }

    const proposal = {
      field: 'english',
      instrument: test.id,
      value,
      label: `${test.label} ${value}`,
      span: match[0].trim(),
      confidence: 'high',
      subs: [],
    };

    if (test.id === 'ielts') {
      // Only sub-scores that sit in the same parenthetical as the overall.
      const nearby = text.slice(match.index, match.index + match[0].length + 60);
      IELTS_SUBS.lastIndex = 0;
      let sub;
      while ((sub = IELTS_SUBS.exec(nearby)) !== null) {
        proposal.subs.push({ skill: sub[1].toUpperCase(), value: Number(sub[2]) });
      }
    }

    out.push(proposal);
  }
  return out;
}

/** Find a degree classification, and the level it is a classification of. */
export function extractClassification(text) {
  const out = [];
  for (const entry of CLASSIFICATIONS) {
    const match = entry.pattern.exec(text);
    if (!match) continue;
    out.push({
      field: 'classification',
      value: entry.id,
      rank: entry.rank,
      label: entry.label,
      span: match[0].trim(),
      confidence: 'high',
    });
    break; // The highest-ranked match wins; "First Class" beats a stray "Third".
  }
  return out;
}

/**
 * Everything the deterministic pass can propose, in one call.
 *
 * Returns `{ proposals, notes }`. `proposals` is the list the UI shows for
 * confirmation; `notes` records what was looked for and not found, so the UI
 * can say "no GPA was found" instead of silently showing nothing (which a
 * reader would reasonably read as "the app ignored my transcript").
 */
export function extractProposals(text) {
  const source = typeof text === 'string' ? text : '';
  const proposals = [...extractGpa(source), ...extractEnglishTests(source), ...extractClassification(source)];

  const notes = [];
  if (!proposals.some((p) => p.field === 'gpa')) {
    notes.push('No GPA or percentage with a scale was found in this text.');
  }
  if (!proposals.some((p) => p.field === 'english')) {
    notes.push('No English test score was found in this text.');
  }
  if (!proposals.some((p) => p.field === 'classification')) {
    notes.push('No degree classification was found in this text.');
  }

  return { proposals, notes };
}
