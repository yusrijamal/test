# wajibot

Telegram bot that checks in daily on a brisk-walk + pushup challenge and posts a weekly
progress summary.

## What it does

- `/start` — greets a new user and asks their name.
- Every day at **8:00 PM**, it DMs each registered person:
  1. "How many km did you brisk walk today with 5kg weights?" — free text; answers like
     `3` or `3km` are both understood. If the reply is unclear, it asks again.
  2. "Did you do your 10 pushups today?" — Yes/No buttons (typed "yes"/"no" also works).
- Every **Thursday at 9:00 PM**, it posts a summary of everyone's total km toward the
  group goal, pushup consistency, and the group total. Anyone behind the pace needed to
  hit the goal gets a motivational nudge by name.
- `/setgroup` — run inside a group chat to make that the destination for the weekly
  summary (otherwise it DMs each person individually).
- `/status` — shows your own total km logged so far.

Goal defaults to **30km by 13/11** and **10 pushups every day** — see `.env.example` to
change these.

## Setup

1. Install dependencies:
   ```
   npm install
   ```
2. Copy `.env.example` to `.env` and fill in your bot token from BotFather:
   ```
   cp .env.example .env
   ```
   Then edit `.env` and set `BOT_TOKEN=<your token>`. **Never commit `.env` or the token
   to git** — it's already in `.gitignore`. Since the token for this bot was shared in
   plain text, consider regenerating it via `/revoke` with @BotFather if you want to be
   safe, then updating `.env`.
3. Run it:
   ```
   npm start
   ```
   Keep it running (e.g. with `pm2`, `systemd`, or a background `screen`/`tmux` session)
   so the scheduled check-ins fire.

## Using it

- Each participant should DM the bot and send `/start` to register their name.
- If you want the weekly summary posted to a group instead of DMs, add the bot to the
  group and have someone run `/setgroup` there.
- Progress data is stored locally in `data/data.json` (not committed to git).
