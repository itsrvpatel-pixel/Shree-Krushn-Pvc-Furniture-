// Which screen a visitor asked for on the website before arriving at the
// app. Its own file so the mapping can be tested against the app's real
// tab keys - see test/arrivalIntent.test.mjs, which fails if a tab is
// ever renamed and this is left behind.

// Which screen the visitor asked for on the website before arriving.
//
// Every button on the site pointed at /app - "Book a free visit",
// "Instant estimate", "Open app" alike - so all three opened the same
// register-or-login screen and whatever the button promised was gone by
// the time the customer got there. They now carry ?do=visit and
// ?do=estimate, and land on the screen they name.
//
// Read once here, at module load, before anything renders: the customer
// usually has to register or log in first, which takes a while and
// mounts a good deal, and the intent has to outlive that. Module state,
// so a reload starts clean, and taken out of the address bar as soon as
// it is read so the link anyone copies afterwards is the plain one.
export const ARRIVAL_TABS = { visit: 'appointment', estimate: 'estimate', designs: 'gallery' };

let pendingArrivalTab = (() => {
  try {
    const url = new URL(window.location.href);
    const tab = ARRIVAL_TABS[url.searchParams.get('do')];
    if (!tab) return null;
    url.searchParams.delete('do');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    return tab;
  } catch {
    return null;
  }
})();

// One use only, so logging out and back in does not drop the customer
// on the estimate screen again long after they came for it.
export function takeArrivalTab() {
  const tab = pendingArrivalTab;
  pendingArrivalTab = null;
  return tab;
}
