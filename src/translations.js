/* --- English dictionary -------------------------------------------
   Keyed by the exact Hinglish string that appears in the JSX. See
   i18n.js for why the sentence itself is the key rather than an
   invented id. A string missing from here renders as Hinglish, so
   this file can be filled in over time without ever breaking a
   screen.

   Only complete, standalone pieces of text live here. The app also
   builds some sentences by concatenation ('... ne extra kaam approve
   kiya: ' + name); those fragments are deliberately NOT translated as
   fragments, because English needs a different word order and a
   half-translated sentence reads worse than an untranslated one. They
   are converted properly, with tf() placeholders, as each one is
   reworked.
------------------------------------------------------------------- */

export const EN = {
  // --- Login and registration ---
  'Naye Customer - Register karein': 'New customer - register',
  'Pehle se registered? Login karein': 'Already registered? Log in',
  'Ye number register nahi hai. Pehle register karein.': 'This number is not registered. Please register first.',
  'Sahi 10-digit mobile number daalein': 'Enter a valid 10-digit mobile number',
  'Sahi 10-digit mobile number daalein (jaise 98765 43210)': 'Enter a valid 10-digit mobile number (e.g. 98765 43210)',
  'Naam daalein': 'Enter your name',
  'OTP daalein': 'Enter the OTP',
  'OTP dobara bhejein': 'Resend OTP',
  'Galat OTP - dobara check karein': 'Wrong OTP - please check and try again',
  'Galat PIN': 'Wrong PIN',
  'OTP bhej nahi paye - thodi der baad try karein ya admin se contact karein.': 'Could not send the OTP - try again shortly or contact the admin.',
  'OTP dobara bhej nahi paye - thodi der baad try karein.': 'Could not resend the OTP - please try again shortly.',
  'Demo mode - real SMS nahi jaata. Aapka OTP:': 'Demo mode - no real SMS is sent. Your OTP:',
  'Kisne refer kiya? (optional)': 'Who referred you? (optional)',
  'Jaise Rajkot': 'e.g. Rajkot',
  'Check kar rahe hain...': 'Checking...',

  // --- Home and navigation ---
  'Aapke order ki current stage': 'The current stage of your order',
  'Aapki visit': 'Your visit',
  'Aapne request kiya': 'You requested',
  'Admin ne confirm ki hai': 'Confirmed by the admin',
  'Admin ne naya time diya hai': 'The admin has proposed a new time',
  'Visit book karna baaki hai': 'Visit not booked yet',
  'Visit confirm karna baaki hai': 'Visit not confirmed yet',
  'Baaki Hai': 'Pending',
  'Aa gaya': 'Arrived',
  'Order ho gaya': 'Ordered',
  'Confirm ho gaya': 'Confirmed',
  'Repair Ho Raha Hai': 'Under repair',
  'App Doston Ko Bhejein': 'Share the app with friends',
  'Wapas jaayein': 'Go back',
  'App dobara kholein': 'Reopen the app',
  'Load ho raha hai...': 'Loading...',
  'Panel khul raha hai...': 'Opening...',
  'Load nahi hui': 'Could not load',
  'Dobara koshish karein': 'Try again',
  'Kuch gadbad ho gayi': 'Something went wrong',
  'Is screen mein dikkat aa gayi.': 'This screen ran into a problem.',
  'Aapka data surakshit hai': 'Your data is safe',
  'Data load karne mein dikkat hui - page refresh karein': 'Could not load the data - please refresh the page',
  'Internet connection nahi mil raha. Wi-Fi ya mobile data on karke dobara koshish karein.': 'No internet connection. Turn on Wi-Fi or mobile data and try again.',
  'Net dheema lag raha hai. Thoda ruk jaayein, ya dobara koshish karein.': 'Your connection seems slow. Please wait a moment, or try again.',
  'internet check karein aur dobara try karein': 'check your internet and try again',

  // --- Appointment / visit ---
  'Appointment Book Karein': 'Book an appointment',
  'Visit Book Karein': 'Book a visit',
  'Visit Confirm Karein': 'Confirm the visit',
  'Ye Time Theek Hai': 'This time works',
  'Aur Visit Chahiye?': 'Need another visit?',
  'Site visit ya consultation ke liye apni details batayein.': 'Share your details for a site visit or consultation.',
  'Kis liye visit chahiye...': 'What is the visit for...',
  'Date select karein': 'Select a date',
  'Date aur address zaroori hai': 'Date and address are required',
  'Appointment book ho gayi': 'Appointment booked',
  'Appointment confirm ho gayi': 'Appointment confirmed',
  'Appointment request bhej di gayi': 'Appointment request sent',
  'Visit request bhej di gayi': 'Visit request sent',
  'Time confirm ho gaya': 'Time confirmed',
  'Kaunsi branch se contact karein?': 'Which branch should we contact you from?',

  // --- Requirements ---
  'Aapki Requirements': 'Your requirements',
  'Abhi koi requirement add nahi ki.': 'No requirements added yet.',
  'Kya chahiye, likhein': 'Describe what you need',
  'Furniture mein kya banana hai, detail mein batayein': 'Describe the furniture you want, in detail',
  'Kya kya kaam karvana hai? (select karein)': 'What work do you need? (select)',
  'Category Chunein': 'Choose a category',
  'Category select karein': 'Select a category',
  'Length aur Height dono bharein': 'Fill in both length and height',
  'Photo attach karein (optional)': 'Attach a photo (optional)',
  'Apne phone se koi photo daal sakte hain - jaisa design chahiye.': 'You can add a photo from your phone showing the design you want.',
  'Camera se click karein ya gallery se ek ya zyada photos select karein': 'Take a photo, or pick one or more from your gallery',
  'Koi special instructions...': 'Any special instructions...',
  'Add Karein': 'Add',
  'Project mein add ho gaya': 'Added to your project',

  // --- Gallery and favourites ---
  'Gallery load ho rahi hai...': 'Loading the gallery...',
  'Is category mein abhi koi photo nahi hai.': 'No photos in this category yet.',
  'Koi photo match nahi hui.': 'No photos matched.',
  'Gallery mein photo ke star icon se favorite add karein.': 'Tap the star on any gallery photo to add it to your favourites.',
  'Photo load ho rahi hain... Gallery khulne ke baad yahan dikhengi.': 'Loading your photos... they will appear here once the gallery opens.',
  'Gallery se save kiye gaye designs - project mein add karein.': 'Designs you saved from the gallery - add them to your project.',
  'Design save ho gaya': 'Design saved',
  'Design saved list se hataya': 'Removed from your saved designs',
  'Favorites se hataya gaya': 'Removed from favourites',
  'Swipe left/right ya arrows use karein - zoom ke liye double-tap karein': 'Swipe left or right, or use the arrows - double-tap to zoom',
  'Zoom ke liye double-tap karein': 'Double-tap to zoom',
  'Photo load nahi ho payi': 'Could not load the photo',
  'Photo Add Karein': 'Add a photo',
  'Gallery Mein Bhejein': 'Send to the gallery',
  'Gallery ke liye bhej diya - admin approve karenge': 'Sent to the gallery - the admin will approve it',
  'Sirf image file select karein': 'Please select an image file',
  'Sirf image files select karein': 'Please select image files',
  'Photo bahut badi hai, chhoti photo try karein': 'That photo is too large - please try a smaller one',
  'Photo padhi nahi ja saki': 'The photo could not be read',
  'Photo process nahi ho payi': 'The photo could not be processed',
  'Photo upload nahi ho payi, dobara try karein': 'The photo could not be uploaded - please try again',
  'Caption (optional, sabpar lagega)': 'Caption (optional, applies to all)',

  // --- Estimate ---
  'Abhi koi estimate nahi bana hai.': 'No estimate has been prepared yet.',
  'Material Options Compare Karein': 'Compare material options',
  'Jo aapke budget mein aaye, wo option choose karein - wahi aapka final estimate ban jayega.': 'Choose whichever option fits your budget - that becomes your final estimate.',
  'Ye Option Choose Karein': 'Choose this option',
  'Item-wise dekhein (': 'View item by item (',
  'Item list band karein': 'Close the item list',
  'Admin/customer ne jo final kiya hai, yahan dikhega.': 'Whatever the admin or customer finalises appears here.',
  'Approve - Kaam Shuru Karein': 'Approve - start the work',
  'Aapne ye estimate approve kar diya hai - kaam shuru ho jayega.': 'You have approved this estimate - work will begin.',
  'Aapne ye estimate cancel kar diya hai.': 'You have cancelled this estimate.',
  'Estimate approve ho gaya': 'Estimate approved',
  'Estimate cancel ho gaya': 'Estimate cancelled',
  'Approved - sirf admin change kar sakta hai': 'Approved - only the admin can change it',
  'Request naya / edit karein': 'Request a change',
  'Kya change chahiye, likhein...': 'Describe the change you want...',
  'Change request bhej di gayi': 'Change request sent',
  'option select ho gaya': 'option selected',
  'Calculator clear ho gaya': 'Calculator cleared',
  'Clear Karein': 'Clear',
  'Amount daalein': 'Enter an amount',
  'Item (jaise "Wardrobe")': 'Item (e.g. "Wardrobe")',
  'Item (rate ke saath)': 'Item (with rate)',
  'Item aur rate dono daalein': 'Enter both the item and the rate',
  'Item Add Karein': 'Add item',
  'Item add ho gaya - admin approve karenge': 'Item added - the admin will approve it',
  'Aapke sheher ke market rate ke hisab se items banayein - admin approve karenge, tabhi asli estimate mein jodega.': 'Build items at your local market rates - they are added to the real estimate only once the admin approves.',
  'Admin price set karega, phir approval ke liye aayega.': 'The admin will set the price, then it comes to you for approval.',

  // --- Extra work ---
  'Extra Kaam (Original estimate se alag)': 'Extra work (separate from the original estimate)',
  'Koi extra kaam nahi hai abhi.': 'No extra work yet.',
  'Kya extra kaam chahiye, likhein...': 'Describe the extra work you need...',
  'Extra kaam approve ho gaya': 'Extra work approved',
  'Extra kaam reject kar diya gaya': 'Extra work rejected',
  'Extra kaam request bhej di gayi - admin price set karega': 'Extra work requested - the admin will set the price',
  'Reject kar diya gaya': 'Rejected',

  // --- Payment ---
  'Aapka poora payment ho gaya hai -': 'Your payment is complete -',
  'Payment Collect Karein': 'Collect payment',
  'Payment record ho gayi': 'Payment recorded',

  // --- Progress and notes ---
  'Kaam shuru hone ke baad yahan progress photos dikhengi.': 'Progress photos will appear here once work begins.',
  'Abhi koi note nahi hai.': 'No notes yet.',
  'Abhi koi activity nahi hai.': 'No activity yet.',
  'Note add ho gaya': 'Note added',
  'Note approve ho gaya, ab locked hai': 'Note approved - it is now locked',
  'Kya note karna hai:': 'What would you like to note:',
  'Planning, measurements, ya reference photos yahan save karein - item wise organize hoga.': 'Save planning notes, measurements or reference photos here - organised item by item.',
  'Deliver ho chuka hai:': 'Delivered:',
  'complete ho gaya hai': 'is complete',

  // --- Help, questions, complaints ---
  'Koi Problem Hai?': 'Having a problem?',
  'Problem Report Karein': 'Report a problem',
  'Report Karein': 'Report',
  'Kya problem hai, detail mein likhein...': 'Describe the problem in detail...',
  'Complaint darj ho gayi, admin ko bata diya gaya hai': 'Complaint registered - the admin has been notified',
  'Delivery ke baad kuch theek nahi lag raha to yahan batayein.': 'If something is not right after delivery, tell us here.',
  'Apna Sawaal Poochhein': 'Ask your question',
  'Naya Sawaal Poochhein': 'Ask a new question',
  'Aapka sawaal likhein...': 'Type your question...',
  'Apna sawal likhein...': 'Type your question...',
  'Sawaal bhej diya, jaldi jawab milega': 'Question sent - you will get a reply soon',
  'Jawab ka wait ho raha hai...': 'Waiting for a reply...',
  'Kaam ke beech kuch confirm karna ho to yahan puchein, call karne ki zaroorat nahi.': 'Ask here if you need to confirm anything mid-job - no need to call.',
  'Abhi koi FAQ add nahi hui hai. Kuch bhi poochhna ho to seedha call/WhatsApp karein.': 'No FAQs yet. For anything at all, just call or WhatsApp us.',
  'Abhi koi message nahi hai.': 'No messages yet.',

  // --- Review ---
  'Aapka Review': 'Your review',
  'Review dein': 'Leave a review',
  'Review Dein': 'Leave a review',
  'Review Update Karein': 'Update your review',
  'Aapka anubhav kaisa raha? Hamein bataiye.': 'How was your experience? Tell us.',
  'Kaam, quality, service ke baare mein likhein...': 'Write about the work, the quality, the service...',
  'Rating select karein': 'Select a rating',
  'Review submit ho gayi. Dhanyavaad!': 'Review submitted. Thank you!',

  // --- Notifications ---
  'Koi notification nahi hai.': 'No notifications.',
  'Notifications On Karein': 'Turn on notifications',
  'Naye Kaam Ki Notification On Karein': 'Turn on notifications for new work',
  'Notifications on hain': 'Notifications are on',
  'Notifications on ho gayi': 'Notifications turned on',
  'Notifications pehle se on hain': 'Notifications are already on',
  'Notifications on nahi ho payi': 'Could not turn on notifications',
  'Notification permission nahi mili': 'Notification permission was not granted',
  'Notification permission nahi mili - phone ki settings se allow karein': 'Notification permission was not granted - allow it in your phone settings',
  'Notification token nahi mila - dobara koshish karein': 'Could not get a notification token - please try again',
  'Notifications abhi setup nahi hui - Firebase Console se Web Push key chahiye': 'Notifications are not set up yet - a Web Push key is needed from the Firebase Console',
  'Push notifications is browser mein supported nahi hai': 'Push notifications are not supported in this browser',
  'Ye browser notifications support nahi karta': 'This browser does not support notifications',
  'App band ho tab bhi naye kaam ki khabar mil jayegi.': 'You will hear about new work even when the app is closed.',
  'App band ho tab bhi updates (visit confirm, payment due, waghera) turant mil jayenge.': 'You will get updates (visit confirmed, payment due and so on) immediately, even when the app is closed.',

  // --- Brochures and documents ---
  'Abhi koi brochure upload nahi hui.': 'No brochures uploaded yet.',
  'Brochure open nahi ho payi': 'Could not open the brochure',
  'Warranty Certificate Download Karein': 'Download the warranty certificate',
  'Certificate banane mein dikkat aayi, dobara try karein': 'Could not create the certificate - please try again',
  'PDF banane mein dikkat aayi, dobara try karein': 'Could not create the PDF - please try again',
  'PDF share/download mein dikkat aayi, dobara try karein': 'Could not share or download the PDF - please try again',
  'PDF download ho gaya - WhatsApp mein manually attach karein': 'PDF downloaded - attach it in WhatsApp yourself',

  // --- Company info ---
  'Hamare Saath Judne Ke Fayde': 'Why work with us',
  'Abhi koi benefit add nahi hua hai.': 'No benefits added yet.',
  'Abhi koi specification add nahi hui hai.': 'No specifications added yet.',

  // --- Shared actions ---
  'Bhej Dein': 'Send',
  'Bhejein': 'Send',
  'Cancel Karein': 'Cancel',
  'Pehle apna profile complete karein': 'Please complete your profile first',
};
