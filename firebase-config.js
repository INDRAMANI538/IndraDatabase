// ============================================================
//  FIREBASE CONFIGURATION — StudentMS
// ============================================================
//
//  SETUP STEPS:
//
//  1. Go to https://console.firebase.google.com/
//  2. Click "Add project" → name it e.g. "StudentMS"
//  3. Skip Google Analytics (optional) → Create project
//
//  4. ENABLE AUTHENTICATION:
//     Project → Build → Authentication → Get Started
//     Sign-in method → Email/Password → Enable → Save
//
//  5. ENABLE FIRESTORE:
//     Project → Build → Firestore Database → Create database
//     Start in "test mode" → Choose region → Done
//
//  6. ADD A WEB APP:
//     Project Overview → </> icon → Register app
//     Copy the firebaseConfig object and paste below
//
//  7. FIRESTORE INDEXES (add in Firebase Console > Firestore > Indexes):
//     Collection: students | Fields: createdAt (Descending)
//
//  ADMIN REGISTRATION CODE: ADMIN@SMS2024
//  (use this when registering to get admin privileges)
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyBFebbxPpxVtkZ9KkURqxFIwVmyTWa-6D4",
  authDomain: "studentms-c7577.firebaseapp.com",
  projectId: "studentms-c7577",
  storageBucket: "studentms-c7577.firebasestorage.app",
  messagingSenderId: "1076651242344",
  appId: "1:1076651242344:web:5e8b4d276089d43bbf9cdd"
};

// Initialize Firebase (using compat SDK loaded via CDN in index.html)
firebase.initializeApp(firebaseConfig);
