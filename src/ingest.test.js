// Tests for reading the reader's documents and comparing them to requirements.
//
// The load-bearing tests here are the *negative* ones. The property this module
// has to keep is not "it can read a GPA" — it is "it refuses to produce a value
// it cannot support". So the tests that matter assert on what is *not*
// returned: a bare number with no scale is not a comparable GPA, an unreadable
// file is a refusal rather than an empty profile, and out-of-range test scores
// are quoted but never proposed as comparable.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';

import {
  formatOf,
  readZipMember,
  docxXml,
  wpmlToText,
  readDocument,
  extractGpa,
  extractEnglishTests,
  extractClassification,
  extractProposals,
} from './ingest.js';

import {
  gpaRequirement,
  compareGpa,
  compareAllGpa,
  VERDICT_LABEL,
} from './compare.js';

// --- format detection -------------------------------------------------------

test('formatOf recognises the formats it reads and names the ones it does not', () => {
  assert.equal(formatOf('transcript.docx'), 'docx');
  assert.equal(formatOf('cv.PDF'), 'pdf');
  assert.equal(formatOf('notes.txt'), 'text');
  assert.equal(formatOf('data.csv'), 'text');
  assert.equal(formatOf('old.doc'), 'doc-legacy');
  assert.equal(formatOf('photo.jpg'), 'unknown');
  assert.equal(formatOf(''), 'unknown');
  assert.equal(formatOf(undefined), 'unknown');
});

// --- the ZIP/DOCX reader ----------------------------------------------------

/** Build a minimal but *valid* DOCX (a real ZIP) around some document.xml. */
function makeDocx(documentXml) {
  const nameBytes = new TextEncoder().encode('word/document.xml');
  const raw = new TextEncoder().encode(documentXml);
  const compressed = new Uint8Array(deflateRawSync(Buffer.from(raw)));

  const push32 = (arr, n) => arr.push(n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff);
  const push16 = (arr, n) => arr.push(n & 0xff, (n >>> 8) & 0xff);

  // Local file header (signature 0x04034b50).
  const localHeader = [0x50, 0x4b, 0x03, 0x04];
  push16(localHeader, 20); // version
  push16(localHeader, 0); // flags
  push16(localHeader, 8); // method = deflate
  push16(localHeader, 0); // time
  push16(localHeader, 0); // date
  push32(localHeader, 0); // crc (the app does not verify it)
  push32(localHeader, compressed.length);
  push32(localHeader, raw.length);
  push16(localHeader, nameBytes.length);
  push16(localHeader, 0); // extra len
  const localBody = [...nameBytes, ...compressed];

  const centralOffset = localHeader.length + localBody.length;

  // Central directory header (signature 0x02014b50).
  const central = [0x50, 0x4b, 0x01, 0x02];
  push16(central, 20);
  push16(central, 20);
  push16(central, 0);
  push16(central, 8);
  push16(central, 0);
  push16(central, 0);
  push32(central, 0);
  push32(central, compressed.length);
  push32(central, raw.length);
  push16(central, nameBytes.length);
  push16(central, 0);
  push16(central, 0);
  push16(central, 0);
  push16(central, 0);
  push32(central, 0);
  push32(central, 0); // local header offset
  central.push(...nameBytes);

  const eocd = [0x50, 0x4b, 0x05, 0x06];
  push16(eocd, 0);
  push16(eocd, 0);
  push16(eocd, 1); // one entry
  push16(eocd, 1);
  push32(eocd, central.length);
  push32(eocd, centralOffset);
  push16(eocd, 0); // no comment

  return new Uint8Array([...localHeader, ...localBody, ...central, ...eocd]);
}

test('readZipMember finds the named member and returns raw deflate bytes', () => {
  const bytes = makeDocx('<w:document><w:body/></w:document>');
  const member = readZipMember(bytes, 'word/document.xml');
  assert.ok(member, 'the member was not found');
  assert.equal(member.method, 8);
  assert.ok(member.data.length > 0);
});

test('readZipMember returns null for a member that is not in the archive', () => {
  const bytes = makeDocx('<w:document/>');
  assert.equal(readZipMember(bytes, 'word/other.xml'), null);
});

