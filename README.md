# Civic Connectors (Pravah 2.0) - Project Knowledge Base

## Overview
**Civic Connectors** is a comprehensive civic engagement platform designed to empower citizens to report issues and enable authorities to manage them efficiently. The system is built using **Vanilla HTML/CSS/JS** with **Firebase** as the backend service.

## Core Architecture

### 1. Technology Stack
*   **Frontend**: Vanilla JavaScript (ES Modules), CSS3 (Variables, Flexbox/Grid), HTML5.
*   **Backend / Database**: Google Firebase (Firestore, Authentication).
*   **Maps**: Leaflet.js with OpenStreetMap.
*   **Image Storage**: Cloudinary (Unsigned Uploads).

### 2. User Roles & Authentication
The system enforces strict Role-Based Access Control (RBAC):
*   **Citizen (Public User)**:
    *   Can report issues with photos and GPS location.
    *   Can track the status of reported issues via a visual "Tick System".
    *   Limited dashboard view (no analytics).
*   **City Official (Admin)**:
    *   Full access to Analytics and Stats.
    *   Can manage issues: Update status, Assign authorities, Reject/Delete.
    *   Visual oversight via Heatmaps (clustered markers).

**Credentials (Demo):**
*   **Admin**: `admin@civicconnect.in` / `Admin@123`
*   **User**: `publicuser@gmail.com` / `User@123`

### 3. Key Features

#### A. Issue Reporting & Management (Tick System)
Progress is tracked via a universal visual language:
*   ✔ **Submitted**: Issue reported by citizen.
*   ✔✔ **Received**: Acknowledged by system/admin.
*   🔵 **Work Started**: Authority has begun work.
*   🏗 **Under Construction**: Heavy repair works in progress.
*   🟢 **Completed**: Issue resolved and verified.
*   🔴 **Delayed**: Critical bottleneck or stalled.

#### B. Dashboard Modules
*   **Live Map**: Interactive map showing all issues color-coded by status.
*   **Stats Grid (Admin)**: Real-time counters for Total, Pending, Under Work, Completed, and Delayed issues.
*   **Issue Tracker**: Tabular view of recent reports. Admin has "Edit" action; Public has "view only".

#### C. Profile & Settings
*   Users can update their display name and district/zone via the **Settings** modal.
*   This data is stored in the `users` Firestore collection.

### 4. File Structure
*   `index.html`: Main Single Page Application (SPA) dashboard. Contains all modals and views.
*   `login.html`: Authentication entry point (Login/Register toggle).
*   `style.css`: Global styles, variables, responsiveness, and component designs.
*   `app.js`: Core logic controller. Handles Auth state, Map rendering, Data fetching (real-time listeners), and UI updates.
*   `auth_login.js`: Specific logic for the login page (Auth handlers).

### 5. Data Models (Firestore)

**Collection: `users`**
```json
{
  "uid": "string",
  "email": "string",
  "role": "admin" | "public",
  "name": "string (optional)",
  "district": "string (optional)"
}
```

**Collection: `issues`**
```json
{
  "id": "auto-generated",
  "type": "pothole" | "garbage" | ...,
  "description": "string",
  "location": "string (city name)",
  "lat": number,
  "lng": number,
  "status": "submitted" | "received" | "started" | "completed" | "delayed",
  "imageUrl": "string (Cloudinary URL)",
  "assignedAuthority": "string (optional)",
  "adminNote": "string (optional)",
  "reporter": "uid",
  "timestamp": timestamp
}
```

## Setup Instructions
1.  **Clone/Download** the repository.
2.  **Serve Locally**: Must use a local server (e.g., Live Server) because of ES Modules.
3.  **Config**: Ensure valid Firebase Config in `app.js` and Cloudinary Preset (`pravah_report_preset`).
4.  **Run**: Open `login.html` first to authenticate.

---
