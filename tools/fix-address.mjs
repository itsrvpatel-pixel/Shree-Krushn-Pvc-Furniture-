/* One address, written the same way everywhere.
 *
 * The owner settled it: the Mahavir Complex address is right, and the
 * area line carries both names - Nikol and Nava Naroda - because the
 * locality is known by both and customers search for each.
 *
 * Three different street addresses had grown up in the project:
 *
 *   "...Bapa Sitaram Chowk, Nava Naroda"       most website pages
 *   "Mahavir Complex, Hari Villa Road, ..."    four pages, half of it
 *   "Nikol"                                     the app shell
 *
 * Google matches a business across the web by name, address and phone
 * being identical. Three spellings of one address is the reason
 * Justdial and IndiaMart outrank this site on its own name, so the
 * point here is not the word "Nikol" - it is that every copy finally
 * says exactly the same thing.
 *
 * The full postal address keeps both names. Short decorative labels -
 * the chip under the heading, image alt text, meta descriptions - say
 * "Nikol, Ahmedabad", which is the shorter of the two and the one the
 * site was under-using.
 *
 * areaServed is left alone on purpose: it already lists Nikol and Nava
 * Naroda as two separate places, which is correct and is not the same
 * field as the address.
 *
 * Run: node tools/fix-address.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const STREET = 'Mahavir Complex, Hari Villa Road, near Honda Showroom, Bapa Sitaram Chowk, Nikol, Nava Naroda';
export const LOCALITY = 'Ahmedabad';
// Google's own listing geocodes the pin on Hari Villa Road to 382345,
// and that is the record a customer navigates by and the local pack is
// built from. The site followed 380038 for months; where the two
// disagree, the one Google holds wins, because matching it is the
// entire point of writing the address the same way everywhere.
export const PIN = '382345';
export const AREA_LINE = 'Nikol, Nava Naroda, Ahmedabad';
export const SHORT = 'Nikol, Ahmedabad';

// Ordered: the street address goes first so the shorter rules below
// cannot eat part of it.
const RULES = [
  // the half-written street address, brought up to the full one
  ['Mahavir Complex, Hari Villa Road, Nava Naroda', STREET],
  // the app shell, which had only the area name where a street belongs
  ['"streetAddress": "Nikol"', '"streetAddress": "' + STREET + '"'],
  // the full street address everywhere else
  ['Mahavir Complex, Hari Villa Road, near Honda Showroom, Bapa Sitaram Chowk, Nava Naroda', STREET],

  // the visible contact block
  ['Bapa Sitaram Chowk<br />Nava Naroda, Ahmedabad<br />Gujarat 380038',
   'Bapa Sitaram Chowk<br />' + AREA_LINE + '<br />Gujarat ' + PIN],
  // the heading above it, and the footer line
  ['<h2>Nava Naroda, Ahmedabad</h2>', '<h2>' + AREA_LINE + '</h2>'],
  ['&#183; Nava Naroda, Ahmedabad &#183;', '&#183; ' + AREA_LINE + ' &#183;'],

  // the pincode itself, wherever it already reads correctly
  ['Gujarat 380038', 'Gujarat ' + PIN],
  ['"postalCode": "380038"', '"postalCode": "' + PIN + '"'],
  ['"postalCode":"380038"', '"postalCode":"' + PIN + '"'],

  // short labels
  ['<span class="chip">Nava Naroda, Ahmedabad</span>', '<span class="chip">' + SHORT + '</span>'],
  ['Shree Krushn PVC Furniture, Nava Naroda, Ahmedabad', 'Shree Krushn PVC Furniture, ' + SHORT],
  ['PVC furniture, Nava Naroda, Ahmedabad', 'PVC furniture, ' + SHORT],
];

// The constants above are imported by the test, which must not trigger a
// rewrite just by reading them.
const RUN_DIRECTLY = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

const targets = [
  ...fs.readdirSync(path.join(root, 'site')).filter((f) => f.endsWith('.html')).map((f) => 'site/' + f),
  'index.html',
  'tools/a.tpl', 'tools/cat.tpl', 'tools/cats.py', 'tools/build_home.py',
];

let touched = 0, edits = 0;
if (RUN_DIRECTLY) for (const rel of targets) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) continue;
  const before = fs.readFileSync(file, 'utf8');
  let after = before;
  for (const [from, to] of RULES) {
    if (after.includes(to) && !after.includes(from)) continue; // already done
    const parts = after.split(from);
    if (parts.length > 1) { edits += parts.length - 1; after = parts.join(to); }
  }
  if (after !== before) { fs.writeFileSync(file, after); touched++; }
}

// Anything still saying the old area without Nikol beside it would be a
// rule this script does not know about, which is exactly the drift it
// exists to stop. areaServed is the one legitimate place.
const leftovers = [];
if (RUN_DIRECTLY) for (const rel of targets) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) continue;
  const s = fs.readFileSync(file, 'utf8');
  for (const m of s.matchAll(/.{0,60}Nava Naroda.{0,30}/gs)) {
    const t = m[0].replace(/\s+/g, ' ');
    const ok = t.includes('Nikol, Nava Naroda')              // the address
      || /"name": ?"Nava Naroda, Ahmedabad"/.test(t)          // areaServed
      || /name="Naroda"|'Naroda'/.test(t)
      || t.includes('including Nikol and Nava Naroda')        // areas we serve, not the address
      || /name="Naroda"/.test(t);
    if (!ok) leftovers.push(rel + ' | ' + t.trim());
  }
}

if (RUN_DIRECTLY) console.log('fix-address: ' + edits + ' replacements across ' + touched + ' files');
if (RUN_DIRECTLY && leftovers.length) {
  console.error('still unaccounted for:');
  for (const l of leftovers.slice(0, 12)) console.error('  ' + l);
  process.exitCode = 1;
}
