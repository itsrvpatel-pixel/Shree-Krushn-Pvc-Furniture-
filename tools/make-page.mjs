// Builds a new website page from an existing one.
//
// Every page on this site is a self-contained 23KB file - its own CSS,
// its own JSON-LD, its own nav and footer. That is good for speed and
// terrible for writing a new one by hand, so this takes a finished
// page as the skeleton and swaps everything that is page-specific.
//
// The content is passed in whole, not templated from a name. A page
// built by swapping one word into a template is a page that says
// nothing specific, and Google ranks it for nothing specific - which
// is the entire failure mode of "make a page for every search".
//
//   node tools/make-page.mjs
import fs from 'node:fs';
import path from 'node:path';

const SITE = path.join(process.cwd(), 'site');
const SKELETON = path.join(SITE, 'pvc-study-table-ahmedabad.html');
const HOST = 'https://www.shreekrushnpvcfurniture.com';

const esc = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const skeleton = fs.readFileSync(SKELETON, 'utf8');

// Everything between these two markers is the page's own content; the
// nav above and the contact block below are shared and kept as-is.
const HEAD = '<main>\n';
const TAIL = '\n<section id="contact" class="w">';
const headIdx = skeleton.indexOf(HEAD) + HEAD.length;
const tailIdx = skeleton.indexOf(TAIL);
if (headIdx < HEAD.length || tailIdx < 0) {
  console.error('make-page: the skeleton page has changed shape - markers not found');
  process.exit(1);
}
const shellTop = skeleton.slice(0, headIdx);
const shellBottom = skeleton.slice(tailIdx);

// The business record, lifted verbatim from the skeleton so every page
// on the site makes the identical claim about name, address and phone.
// Google treats a mismatch between them as two different businesses,
// so this must never be retyped per page.
const business = (() => {
  const m = skeleton.match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
  if (!m) { console.error('make-page: the skeleton has no JSON-LD'); process.exit(1); }
  const node = JSON.parse(m[1])['@graph'].find((x) => x && x.provider && x.provider.address);
  if (!node) { console.error('make-page: cannot find the business record in the skeleton'); process.exit(1); }
  return node.provider;
})();

function build(p) {
  let html = shellTop;
  // head: title, description, canonical, og, twitter
  html = html
    .replace(/<title>[^<]*<\/title>/, '<title>' + esc(p.title) + '</title>')
    .replace(/(<meta name="description" content=")[^"]*(")/, '$1' + esc(p.desc) + '$2')
    .replace(/(<link rel="canonical" href=")[^"]*(")/, '$1' + HOST + '/' + p.slug + '$2')
    .replace(/(<meta property="og:title" content=")[^"]*(")/, '$1' + esc(p.title) + '$2')
    .replace(/(<meta property="og:description" content=")[^"]*(")/, '$1' + esc(p.desc) + '$2')
    .replace(/(<meta property="og:url" content=")[^"]*(")/, '$1' + HOST + '/' + p.slug + '$2')
    .replace(/(<meta property="og:image" content=")[^"]*(")/, '$1' + HOST + '/og/' + (p.og || 'index') + '.jpg$2')
    .replace(/(<meta property="og:image:alt" content=")[^"]*(")/, '$1' + esc(p.h1) + ' - Shree Krushn PVC Furniture$2');

  // JSON-LD: the service, the breadcrumb, and the questions Google is
  // already showing for these searches.
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Service', serviceType: p.serviceType,
        provider: business,
        areaServed: [{ '@type': 'City', name: 'Ahmedabad' }],
        description: p.desc,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: HOST + '/' },
          { '@type': 'ListItem', position: 2, name: p.h1, item: HOST + '/' + p.slug },
        ],
      },
      ...(p.faq && p.faq.length ? [{
        '@type': 'FAQPage',
        mainEntity: p.faq.map((f) => ({
          '@type': 'Question', name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      }] : []),
    ],
  };
  html = html.replace(/<script type="application\/ld\+json">.*?<\/script>/s,
    '<script type="application/ld+json">' + JSON.stringify(ld) + '</script>');

  const faqHtml = (p.faq || []).map((f) =>
    '<div class="wi"><h3>' + esc(f.q) + '</h3><p>' + esc(f.a) + '</p></div>').join('');

  const body = [
    '<div class="w chead">',
    '  <div class="crumb"><a href="/">Home</a> &#8250; ' + esc(p.h1) + '</div>',
    '  <h1>' + esc(p.h1) + '</h1>',
    '  <p class="intro">' + esc(p.intro) + '</p>',
    '  <div class="cta">',
    '    <a class="btn b1" href="/app?do=visit">Book a free visit</a>',
    '    <a class="btn b2" href="/app?do=estimate">Instant estimate</a>',
    '  </div>',
    '  <div class="chips" tabindex="0" role="group" aria-label="Key facts">',
    p.chips.map((c) => '    <span class="chip">' + c + '</span>').join('\n'),
    '  </div>',
    '</div>',
    p.sections,
    p.faq && p.faq.length ? [
      '<div class="why"><div class="w">',
      '  <div class="eyebrow">Common questions</div>',
      '  <h2>What people ask us</h2>',
      '  <div class="wgrid">' + faqHtml + '</div>',
      '</div></div>',
    ].join('\n') : '',
  ].join('\n');

  fs.writeFileSync(path.join(SITE, p.slug + '.html'), html + body + shellBottom);
  console.log('  ' + p.slug + '.html');
}

export { build, esc };