test('a non-ZIP blob is not mistaken for an archive', () => {
  // A JPEG header: no EOCD anywhere, so this must not read as ZIP.
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, ...new Array(200).fill(7)]);
  assert.equal(readZipMember(jpeg, 'word/document.xml'), null);
  assert.equal(readZipMember(new Uint8Array([1, 2, 3]), 'word/document.xml'), null);
});

test('docxXml round-trips a real deflated document.xml', async () => {
  const xml = '<w:document><w:body><w:p><w:r><w:t>Hello transcript</w:t></w:r></w:p></w:body></w:document>';
  const bytes = makeDocx(xml);
  const out = await docxXml(bytes);
  assert.equal(out, xml);
});

test('wpmlToText keeps paragraph and cell boundaries a transcript depends on', () => {
  const xml =
    '<w:document><w:body>' +
    '<w:p><w:r><w:t>Academic Record</w:t></w:r></w:p>' +
    '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>CGPA</w:t></w:r></w:p></w:tc>' +
    '<w:tc><w:p><w:r><w:t>3.62 / 4.0</w:t></w:r></w:p></w:tc></w:tr></w:tbl>' +
    '</w:body></w:document>';

  const text = wpmlToText(xml);
  assert.ok(text.includes('Academic Record'));
  // The label and the value must not be run together into "CGPA3.62", and a
  // paragraph break must survive so the extractor can see line structure.
  assert.ok(text.includes('CGPA'), 'the label was lost');
  assert.ok(text.includes('3.62 / 4.0'), 'the value was lost');
  assert.ok(/\n/.test(text), 'paragraph breaks were collapsed away');
  assert.ok(!/<[a-z]/i.test(text), 'tags survived into the text');
});

// --- readDocument: refusals, not empty results ------------------------------

/** A stand-in for the browser's File, with just the parts readDocument uses. */
function fakeFile(name, bytes) {
  return {
    name,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
}

test('a PDF is refused with the honest reason, not read as an empty document', async () => {
  const out = await readDocument(fakeFile('cv.pdf', new Uint8Array([0x25, 0x50, 0x44, 0x46])));
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'pdf-deferred');
  assert.match(out.detail, /does not read PDFs/i);
});

test('an unrecognised extension is refused rather than sniffed', async () => {
  const out = await readDocument(fakeFile('letter.docx.exe', new Uint8Array([1, 2, 3])));
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'unsupported');
});

test('a binary file with a .txt name is refused as not-text, not mined for garbage', async () => {
  // 400 bytes of control characters — a scan or a mislabelled image.
  const binary = new Uint8Array(400).fill(0x00);
  const out = await readDocument(fakeFile('scan.txt', binary));
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'not-text');
});

test('an empty file is a refusal, not an empty profile', async () => {
  const out = await readDocument(fakeFile('blank.txt', new Uint8Array(0)));
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'empty');
});

test('a corrupt .docx is refused, not silently treated as containing no text', async () => {
  const out = await readDocument(fakeFile('broken.docx', new Uint8Array([0x50, 0x4b, 3, 4, 0, 0, 0, 0])));
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'unreadable');
});

test('a real DOCX is read into text end to end', async () => {
  const xml = '<w:document><w:body><w:p><w:r><w:t>CGPA 3.62 / 4.0</w:t></w:r></w:p></w:body></w:document>';
  const out = await readDocument(fakeFile('transcript.docx', makeDocx(xml)));
  assert.equal(out.ok, true);
  assert.equal(out.format, 'docx');
  assert.match(out.text, /3\.62 \/ 4\.0/);
});

test('a plain text file is read without needing an archive at all', async () => {
  const body = new TextEncoder().encode('IELTS 7.0 overall\nCGPA: 3.62/4.0\n');
  const out = await readDocument(fakeFile('notes.txt', body));
  assert.equal(out.ok, true);
  assert.equal(out.format, 'text');
});

// --- the GPA extractor: the scale rule --------------------------------------

