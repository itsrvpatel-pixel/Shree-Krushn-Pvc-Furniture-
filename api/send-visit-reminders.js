// Vercel Cron Job - runs automatically once a day (see vercel.json's
// "crons" entry), no manual trigger needed. This is what makes visit
// reminders genuinely "automatic": Vercel itself calls this endpoint
// on schedule, server-side, whether or not anyone has the app open.
//
// Reads tomorrow's confirmed appointments straight from Firestore
// (the same 'app_data' collection the app itself uses) and sends a
// push notification to each customer who has notifications enabled,
// plus a one-line daily summary to admin devices - all via the same
// Firebase Admin SDK / FIREBASE_SERVICE_ACCOUNT setup api/send-push.js
// already uses (see that file's comments for the one-time setup this
// depends on - nothing extra to configure here).
//
// SECURITY: Vercel automatically sends an Authorization: Bearer
// <CRON_SECRET> header on every real cron invocation, with
// CRON_SECRET auto-populated as a project environment variable - this
// is checked below so the endpoint can't be triggered by anyone just
// guessing the URL.

import admin from 'firebase-admin';

function getAdminApp() {
  if (admin.apps.length > 0) return admin.apps[0];
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable is not set in Vercel');
  const serviceAccount = JSON.parse(raw);
  return admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

// Same day-only comparison the app's own daysUntil/isSameLocalDay use -
// two ISO timestamps are "the same day" if their calendar date matches,
// ignoring time-of-day, since an appointment's exact time doesn't
// matter for "is this tomorrow" - only the date does.
function isSameCalendarDay(isoA, isoB) {
  if (!isoA || !isoB) return false;
  const a = new Date(isoA), b = new Date(isoB);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default async function handler(req, res) {
  const authHeader = req.headers.authorization || '';
  if (authHeader !== 'Bearer ' + process.env.CRON_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    getAdminApp();
  } catch (e) {
    res.status(500).json({ error: 'Server not configured: ' + e.message });
    return;
  }

  try {
    const db = admin.firestore();
    const jobsSnap = await db.collection('app_data').doc('jobs').get();
    const jobs = jobsSnap.exists ? JSON.parse(jobsSnap.data().value || '[]') : [];

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowsVisits = jobs.filter((j) =>
      j.appointment &&
      (j.appointment.status === 'confirmed' || j.appointment.status === 'rescheduled') &&
      isSameCalendarDay(j.appointment.confirmedDate, tomorrow.toISOString())
    );

    let customerRemindersSent = 0;
    for (const job of tomorrowsVisits) {
      if (!job.customerPushToken) continue; // this customer never enabled push - skip, nothing to send to
      try {
        await admin.messaging().send({
          token: job.customerPushToken,
          notification: {
            title: 'Visit Reminder',
            body: 'Namaste ' + job.customerName + ', kal aapki visit hai' + (job.appointment.confirmedTime ? (' - ' + job.appointment.confirmedTime) : '') + '.',
          },
        });
        customerRemindersSent++;
      } catch (e) {
        // A single bad/expired token shouldn't stop reminders going out
        // to everyone else - logged, not thrown.
        console.error('Reminder failed for job', job.id, e.message);
      }
    }

    // A short daily summary to admin devices too, so tomorrow's visit
    // count is visible without opening the app first thing.
    if (tomorrowsVisits.length > 0) {
      const tokensSnap = await db.collection('app_data').doc('admin_push_tokens').get();
      const adminTokens = tokensSnap.exists ? JSON.parse(tokensSnap.data().value || '[]').map((t) => t.token) : [];
      if (adminTokens.length > 0) {
        await admin.messaging().sendEachForMulticast({
          tokens: adminTokens,
          notification: {
            title: 'Kal Ki Visits',
            body: 'Kal ' + tomorrowsVisits.length + ' visit' + (tomorrowsVisits.length !== 1 ? 's' : '') + ' scheduled hain.',
          },
        });
      }
    }

    res.status(200).json({
      tomorrowsVisitsCount: tomorrowsVisits.length,
      customerRemindersSent,
    });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to send visit reminders' });
  }
}
