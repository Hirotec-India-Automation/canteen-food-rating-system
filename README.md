# Canteen Food Rating System

The Canteen Food Rating System is an innovative website created to facilitate the evaluation of food served in the company’s canteen. This platform aims to gather feedback from employees regarding their dining experience, helping to improve the quality of food and services provided.

The website comprises three primary web pages:

*FoodRating.html:* This page is specifically designed for employees to submit their ratings about the various food items offered in the canteen. Employees can rate their meals on different criteria allowing the management to gain insights into employee satisfaction and preferences.

*ratingLogin.html:* This page is exclusively for canteen managers. It requires secure login credentials to ensure that only authorized personnel can access the management features. Upon successful login, managers are redirected to the next page "menuManagement.html".

*menu.html:* This webpage serves as the control centre for canteen managers, allowing them to update the daily menu. Managers can add new items, change existing ones, or remove dishes that are no longer popular, ensuring that the menu remains fresh and appealing to employees.

This project was developed during my internship at Hirotec India Pvt. Ltd. in Coimbatore, where I gained valuable experience in web development and user experience design. The system not only enhances communication between employees and management but also fosters a culture of continuous improvement within the canteen services.

## Cloud storage (Supabase) with offline-first sync

Feedback and the daily menu are now backed by a Supabase Postgres database, in addition to the existing `localStorage` cache:

- **`food_items`** — master catalog of every food item the admin has ever added (`id`, `name`, `created_at`).
- **`daily_menu`** — one row per calendar day with the list of items selected for that day (`id`, `menu_date`, `items text[]`, `updated_at`).
- **`feedback`** — one row per feedback record (`id`, `feedback_date`, `rating`, `feedback_type`: `good_food` | `reason` | `rating_only`, `food_item`, `reason`, `created_at`).

Run [`supabase/schema.sql`](supabase/schema.sql) once in your Supabase project's SQL editor to create these tables (RLS is enabled with permissive policies since this app has no server-side auth — see the caveat in the schema file).

The client config lives in [`assets/js/supabase-sync.js`](assets/js/supabase-sync.js), shared by `FoodRating.html` and `menu.html`. Update `SUPABASE_URL` / `SUPABASE_ANON_KEY` there if you point this at a different Supabase project.

**Offline-first behavior:** every write (feedback submission, menu update, food item add/delete) is saved to `localStorage` immediately and also attempted against Supabase. If the browser is offline or the request fails, the write is queued in `localStorage` (`pendingSupabaseOps`) and automatically retried the next time the browser comes back online or the page reloads. A small badge in the top-left corner of each page shows the current connection/sync status.

## Free hosting

This is a static site (no build step), so any static host works:

- **Cloudflare Pages** (recommended, free forever tier): push this repo to GitHub/GitLab, then in the Cloudflare dashboard choose *Workers & Pages → Create → Pages → Connect to Git*, pick this repo, leave the build command empty and set the output directory to `/`. Every push auto-deploys.
- **GitHub Pages**: repo *Settings → Pages → Deploy from a branch*, select `main` and `/ (root)`.
- **Netlify / Vercel**: drag-and-drop the folder or connect the git repo; no build command needed.

Since Supabase calls are made directly from the browser using the public anon key, no server/backend is required — the whole app can be hosted as static files.

## Raspberry Pi touch-display kiosk setup

`FoodRating.html` is tuned to run full-screen in Chromium on a 7" touch display (viewport locked/no pinch-zoom, no text selection or right-click menu, larger touch targets, hidden mouse cursor). To boot straight into it:

1. `sudo apt install unclutter` (hides the cursor when idle).
2. Copy [`kiosk/start-kiosk.sh`](kiosk/start-kiosk.sh) onto the Pi and `chmod +x` it. Set `KIOSK_URL` inside it (or as an env var) to your hosted URL, or a local `file:///…/FoodRating.html` path.
3. Autostart it on boot — for Raspberry Pi OS with the desktop, add to `~/.config/autostart/canteen-kiosk.desktop`:
   ```ini
   [Desktop Entry]
   Type=Application
   Name=Canteen Kiosk
   Exec=/home/pi/start-kiosk.sh
   ```
4. Reboot — Chromium launches full-screen with no address bar, no zoom/scroll gestures, and the cursor hides automatically.

The top-left badge on the screen shows a green dot (online), red dot (offline), or a spinner (actively syncing queued feedback) instead of text, so it stays readable at a glance on the small display.


