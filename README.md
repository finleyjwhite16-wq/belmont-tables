# Belmont Tables

A volunteer sign-up app for Belmont Tables. Each student is assigned to one family (Table Team) and only sees that family. They sign up for the weekly volunteer days: Mondays (Sodexo volunteering, 3:00-4:30 PM) and Thursdays (Cul2vate volunteering, 3:00-4:30 PM). It installs on phones and laptops like an app (a PWA).

- **Students:** create an account, see their family and drop-off details, sign up for days, get reminders.
- **Coordinators:** assign students to families, edit families and volunteer days, skip holidays, see who is coming, export a CSV, reset passwords.
- **No dependencies to install.** Needs Node 22.13 or newer. Everything is stored in one SQLite file (`data/belmont.db`).

## Run it

```
cp .env.example .env      # then edit COORDINATOR_EMAILS
npm start                 # http://localhost:3000
```

1. Put your school email in `COORDINATOR_EMAILS` in `.env`.
2. Open the app and choose **Create account** with that email. You become a coordinator.
3. In **Coordinator**, add or edit families, then assign students. Students appear there after they create an account.

To promote someone later: `npm run make-coordinator -- someone@school.edu` (they must have created an account first).

## Put it online so students can install it

Phones only offer "Install" on a secure (HTTPS) address, so the app has to run on a server students can reach. Any host that runs Node 22+ and keeps a small persistent disk works (Render, Railway, Fly.io, a campus server).

1. Deploy this folder. Start command: `npm start`.
2. Set environment variables: `COORDINATOR_EMAILS`, `COOKIE_SECURE=1`, optionally `ALLOWED_EMAIL_DOMAINS=bruins.belmont.edu,belmont.edu`, and `DATA_DIR` pointing at the persistent disk.
3. Share the HTTPS link. Students then:
   - **iPhone (Safari):** Share button, then **Add to Home Screen**.
   - **Android (Chrome):** menu, then **Install app** (or the Install button on the Account tab).
   - **Laptop (Chrome/Edge):** the install icon in the address bar.

Back up `data/belmont.db` to keep signups between semesters.

## Reminders

- A countdown banner shows the next shift ("Tomorrow", "in 3 days").
- Each signed-up day has an **Add to calendar (.ics)** file with alerts one day and one hour before, plus a Google Calendar link. These remind students even when the app is closed.
- Students can turn on device notifications. They fire when the app is opened within 24 hours of a shift. True background push (app closed) needs a push service and is not included.

## Settings

| Variable | What it does |
| --- | --- |
| `PORT` | Port to listen on (default 3000) |
| `COORDINATOR_EMAILS` | Emails that get coordinator access |
| `ALLOWED_EMAIL_DOMAINS` | Only allow sign-ups from these domains (blank = any) |
| `COOKIE_SECURE` | Set to 1 behind HTTPS |
| `DATA_DIR` | Where the database lives (default `./data`) |
| `TZ` | Server time zone (default America/Chicago) |
| `SESSION_SECRET` | Optional; auto-generated into `data/secret.key` if unset |

## Files

- `server.js`: the whole backend (API, sign-in, database, static files)
- `public/`: the app (`index.html`, `app.js`, `styles.css`, `sw.js`, `manifest.webmanifest`, `icons/`)
- `make-coordinator.js`: promote an account to coordinator

The starting data (the Sodexo and Cul2vate days, and the Humphrey, Bishop, Biggs and Waterman families) loads the first time the server starts. Team 2's family isn't in yet; add it in the Coordinator tab, and fill in blank fields (like Humphrey's dietary needs) there too.