test('a GPA is extracted only with its scale', () => {
  const out = extractGpa('Academic record. CGPA 3.62 / 4.0 cumulative.');
  assert.equal(out.length, 1);
  assert.equal(out[0].value, 3.62);
  assert.equal(out[0].scale, 4);
  assert.equal(out[0].confidence, 'high');
  assert.match(out[0].span, /3\.62 \/ 4\.0/);
});

test("NEGATIVE CONTROL: a bare GPA with no scale is marked incomplete, not accepted", () => {
  const out = extractGpa('My CGPA is 3.1 from the university.');
  assert.equal(out.length, 1);
  assert.equal(out[0].value, 3.1);
  assert.equal(out[0].scale, null, 'a scale was invented');
  assert.equal(out[0].confidence, 'incomplete');
  assert.match(out[0].note, /scale/i);
});

test('NEGATIVE CONTROL: a value larger than its own scale is rejected', () => {
  // "4.2 / 4.0" is not a GPA; it is a typo or a different quantity. Proposing
  // it would put an impossible value in front of the reader as if it were read.
  // Assert on the *absence of a scaled proposal* specifically — an unscaled
  // fallback proposal is a different (and acceptable) outcome, so a test that
  // only counted high-confidence proposals could pass with the guard removed.
  const out = extractGpa('CGPA 4.2 / 4.0 at graduation.');
  const scaled = out.filter((p) => p.scale === 4);
  assert.equal(scaled.length, 0, 'an impossible value was proposed on its own scale');
  assert.ok(
    !out.some((p) => p.value === 4.2 && p.confidence === 'high'),
    'an impossible reading was proposed with high confidence',
  );
});

test('a value equal to its scale is allowed through (4.0 / 4.0 is a real maximum)', () => {
  const out = extractGpa('CGPA 4.0 / 4.0');
  assert.equal(out.length, 1);
  assert.equal(out[0].value, 4);
  assert.equal(out[0].scale, 4);
  assert.equal(out[0].confidence, 'high');
});

test('a percentage is carried on its own 100-point scale', () => {
  const out = extractGpa('Aggregate 82% overall.');
  const percent = out.find((p) => p.scale === 100);
  assert.ok(percent, 'the percentage was not extracted');
  assert.equal(percent.value, 82);
});

test('the four-scale GKS shape and a simple GPA are not confused', () => {
  // Real catalog copy. None of these should be read as one scalar requirement,
  // but a reader's own transcript still reads as a proposal.
  const out = extractGpa('A cumulative GPA of at least 2.64/4.0, 2.80/4.3, 2.91/4.5 or 3.23/5.0');
  // Four scaled figures are present; the reader's confirmation is what decides
  // which one is theirs. The extractor does not choose.
  assert.ok(out.length >= 1);
  for (const proposal of out) assert.ok(proposal.scale !== null || proposal.confidence === 'incomplete');
});

// --- English tests ----------------------------------------------------------

test('IELTS overall and sub-scores are extracted together', () => {
  const out = extractEnglishTests('IELTS 7.0 (L7.5 R7.0 W6.5 S7.0) was accepted.');
  assert.equal(out.length, 1);
  assert.equal(out[0].instrument, 'ielts');
  assert.equal(out[0].value, 7);
  assert.equal(out[0].subs.length, 4);
  assert.deepEqual(
    out[0].subs.map((s) => s.skill).sort(),
    ['L', 'R', 'S', 'W'],
  );
});

test('TOEFL and PTE are read on their own ranges', () => {
  const toefl = extractEnglishTests('TOEFL iBT 96 overall.');
  assert.equal(toefl[0].instrument, 'toefl');
  assert.equal(toefl[0].value, 96);

  const pte = extractEnglishTests('PTE Academic 71.');
  assert.equal(pte[0].instrument, 'pte');
  assert.equal(pte[0].value, 71);
});

test('NEGATIVE CONTROL: a score outside its instrument range is quoted but not proposed', () => {
  // The catalog records KAUST printing "TOEFL iBT 5 overall" — impossible on a
  // /120 instrument. ScholarHub must not repeat an impossible value as if it
  // had read a real one, and must not silently "fix" it to a plausible number.
  const out = extractEnglishTests('TOEFL iBT 5 overall, with at least 4.5 in all sections.');
  assert.equal(out.length, 1);
  assert.equal(out[0].confidence, 'invalid');
  assert.equal(out[0].value, null, 'an out-of-range value was proposed as comparable');
  assert.match(out[0].note, /outside the TOEFL iBT range/);
});

