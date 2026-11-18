# Planner

A personal planner with to-do lists, notes (with groups), daily notes, a month/week/day calendar, infinite whiteboards and tags across everything. It runs in the browser, installs as an app on your computer and iPad, works offline, and syncs between devices through your own free Supabase project.

## How your data is kept safe

- Every change is saved on the device first, instantly, so nothing resets and the app works without internet.
- When you're signed in, changes sync to Supabase within a couple of seconds and appear on your other devices (live while both are open, otherwise as soon as you open the app).
- If you edit the same thing on two devices while offline, the most recent edit wins.
- Settings → Backup downloads everything (including images) as one file.

## One-time setup (about 15 minutes)

### 1. Put the app on GitHub Pages

1. Create a new repository on GitHub (for example `planner`). It must be **public** for free GitHub Pages; your data never goes in the repo.
2. Upload all the files from this folder to the repository (keep the folder structure).
3. In the repository, go to **Settings → Pages**, set **Source** to "Deploy from a branch", pick `main` and `/ (root)`, and save.
4. After a minute your app is live at `https://<your-username>.github.io/planner/`.

### 2. Create the Supabase project

1. Sign up at [supabase.com](https://supabase.com) and create a new project (the free plan is enough). Pick a region close to you, such as São Paulo.
2. Open **SQL Editor → New query**, paste the contents of `supabase/schema.sql`, and click **Run**. This creates the storage table, the private image bucket and the rules that make your data visible only to you.
3. Go to **Authentication → URL Configuration** and set **Site URL** to your GitHub Pages address from step 1.
4. Optional but easiest: under **Authentication → Sign In / Providers → Email**, turn off **Confirm email**. Otherwise you'll get a confirmation email the first time you create your account.

### 3. Connect the app

1. In Supabase, open **Project Settings → API** (or **API Keys**) and copy the **Project URL** and the **Publishable key** (called the "anon" key in older projects). Never use the secret/service_role key.
2. Either:
   - **Recommended:** paste them into `config.js` in your repository so every device connects automatically, or
   - open the app, go to **Settings**, and paste them there on each device.
3. In the app's **Settings**, enter an email and password and click **Create account** (first device), then **Sign in** on your other devices with the same details.

### 4. Install it

- **iPad:** open your GitHub Pages address in Safari → Share → **Add to Home Screen**. Installing matters on iPad: Safari can clear data for sites you haven't opened in a while, but not for Home Screen apps.
- **Computer:** open the address in Chrome or Edge and click the install icon in the address bar. It then opens in its own window like a desktop app.

## Using it

- **Calendar:** Month, Week and Day views. The week view shows seven columns side by side with each day's tasks, daily note and notes. Add a task directly in any column.
- **To-do lists:** create lists from the sidebar. Click the ••• on a task for its due date, list, tags and notes.
- **Notes:** organize them in groups (like projects). Each note can appear on a calendar day; by default that's the day you created it. In the editor, typing `- `, `1. `, `[] `, `# ` or `> ` at the start of a line makes a list, checklist, heading or quote.
- **Daily notes:** one page per day, with that day's tasks shown above it.
- **Whiteboards:** add text, cards and images. Drag to move around, pinch or Ctrl+scroll to zoom, and double-click empty space to add text. Drop or paste images straight onto the board. Drag an image onto a card to put it inside, or use the card's image button. Tap a selected item again to edit it.
- **Tags:** add them to tasks, notes, daily notes and whiteboard items. The Tags page shows everything with a given tag.

## Good to know

- Free Supabase projects pause after a week with no activity. If sync stops after a long break, open your Supabase dashboard and click **Restore project**. Your devices keep working offline meanwhile, and sync catches up afterwards.
- To update the app, replace the files in your GitHub repository. Devices pick up the new version the next time the app is opened twice (the first open fetches it in the background).
- Supabase's free plan includes 1 GB of file storage. Large photos are automatically shrunk before upload.

## Files

| Path | What it is |
| --- | --- |
| `index.html`, `css/`, `js/` | The app |
| `config.js` | Optional Supabase connection details |
| `supabase/schema.sql` | Run once in Supabase to set up storage and security |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline support and home-screen install |
