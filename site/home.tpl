<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>PVC Furniture Ahmedabad | Modular Kitchen &amp; Wardrobe - Shree Krushn</title>
<meta name="description" content="Shree Krushn PVC Furniture, Nikol, Ahmedabad. Modular kitchen, wardrobe, TV unit, pooja mandir - 100% waterproof, termite proof, fitted in about 10 days. Free site visit and a written estimate." />
<link rel="icon" type="image/png" href="/icon-192.png" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,600&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
<style>
{CSS}
</style>
</head>
<body>

<nav id="nav"><div class="nv">
  <a class="bd" href="#top"><img src="/boot-mark.jpg" width="38" height="38" alt="" />
    <span><b><span class="full">Shree Krushn PVC Furniture</span><span class="short">Shree Krushn</span></b><i class="full">Nikol, Ahmedabad</i><i class="short">PVC Furniture &#183; Nikol</i></span></a>
  <div class="nl"><a href="#work">Collections</a><a href="#why">Why PVC</a><a href="#reviews">Reviews</a><a href="#contact">Contact</a></div>
  <a class="nbtn" href="/app">Book a free visit</a>
</div></nav>

<div id="top" class="hero">
  <div class="sls">{SLIDES}</div>
  <div class="dots">{DOTS}</div>
  <div class="hi">
    <div class="lbl">Nikol, Ahmedabad</div>
    <h1>We furnish <em>the dreams</em></h1>
    <p>Modular kitchens, wardrobes and full-home interiors in 100% virgin PVC.
       Waterproof, termite proof, and fitted in about ten days.</p>
    <div class="acts">
      <a class="b b1" href="/app">Book a free visit</a>
      <a class="b b2" href="/app">Instant estimate</a>
    </div>
  </div>
</div>

<div class="strap"><p>{N} designs delivered across Ahmedabad</p>
  <span>Kitchen &#183; Wardrobe &#183; TV Unit &#183; Mandir &#183; Partition</span></div>

<div class="stats"><ul>
  <li><b>{N}</b><span>designs completed</span></li>
  <li><b>10 days</b><span>full home fitting</span></li>
  <li><b>2 years</b><span>maintenance warranty</span></li>
  <li><b>100%</b><span>virgin PVC</span></li>
</ul></div>

<section id="work"><div class="wrap">
  <div class="lbl">Collections</div><div class="rule"></div>
  <h2>Every room, considered</h2>
  <p class="lede">Each collection opens the full album of finished work - the same photographs we show at a site visit.</p>
  <div class="cols">{CARDS}</div>
</div></section>

<section style="padding-top:0">
  <div class="wrap"><div class="lbl">From the workshop</div><div class="rule"></div>
  <h2>Recently delivered</h2>
  <p class="lede">Swipe through a few. The albums hold the rest.</p></div>
  <div class="rail">{RAIL}</div>
  <div class="wrap" style="margin-top:26px">
    <a class="b b4" style="display:inline-block" href="{VIDEO}" target="_blank" rel="noopener">Watch the work on video</a>
  </div>
</section>

<section id="why" class="why"><div class="wrap">
  <div class="lbl">The material</div><div class="rule"></div>
  <h2>Why PVC, not plywood</h2>
  <p class="lede">Kitchen platforms, washbasin cabinets and monsoon damp are what finish wooden furniture early.</p>
  <div class="wg">{WHY}</div>
</div></section>

<section class="visit"><div class="wrap">
  <div class="lbl">No charge, no obligation</div>
  <h2>Let us measure your home</h2>
  <p>Tell us which rooms you have in mind. We visit, measure, and send a written estimate as a PDF - itemised, with nothing hidden.</p>
  <div class="acts">
    <a class="b b1" href="/app">Book a free visit</a>
    <a class="b b2" href="{WA}" target="_blank" rel="noopener">WhatsApp us</a>
  </div>
</div></section>

<section id="reviews"><div class="wrap">
  <div class="lbl">Customers</div><div class="rule"></div>
  <h2>In their own words</h2>
  <div class="revs">{REVS}</div>
</div></section>

<section id="contact" class="ct"><div class="wrap">
  <div class="lbl">Visit us</div><div class="rule"></div>
  <h2>Nikol, Ahmedabad</h2>
  <div class="cg">
    <div><b>Head office</b><p>Nikol, Ahmedabad<br />Gujarat 382350</p></div>
    <div><b>Owner</b><p>Ravi Vasoya</p></div>
    <div><b>Phone</b><a href="tel:{TEL}">{PHONE}</a><br /><a href="tel:+919512318775">{PHONE2}</a></div>
    <div><b>Already a customer?</b><a href="/app">Open your app &rarr;</a></div>
  </div>
  <div class="soc">{SOCS}</div>
</div></section>

<footer><b>Shree Krushn PVC Furniture</b> &#183; Nikol, Ahmedabad &#183; We furnish the dreams</footer>

<script>
(function () {
  var nav = document.getElementById('nav');
  var hero = document.getElementById('top');
  function solid() { nav.classList.toggle('solid', window.scrollY > hero.offsetHeight - 90); }
  window.addEventListener('scroll', solid, { passive: true }); solid();

  var sl = [].slice.call(document.querySelectorAll('.sl'));
  var dots = [].slice.call(document.querySelectorAll('.d'));
  var i = 0, paused = false;
  function show(n) {
    i = (n + sl.length) % sl.length;
    sl.forEach(function (s, k) { s.classList.toggle('on', k === i); });
    dots.forEach(function (d, k) { d.classList.toggle('on', k === i); });
  }
  dots.forEach(function (d) { d.addEventListener('click', function () { paused = true; show(+d.dataset.i); }); });
  // A hero that keeps moving while somebody is reading it is a nuisance;
  // the first tap on a dot hands control over for good.
  var t = setInterval(function () { if (!paused) show(i + 1); }, 5200);
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) clearInterval(t);
})();
</script>
</body>
</html>