test('IELTS 9.0 is in range and proposed; IELTS 12 is not', () => {
  const ok = extractEnglishTests('IELTS 9.0');
  assert.equal(ok[0].confidence, 'high');
  const bad = extractEnglishTests('IELTS 12.0');
  assert.equal(bad[0].confidence, 'invalid');
});

// --- classifications --------------------------------------------------------

test('classifications are recognised and ranked, highest first', () => {
  const first = extractClassification('Upper Second Class Honours');
  assert.equal(first.length, 1);
  assert.equal(first[0].value, 'upper-second');

  const upper = extractClassification('Awarded First Class Honours');
  assert.equal(upper[0].rank, 4);
});

test('a "First Class" mention beats a stray lower mention', () => {
  const out = extractClassification('First Class. (Not Third Class.)');
  assert.equal(out[0].value, 'first');
});

// --- the whole extract, and the notes about what was not found --------------

test('extractProposals returns every proposal with its span, and notes the gaps', () => {
  const text = 'CGPA: 3.62/4.0\nIELTS 7.0 (L7.5 R7.0 W6.5 S7.0)\nFirst Class Honours\n';
  const { proposals, notes } = extractProposals(text);
  assert.ok(proposals.some((p) => p.field === 'gpa'));
  assert.ok(proposals.some((p) => p.field === 'english'));
  assert.ok(proposals.some((p) => p.field === 'classification'));
  for (const proposal of proposals) {
    assert.ok(typeof proposal.span === 'string' && proposal.span.length > 0, 'a proposal had no source span');
  }
  assert.equal(notes.length, 0);
});

test('an empty read reports what was looked for and not found, rather than nothing', () => {
  const { proposals, notes } = extractProposals('A short personal statement with no figures in it.');
  assert.equal(proposals.length, 0);
  assert.equal(notes.length, 3);
  assert.ok(notes.some((n) => /GPA/.test(n)));
});

test('extractProposals tolerates a non-string without throwing', () => {
  const { proposals, notes } = extractProposals(undefined);
  assert.deepEqual(proposals, []);
  assert.equal(notes.length, 3);
});

// --- the shape a real transcript actually has -------------------------------
//
// Regression test for a defect the first version of this file missed. Every
// pattern originally required the label and its value on *one line*, and every
// unit-test fixture was written that way — so the tests passed while a real
// transcript extracted nothing. A Word table puts each cell's paragraph on its
// own line, so the text a reader actually attaches reads:
//
//     CGPA
//     \t3.62 / 4.0
//
// The failing case was found by reading a real generated .docx, not by reading
// the code. This pins the table shape so it cannot regress silently.

test('a label and its value may be separated by a Word table-cell boundary', () => {
  const tableShaped = 'ACADEMIC TRANSCRIPT\n\nCGPA\n\t3.62 / 4.0\n\nIELTS\n\t7.0 (L7.5 R7.0 W6.5 S7.0)\n\nAggregate\n\t82%\n';
  const { proposals } = extractProposals(tableShaped);

  const gpa = proposals.find((p) => p.field === 'gpa' && p.scale === 4);
  assert.ok(gpa, 'the GPA in a table cell was not extracted');
  assert.equal(gpa.value, 3.62);

  const ielts = proposals.find((p) => p.field === 'english');
  assert.ok(ielts, 'the IELTS row in a table cell was not extracted');
  assert.equal(ielts.value, 7);

  const percent = proposals.find((p) => p.scale === 100);
  assert.ok(percent, 'the percentage in a table cell was not extracted');
});

test('NEGATIVE CONTROL: the label gap spans at most one line, not whole paragraphs', () => {
  // The gap was widened to allow a table-cell newline. It must not have been
  // widened so far that a label grabs a number from the next paragraph — that
  // would attribute an unrelated figure to a label it does not belong to.
  const twoParagraphs = 'IELTS\n\nIn an unrelated paragraph, the year 2026 and a count of 45 items appear.';
  const out = extractEnglishTests(twoParagraphs);
  assert.equal(out.length, 0, 'the label reached across a blank line to an unrelated number');
});

