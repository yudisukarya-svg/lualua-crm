# Production Planning — setup guide (v2)

This adds a **Production** section to your CRM: sales-order scheduling, capacity, styles, resources and a Gantt chart. Same Supabase project, same way of running the app.

If you set up the earlier planning version already, you only need to run the **new** database file `0006_planning_v2.sql` (step 1b) — the rest is the updated code.

---

## Step 1 — Run the database files (in Supabase)

In your **Lualua-crm** project → **SQL Editor** → **New query**. For each file: open it from `supabase/migrations/`, copy all, paste, **Run** (choose *Run without RLS* if asked), wait for green **Success**.

1a. `0005_planning.sql`  — only if you have NOT run it before.
1b. `0006_planning_v2.sql` — adds Sales Orders, order lines, the style→customer link, and priority modes.

These are additive — they create new tables and columns. Nothing existing is deleted.

---

## Step 2 — Swap in the updated app

1. Unzip the new download (creates a `lualua-crm` folder).
2. Rename your old Desktop folder to `lualua-crm-old` (backup), move the new one to the Desktop.
3. Re-create the settings file. In Terminal: `cd `, drag the new folder in, Enter. Then:
   ```
   cp .env.example .env && open -e .env
   ```
   Put back your two values (Supabase → Settings → API), save, close:
   ```
   VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-public-key
   ```
4. Install and run:
   ```
   npm install
   npm run dev
   ```
5. Open http://localhost:5173 and log in.

---

## Step 3 — How to use it (in order)

1. **Production → Resources** — confirm worker/machine counts (admin).
2. **Production → Styles** — create each style, choose which **customer** it belongs to, and enter pcs per worker/machine per day at each stage. Colour and size are NOT set here — they're just labels on the order.
3. **Production → Calendar** — Sunday off by default; add holidays / shutdown dates.
4. **Production → Planning**:
   - Click **New order** to enter a **Sales Order**: SO number, customer, priority, dates, then add **lines** (style + colour + size + qty). One SO can have many lines; the whole SO is scheduled as one job.
   - **Priority** dropdown switches the whole plan between First-in (FIFO), Earliest due date, and High priority — recalculates instantly.
   - The table shows each SO's start, forecast finish, days left, current stage, % and on-time / at-risk.
   - **What-if**: pick an SO, try a start date, see the resulting finish before committing.
   - The **Gantt** shows the overlapping flow, one bar per SO.
5. **Production → Capacity** — peak worker load per stage, green/amber/red, plus when a full stage frees up.

---

## How scheduling works (plain language)

- A **style** sets production speed at each stage. Stage capacity/day = (workers or machines) × (style speed). Colour and size don't change speed.
- Pieces finished by one stage today reach the next stage tomorrow — stages overlap.
- All live orders share the same workers. When two need the same stage on the same day, the **priority mode** you chose decides who goes first.
- The engine simulates day by day, skipping non-working days, to give real start/finish dates, the bottleneck stage, and over-capacity warnings.

> Note: the earlier test "planned orders" (if you added any) live in a separate old table and won't appear here — re-enter them as Sales Orders.
