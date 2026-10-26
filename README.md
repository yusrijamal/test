# wajibot

Telegram bot that checks in daily on a brisk-walk + pushup challenge and posts a weekly
progress summary. Built with [python-telegram-bot](https://docs.python-telegram-bot.org/)
and SQLite.

## What it does

- `/start` — greets a new person and asks their name.
- Every day at **7:00 AM**, anyone who didn't log the previous day gets a catch-up prompt
  so a missed evening doesn't just silently fall off — they can still log yesterday's km
  before today's check-in.
- Every day at **8:00 PM**, it DMs each registered person:
  1. "How many km did you brisk walk today with 5kg weights?" — free text; answers like
     `3` or `3km` are both understood. If the reply is unclear, it asks again.
  2. "Did you do your 10 pushups today?" — Yes/No buttons (typed "yes"/"no" also works).
- At **10:00 PM**, anyone who hasn't finished that day's check-in gets a one-line nudge.
- Every **Thursday at 9:00 PM**, it posts each person's own progress toward their
  individual goal (not pooled — everyone has the same target but their own total) and
  pushup consistency. Anyone behind the pace needed to hit their goal gets called out by
  name to motivate them.
- `/setgroup` — run inside a group chat to make that the destination for the weekly
  summary (otherwise it DMs each person individually).
- `/status` — shows your own progress and streaks.

Goal defaults to **30km by 13/11/2026** and **10 pushups every day** — change `GOAL_KM`,
`GOAL_DEADLINE`, `GOAL_PUSHUPS` in `.env` to adjust.

## Local setup

1. `pip install -r requirements.txt`
2. `cp .env.example .env` and fill in `BOT_TOKEN` from @BotFather. Never commit `.env` —
   it's gitignored.
3. `python bot.py`

Data persists to a local SQLite file (`wajibot.db` by default, or `DB_PATH` if set).

## Deploying (Fly.io)

This repo includes a `Dockerfile`, `fly.toml`, and `Procfile`, mirroring a typical
Fly.io worker deployment:

```
fly launch --no-deploy   # first time only, review fly.toml it creates/merges
fly volumes create wajibotdata --size 1 --region sin
fly secrets set BOT_TOKEN=<your token>
fly deploy
```

`fly.toml` mounts a persistent volume at `/data` and points `DB_PATH` there so the
SQLite database survives redeploys. Adjust `primary_region` and the app name to taste.

The `Procfile` (`worker: python bot.py`) is there for any Heroku-style platform that
reads one instead.

## Using it

- Each participant should DM the bot and send `/start` to register their name.
- If you want the weekly summary posted to a group instead of DMs, add the bot to the
  group and have someone run `/setgroup` there.