test('a real generated DOCX yields every value in its table', async () => {
  // The fixture is built the way Word builds one: a ZIP whose
  // word/document.xml holds a table, with each label and value in its own cell.
  const xml =
    '<w:document><w:body>' +
    '<w:tbl>' +
    '<w:tr><w:tc><w:p><w:r><w:t>CGPA</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>3.62 / 4.0</w:t></w:r></w:p></w:tc></w:tr>' +
    '<w:tr><w:tc><w:p><w:r><w:t>IELTS</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>7.0 (L7.5 R7.0 W6.5 S7.0)</w:t></w:r></w:p></w:tc></w:tr>' +
    '<w:tr><w:tc><w:p><w:r><w:t>Classification</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>First Class Honours</w:t></w:r></w:p></w:tc></w:tr>' +
    '</w:tbl></w:body></w:document>';

  const out = await readDocument(fakeFile('transcript.docx', makeDocx(xml)));
  assert.equal(out.ok, true);

  const { proposals } = extractProposals(out.text);
  assert.ok(proposals.some((p) => p.field === 'gpa' && p.value === 3.62 && p.scale === 4), 'GPA lost in the DOCX round trip');
  assert.ok(proposals.some((p) => p.field === 'english' && p.value === 7), 'IELTS lost in the DOCX round trip');
  assert.ok(proposals.some((p) => p.field === 'classification'), 'classification lost in the DOCX round trip');
});

// --- the comparison engine --------------------------------------------------

const numericRecord = { id: 'x', eligibility: { gpa_minimum: 3.0, gpa_scale: 4 } };
const nullRecord = { id: 'y', eligibility: { gpa_minimum: null } };
const unscaledRecord = { id: 'u', eligibility: { gpa_minimum: 3.0 } };
const proseRecord = {
  id: 'gks',
  eligibility: {
    gpa_minimum:
      'A cumulative GPA of at least 2.64/4.0, 2.80/4.3, 2.91/4.5 or 3.23/5.0 — or a score percentile of 80% or above on a 100-point scale',
  },
};
const noneStatedRecord = { id: 'pec', eligibility: { gpa_minimum: 'No minimum GPA is stated in the Edital' } };

test('gpaRequirement classifies the catalog shapes it actually contains', () => {
  assert.equal(gpaRequirement(numericRecord).kind, 'numeric');
  assert.equal(gpaRequirement(nullRecord).kind, 'absent');
  assert.equal(gpaRequirement(proseRecord).kind, 'prose');
  assert.equal(gpaRequirement(noneStatedRecord).kind, 'none-stated');
  assert.equal(gpaRequirement({}).kind, 'absent');
  assert.equal(gpaRequirement(null).kind, 'absent');
});

test('a numeric requirement with no recorded scale is carried as an unknown scale, never assumed /4.0', () => {
  const req = gpaRequirement(unscaledRecord);
  assert.equal(req.kind, 'numeric');
  assert.equal(req.value, 3.0);
  assert.equal(req.scale, null, 'a scale was assumed for a requirement that does not record one');
});

test('NEGATIVE CONTROL: an unscaled requirement is not compared against a scaled value', () => {
  // Every record in the catalog today is in this state: a number with no scale.
  // Assuming the reader's scale would turn a /5.0 threshold into a /4.0 one and
  // silently fail an eligible applicant.
  const out = compareGpa(unscaledRecord, { value: 4.5, scale: 4 });
  assert.equal(out.verdict, 'unknown');
  assert.equal(out.reason, 'no-scale');
});

test('THE CORE INVARIANT: the default verdict is unknown, never meets', () => {
  // A record whose requirement is not recorded must never come back "meets",
  // no matter what value the reader has confirmed.
  const out = compareGpa(nullRecord, { value: 4, scale: 4 });
  assert.equal(out.verdict, 'unknown');
  assert.equal(out.reason, 'not-recorded');
});

test('an unconfirmed value yields unknown, not a comparison against nothing', () => {
  const out = compareGpa(numericRecord, null);
  assert.equal(out.verdict, 'unknown');
  assert.equal(out.reason, 'no-value');
});

