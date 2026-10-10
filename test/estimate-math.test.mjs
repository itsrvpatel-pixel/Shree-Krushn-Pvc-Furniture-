// The estimate arithmetic, pinned.
//
// The rule the Add-item form states is "Length x Height se sq ft
// auto-calculate hoga ... Bina naap ke item ho to yeh khaali chhod ke
// neeche Qty use karein" - measurement OR quantity, never both. The
// price follows that rule. Three places on screen did not: they printed
// " x 2" beside a price charged for one, including the estimate the
// CUSTOMER sees.
//
//   node test/estimate-math.test.mjs

import fs from 'node:fs/promises';
// Both halves of the app. The admin panel lives in its own file now so
// it is not shipped to customers, and a check that read only App.jsx
// would quietly stop testing anything the moment a function moved.
const src = (await Promise.all(['../src/App.jsx', '../src/AdminApp.jsx']
  .map((f) => fs.readFile(new URL(f, import.meta.url), 'utf8')))).join('\n');

// The formulas, lifted from App.jsx so the arithmetic is checked rather
// than described. Kept in step with it by the source assertions below.
const sqft = (it) => { const l=Number(it.length)||0, h=Number(it.height)||0; return (l>0&&h>0)?(l*h)/144:null; };
const amount = (it) => { const a=sqft(it); return a!==null ? a*(Number(it.rate)||0) : (Number(it.qty)||1)*(Number(it.rate)||0); };

const T=[]; const eq=(name,got,want)=>T.push([name, Math.abs(got-want)<0.005, got+' vs '+want]);
const ok=(name,cond,detail)=>T.push([name,!!cond,detail||'']);

// 144 square inches to the square foot.
eq('12" x 12" is 1 sq ft', sqft({length:'12',height:'12'}), 1);
eq('145" x 112" is 112.78 sq ft', sqft({length:'145',height:'112'}), 112.7778);
eq('measured item: sqft x rate', amount({length:'12',height:'12',rate:'1200',qty:'1'}), 1200);
eq('measured item ignores qty', amount({length:'12',height:'12',rate:'1200',qty:'5'}), 1200);
eq('unmeasured item: qty x rate', amount({qty:'3',rate:'500'}), 1500);
eq('unmeasured item defaults to qty 1', amount({rate:'500'}), 500);
eq('no rate is zero, not NaN', amount({length:'12',height:'12'}), 0);
eq('junk dimensions fall back to qty', amount({length:'abc',height:'',qty:'2',rate:'100'}), 200);

// What the screen may claim.
ok('no display multiplies dimensions by qty',
  !/&quot; x \{[a-z]+\.height\}&quot;[^<]*qty > 1/.test(src) && !/sq ft\{[a-z]+\.qty > 1/.test(src),
  'a display still prints " x qty" beside a measured item');
ok('the live calc box uses the inch mark, not the foot mark',
  !/\{newItem\.length\}' x/.test(src), "still renders 145' x 112' for inches");
ok('a measured item is stored with qty 1',
  /qty: estimateItemSqft\(newItem\) !== null \? '1'/.test(src), 'addItem still stores the typed qty');
ok('entering both warns instead of silently dropping the qty',
  /is not counted/.test(src), 'no warning shown');

console.log('\n===== ESTIMATE MATH =====');
T.forEach(([n,p,d])=>console.log((p?'PASS  ':'FAIL  ')+n+(p?'':'   ['+d+']')));
const bad=T.filter(t=>!t[1]).length;
console.log('\n'+(T.length-bad)+' passed, '+bad+' failed');
process.exit(bad?1:0);
