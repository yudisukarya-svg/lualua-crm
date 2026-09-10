# Lualua Crochet & Knitting — CRM

A production-ready internal CRM for a knitwear & crochet manufacturer. Built for a small team (up to ~5 users) with two roles: **admin** and **staff**.

Stack: **React + Vite + Tailwind CSS + shadcn/ui** (frontend) · **Supabase** — PostgreSQL, Auth, Storage, Row-Level Security (backend) · **Netlify** (hosting).

---

## Features

- **Dashboard** — live counts (customers, sampling, in production, ready to ship, completed), recent activity, upcoming deadlines, recent uploads & notes.
- **Customers** — full CRUD, search, type & country filters, detail page with Profile / Projects / Files / Timeline / Internal Notes / Communication tabs.
- **Projects** — full CRUD, auto-generated project numbers (`LUA-YYYY-0001`), status pipeline (11 stages), search & filters; detail page with Overview / Specifications / Photos / Files / Production / Shipping / Notes / Timeline tabs.
- **Production tracking** — yarn, gauge, machine, dates, a progress bar with quick milestone presets (10% Sampling → 100% Finished).
- **File management** — drag-and-drop upload to Supabase Storage, folder grouping, in-app preview (images/PDF), download, and version history.
- **Photo gallery** — grid view with date filtering and full-size preview.
- **Purchase orders & shipments** — CRUD sub-modules per project.
- **Internal notes** — team-visible notes on customers and projects, with search.
- **Activity timeline** — automatically logged from database triggers.
- **In-app notifications** — realtime bell with unread badge.
- **Global search** — customers and projects from the top bar.
- **Reports** — charts (projects by status, production distribution, shipments by month, top customers) with **PDF / Excel / CSV** export.
- **Security** — Supabase Auth + Row-Level Security on every table; admin-only deletes.

---

## Project structure

```
lualua-crm/
├── public/                     # static assets (favicon)
├── src/
│   ├── components/
│   │   ├── ui/                 # shadcn/ui primitives
│   │   ├── layout/             # Sidebar, Topbar, AppLayout
│   │   ├── CustomerFormDialog.jsx, ProjectFormDialog.jsx
│   │   ├── FileUpload.jsx, FileManager.jsx, PhotoGallery.jsx
│   │   ├── ProductionPanel.jsx, PurchaseOrderDialog.jsx, ShipmentDialog.jsx
│   │   ├── NotesPanel.jsx, Timeline.jsx, GlobalSearch.jsx
│   │   ├── StatusBadge.jsx, PageHeader.jsx, EmptyState.jsx, ProtectedRoute.jsx
│   ├── context/AuthContext.jsx
│   ├── hooks/                  # useCustomers, useProjects, useFiles, useNotes,
│   │                           # useActivities, useNotifications, useDashboard,
│   │                           # usePurchaseOrders, useShipments, useReports
│   ├── lib/                    # supabase client, utils, constants
│   ├── pages/                  # Login, ResetPassword, Dashboard, Customers,
│   │                           # CustomerDetail, Projects, ProjectDetail, Reports, NotFound
│   ├── App.jsx                 # routing
│   ├── main.jsx                # entry point
│   └── index.css               # Tailwind + design tokens
├── supabase/migrations/        # 0001 schema · 0002 functions/triggers · 0003 RLS · 0004 storage
├── .env.example
├── netlify.toml
├── package.json
└── vite.config.js
```

---

## 1. Supabase setup

### a. Create the project
1. Go to [supabase.com](https://supabase.com), create a new project, and note the project **URL** and **anon public key** (Project Settings → API).

### b. Run the migrations (in order)
Open the Supabase **SQL Editor** and run each file from `supabase/migrations/` **in numerical order**:

1. `0001_schema.sql` — extensions, enums, all tables, indexes.
2. `0002_functions_triggers.sql` — helper functions, project-number generator, the new-user handler, and the activity/notification triggers.
3. `0003_rls.sql` — enables Row-Level Security and all access policies.
4. `0004_storage.sql` — creates the private `crm-files` storage bucket and its policies.

> You can also paste all four into one query and run them top-to-bottom, but keep the order.

### c. Enable email auth
Authentication → Providers → **Email**: make sure it's enabled. For internal use you can turn **off** "Confirm email" so new staff accounts work immediately, or leave it on and configure SMTP.

For password resets to work, add your deployed URL under Authentication → **URL Configuration** → Redirect URLs (e.g. `https://your-site.netlify.app/reset-password`).

### d. First user becomes admin
The `handle_new_user` trigger makes the **first** account to sign up an **admin**; every subsequent account is **staff**. So:
1. Deploy (or run locally), open the app, click **Create account**, and register yourself first — you're now the admin.
2. Have the rest of the team sign up afterwards (they'll be staff). Admins can later change roles directly in the `users` table if needed.

---

## 2. Run locally

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
#   then edit .env:
#   VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
#   VITE_SUPABASE_ANON_KEY=your-anon-public-key

# 3. Start the dev server
npm run dev      # http://localhost:5173

# Production build (optional, to verify)
npm run build && npm run preview
```

---

## 3. Deploy to Netlify

The repo already includes `netlify.toml`:

```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

Steps:
1. Push this project to a GitHub/GitLab repository.
2. In Netlify → **Add new site → Import an existing project**, and connect the repo.
3. Build settings are picked up from `netlify.toml` (build command `npm run build`, publish directory `dist`).
4. Under **Site settings → Environment variables**, add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy. The SPA redirect rule ensures client-side routes (`/projects/:id`, etc.) resolve correctly.
6. Add the live URL to Supabase's redirect URLs (see 1c) so password reset emails link back correctly.

---

## Roles & permissions

| Action | Admin | Staff |
|---|---|---|
| View everything | ✅ | ✅ |
| Create / edit customers, projects, files, notes, POs, shipments | ✅ | ✅ |
| Delete customers / projects / files / POs / shipments | ✅ | ❌ |
| Delete own notes | ✅ | ✅ |

Permissions are enforced at the database level via Row-Level Security, not just in the UI.

---

## Notes

- Files live in the private `crm-files` Supabase Storage bucket; the app serves them through short-lived signed URLs.
- The activity timeline and notifications are generated automatically by Postgres triggers — no client code needs to write them.
- The design uses a single warm "dyed-yarn" clay accent on a clean white/light-gray base, with the Inter typeface.
