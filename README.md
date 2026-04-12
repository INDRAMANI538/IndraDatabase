# 🎓 StudentMS — Student Management System

A premium, browser-based Student Management System with **Firebase Authentication** and **Firestore** backend, featuring role-based access for Admins and regular Users.

---

## 🚀 Quick Start (Firebase Setup)

> You only need to do this once. Takes about 5 minutes.

### Step 1 — Create a Firebase Project

1. Go to [https://console.firebase.google.com/](https://console.firebase.google.com/)
2. Click **"Add project"** → Name it `StudentMS` → Continue
3. Disable Google Analytics (optional) → **Create project**

---

### Step 2 — Enable Email/Password Authentication

1. In the left menu: **Build → Authentication → Get Started**
2. Click **Sign-in method** tab
3. Select **Email/Password** → **Enable** the first toggle → **Save**

---

### Step 3 — Create a Firestore Database

1. In the left menu: **Build → Firestore Database → Create database**
2. Choose **"Start in test mode"** (for development)
3. Select your nearest region → **Done**

---

### Step 4 — Add a Web App & Get Your Config

1. Go to **Project Overview** (⚙️ gear icon → Project settings)
2. Scroll down to **"Your apps"** → Click **`</>`** (Web)
3. Give your app a nickname (e.g. `StudentMS Web`) → **Register app**
4. Copy the `firebaseConfig` object shown on screen

---

### Step 5 — Paste Config into `firebase-config.js`

Open `firebase-config.js` and replace the placeholder values:

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

---

### Step 6 — Open the App

Just open `index.html` in your browser. **No build step needed!**

```
Double-click  →  index.html
```

Or use VS Code **Live Server** extension for hot reload.

---

## 🔑 Default Credentials

| Role | How to get it |
|---|---|
| **Admin** | Register with Admin Code: `ADMIN@SMS2024` |
| **Regular User** | Register normally (leave Admin Code blank) |

---

## 🛡️ Features

### Admin
- ✅ View all students (table + grid view)
- ✅ Add new students with full details
- ✅ Edit any student record
- ✅ Delete students (with confirmation)
- ✅ Search & filter by name, ID, course, status
- ✅ Dashboard with live stats

### Regular User
- ✅ View all student records (read-only)
- ✅ Search & filter students
- ✅ Click any student to view full profile
- ✅ Switch between table and card/grid view

---

## 📁 Project Structure

```
StudentMS/
├── index.html          ← Single-page HTML app
├── style.css           ← Premium dark theme styles
├── app.js              ← All application logic
├── firebase-config.js  ← Your Firebase config (edit this!)
└── README.md           ← This file
```

---

## 🗄️ Firestore Data Structure

```
users/
  {uid}/
    name:      "John Doe"
    email:     "john@email.com"
    role:      "admin" | "user"
    createdAt: Timestamp

students/
  {auto-id}/
    studentId:      "STU-2024-001"
    fullName:       "Jane Smith"
    email:          "jane@email.com"
    phone:          "+91 98765 43210"
    dob:            "2002-05-14"
    gender:         "Female"
    course:         "Computer Science"
    semester:       "3rd Semester"
    gpa:            8.7
    enrollmentDate: "2022-08-01"
    status:         "Active"
    address:        "123 Main St, City"
    createdAt:      Timestamp
    createdBy:      {uid}
```

---

## 🔒 Security (Production)

Before deploying to production, update your **Firestore security rules**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only read their own profile
    match /users/{userId} {
      allow read, write: if request.auth.uid == userId;
    }
    // Students: authenticated users can read; only admins can write
    match /students/{studentId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
  }
}
```

---

## 📞 Student Fields

| Field | Description |
|---|---|
| Student ID | Auto-generated (e.g. STU-2024-001) |
| Full Name | Student's full name |
| Email | Contact email |
| Phone | Phone number |
| Date of Birth | DOB |
| Gender | Male / Female / Other |
| Course | Department / major |
| Semester | 1st – 8th Semester |
| GPA | 0–10 scale |
| Enrollment Date | Start date |
| Status | Active / Inactive / Alumni / Suspended |
| Address | Full address |