test('a confirmed value on the same scale is actually compared', () => {
  const above = compareGpa(numericRecord, { value: 3.62, scale: 4 });
  assert.equal(above.verdict, 'meets');

  const below = compareGpa(numericRecord, { value: 2.5, scale: 4 });
  assert.equal(below.verdict, 'fails');
});

test('exactly at the threshold counts as meeting it', () => {
  const edge = compareGpa(numericRecord, { value: 3.0, scale: 4 });
  assert.equal(edge.verdict, 'meets');
});

test('a value with no scale cannot be compared, even against a real threshold', () => {
  const out = compareGpa(numericRecord, { value: 3.62, scale: null });
  assert.equal(out.verdict, 'unknown');
  assert.equal(out.reason, 'no-scale');
});

test('a value on a different scale is unknown, not coerced', () => {
  // 3.62 on a 4.0 scale is not compared against a threshold written on 5.0.
  const scaleFive = { id: 'z', eligibility: { gpa_minimum: 4.0, gpa_scale: 5 } };
  const out = compareGpa(scaleFive, { value: 3.62, scale: 4 });
  assert.equal(out.verdict, 'unknown');
  assert.equal(out.reason, 'unresolvable');
  assert.match(out.sentence, /5-point scale/);
});

test('"no threshold stated" and "not recorded" are different sentences', () => {
  const none = compareGpa(noneStatedRecord, { value: 3.62, scale: 4 });
  const absent = compareGpa(nullRecord, { value: 3.62, scale: 4 });

  assert.equal(none.verdict, 'unknown');
  assert.equal(absent.verdict, 'unknown');
  // Same verdict, different fact — the sentences must not be interchangeable.
  assert.notEqual(none.sentence, absent.sentence);
  assert.equal(none.reason, 'no-requirement');
  assert.equal(absent.reason, 'not-recorded');
  assert.match(none.sentence, /states there is no GPA threshold/);
});

test('a prose requirement hands the rule back instead of choosing a branch', () => {
  const out = compareGpa(proseRecord, { value: 3.62, scale: 4 });
  assert.equal(out.verdict, 'unknown');
  assert.equal(out.reason, 'unresolvable');
  assert.ok(out.quote.includes('2.64/4.0'), 'the rule was not handed back');
});

test('compareAllGpa covers every record and never throws on a sparse catalog', () => {
  const out = compareAllGpa([numericRecord, nullRecord, proseRecord, noneStatedRecord], { value: 3.62, scale: 4 });
  assert.equal(Object.keys(out).length, 4);
  assert.equal(out.x.verdict, 'meets');
  assert.equal(out.y.verdict, 'unknown');
  assert.equal(out.gks.verdict, 'unknown');
  assert.equal(out.pec.verdict, 'unknown');
  // And an empty or missing catalog is not a crash.
  assert.deepEqual(compareAllGpa([], { value: 3.62, scale: 4 }), {});
  assert.deepEqual(compareAllGpa(null, null), {});
});

test('every verdict has a label, and the labels are distinct', () => {
  const labels = Object.values(VERDICT_LABEL);
  assert.equal(new Set(labels).size, labels.length);
});

test('the labels App.jsx renders match the authoritative labels in compare.js', () => {
  // `App.jsx` carries its own copy of these three strings so that `compare.js`
  // stays inside the lazily-loaded document panel — a reader who has confirmed
  // no GPA never downloads the comparison engine. That duplication is a real
  // drift risk, so it is asserted rather than trusted: this reads the App
  // source and fails if the two maps disagree.
  const source = readFileSync(new URL('./App.jsx', import.meta.url), 'utf8');
  const match = /const GPA_VERDICT_LABEL = \{([^}]*)\}/.exec(source);
  assert.ok(match, 'App.jsx no longer declares GPA_VERDICT_LABEL');
  for (const [verdict, label] of Object.entries(VERDICT_LABEL)) {
    assert.ok(
      match[1].includes(`${verdict}: '${label}'`),
      `App.jsx's label for "${verdict}" does not match compare.js's "${label}"`,
    );
  }
});
