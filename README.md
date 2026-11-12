# EasyMed

Offline-ready medical study app with Supabase email sign-in and cross-device sync. The app requires an account to open; after signing in, study data remains available locally and changes sync when the device is online. Netlify is the recommended hosting target; Vercel handlers are retained for existing deployments.

## Features

- Email-and-password sign-in, account creation, and password recovery with Supabase Auth. Magic links are also available as an alternative.
- Local-first flashcard scheduling (FSRS), notes, quiz results, errors, settings, and user-imported lecture JSON.
- AI-generated and imported lectures sync with the signed-in user's account and appear on that user's other devices after the next sync.
- Personal specialty modules organize user-created lectures and sync privately with the signed-in account; the OTR programme remains the built-in collection.
- Background sync after local changes, on reconnect/focus, and every 30 seconds while active.
- Per-record last-write-wins merge; flashcard progress favors the higher review count, then the later due date.
- Private note-image storage with signed URLs. Images are resized to at most 1200 px and compressed below 500 KB before upload.
- Manual sync, initial local/cloud data choice, sign out, local-data clearing, and JSON backup in Settings.
- Bundled course material and programme remain app content; the course JSON import supports additional user-owned lectures.

## Supabase setup

1. Create a Supabase project.
2. In **SQL Editor**, run the migrations in order: [`202611070001_initial_schema.sql`](./supabase/migrations/202611070001_initial_schema.sql), then [`202611120001_user_modules.sql`](./supabase/migrations/202611120001_user_modules.sql). The first migration creates the per-user study tables and private note-image bucket; the second adds the per-user modules table, index, grants, and RLS policy.
3. In **Authentication → URL Configuration**, set the production site URL and add your local URL (for example `http://localhost:5173`) and deployed site URL (for example `https://your-site.netlify.app/**`) to the allowed redirect URLs. Enable email magic links and configure the email provider.
4. Copy `.env.example` to `.env.local` for local frontend configuration:

   ```env
   VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
   SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
   ```

   The frontend variables are public anon credentials, not secrets. Never put a service-role key in the browser or commit credentials.
5. To deploy to Netlify, import the repository, use the included `netlify.toml` build settings, and add these variables in **Site configuration → Environment variables**:

   ```env
   VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
   SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
   ```

   Make the `VITE_` variables available to the build and the server variables available to Functions. Deploy, then add your Netlify site URL to Supabase's allowed redirect URLs. Netlify Functions adapt the same authenticated API handlers to `/api/*`.

   Vercel deployment remains supported using the existing `api/` handlers and `vercel.json`; set the same four variables in the Vercel project if using that host.

The API uses the Supabase anon key together with the caller's verified access token. This keeps Supabase RLS active for every database and storage operation; a service-role key is intentionally not used.

## Run and validate

```sh
npm install
npm run dev
npm test
npm run validate:content
npm run build
```

`npm run build` type-checks the React app, Vercel handlers, and Netlify function adapters. To exercise `/api` locally on Netlify, run `npx netlify dev` after setting the environment variables.

## Sync flow

1. A user creates an account once, then signs in with email and password on each device. Password reset and optional magic links use email; routine password sign-ins do not send email. Without Supabase configuration or a valid session, the study app remains behind the sign-in screen.
2. On the first device sync, the app compares local and cloud data. If both have study data, the user chooses whether to upload this device's data or download cloud data; records are still merged according to the conflict rules.
3. Local mutations are written to IndexedDB/localStorage and an IndexedDB retry queue. A debounced background sync pushes queued changes, then pulls records changed since the last successful sync.
4. Failed requests stay queued and retry on the next change, reconnect, focus, manual sync, or polling interval. The cloud indicator shows offline, syncing, synced, conflict-choice, or error state.

AI-generated courses are saved to the local course library and queued in the `lectures` table for the currently signed-in account. Personal module metadata syncs through the `modules` table; lecture module assignments are stored in the synchronized lecture content. To make them available on another browser or device, deploy with the Supabase environment variables above, apply both migrations in order, sign in with the same account on both devices, and confirm the sync indicator reports **Synchronisé**. If the second device has local data already, choose **Télécharger les données cloud** in Settings to initialize it from the account.

## API routes

- `POST /api/sync/pull` and `POST /api/sync/push`
- `GET /api/lectures`, `POST /api/lectures`, `DELETE /api/lectures/:id`
- `GET /api/notes` and `POST /api/notes`

Every route verifies the Supabase access token and scopes queries to the authenticated user. Note-image endpoints enforce the private bucket's user-folder policies.

## Content exports

- `npm run export:content -- <spondylarthrite_interactive.html>` extracts the bundled lecture/programme data.
- `npm run validate:content` validates lectures and quiz/true-false references.

Keep the app's local bundled content in `public/data`; do not commit `.env` files or private keys.
