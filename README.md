# wajibot

A Telegram bot that checks in on two daily habits and sends a weekly summary.

Every day at 8pm it asks each registered user:
1. How many km did you brisk walk with 5kg weights today? (free text, e.g. `3` or `3km`; it re-asks if it can't find a number)
2. Did you do 10 pushups today? (Yes/No buttons)

Every Thursday at 9pm it sends each user a summary of their totals to date (total km, pushup days completed, days tracked).

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and fill in:
   - `BOT_TOKEN` — your bot's token from @BotFather (do not commit this file or the token).
   - `TIMEZONE` — IANA timezone used for the 8pm/9pm schedule (defaults to `Asia/Jakarta`).
3. `npm start`

Each user registers by sending `/start` to the bot in Telegram. Data (users and daily answers) is stored locally in `data/data.json`.
