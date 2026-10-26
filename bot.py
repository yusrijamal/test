import os
import re
import logging
import pytz
from html import escape
from datetime import datetime, date, timedelta, time as Time

from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.error import TelegramError
from telegram.ext import (
    Application, CommandHandler, MessageHandler, CallbackQueryHandler,
    ContextTypes, filters,
)
from dotenv import load_dotenv

import db

load_dotenv()
logging.basicConfig(
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)

BOT_TOKEN = os.getenv("BOT_TOKEN", "")
TIMEZONE = os.getenv("TIMEZONE", "Asia/Jakarta")
TZ = pytz.timezone(TIMEZONE)

GOAL_KM = float(os.getenv("GOAL_KM", "30"))
GOAL_PUSHUPS = int(os.getenv("GOAL_PUSHUPS", "10"))
GOAL_DEADLINE = date.fromisoformat(os.getenv("GOAL_DEADLINE", "2026-11-13"))

Q_KM = f"🚶 How many km did you brisk walk today with 5kg weights? (just the number is fine, e.g. 3 or 3km)"
Q_PUSHUP = f"💪 Did you do your {GOAL_PUSHUPS} pushups today?"


def now_local():
    return datetime.now(TZ)


def parse_km(text):
    match = re.search(r"(\d+(\.\d+)?)", text.replace(",", "."))
    if not match:
        return None
    value = float(match.group(1))
    if value < 0 or value > 200:
        return None
    return value


def parse_yes_no(text):
    t = text.strip().lower()
    if t in ("y", "yes", "yep", "yup", "done", "ya"):
        return True
    if t in ("n", "no", "nope", "not yet"):
        return False
    return None


def pushup_keyboard(checkin_date):
    return InlineKeyboardMarkup([[
        InlineKeyboardButton("✅ Yes", callback_data=f"pu:{checkin_date}:yes"),
        InlineKeyboardButton("❌ No", callback_data=f"pu:{checkin_date}:no"),
    ]])


def record_now_keyboard():
    return InlineKeyboardMarkup([[
        InlineKeyboardButton("✅ Record now", callback_data="rec:yes"),
        InlineKeyboardButton("🌙 Wait for tonight", callback_data="rec:no"),
    ]])


async def maybe_offer_checkin(bot, chat_id, user_id):
    """After /start, offer to record today's check-in now if it hasn't been recorded yet."""
    today = now_local().date().isoformat()
    if db.has_checked_in(user_id, today):
        return
    await bot.send_message(
        chat_id,
        "Want to log today's brisk walk + pushups now, or wait for tonight's 8pm reminder?",
        reply_markup=record_now_keyboard(),
    )


def format_result(km, pushups_done, tracking_streak, pushup_streak):
    text = f"Logged for today: {km:g}km brisk walk, pushups {'done' if pushups_done else 'not done'}.\n\n"
    text += f"📝 Tracking streak: {tracking_streak} day(s)\n💪 Pushup streak: {pushup_streak} day(s)"
    text += "\n\nNice work!" if pushups_done else "\n\nNo worries, get them in tomorrow!"
    return text


# ---------------------------------------------------------------------------
# Onboarding
# ---------------------------------------------------------------------------

async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    uid = update.effective_user.id
    user = db.get_user(uid)

    if user and user["name"]:
        total_km = db.get_total_km(uid)
        await update.message.reply_text(
            f"Welcome back, {escape(user['name'])}! 🌙\n\n"
            f"🚶 Total: {total_km:g}km / {GOAL_KM:g}km goal\n"
            f"📝 Tracking streak: {user['tracking_streak']} day(s)\n"
            f"💪 Pushup streak: {user['pushup_streak']} day(s)\n\n"
            "I'll check in with you every day at 8pm.",
            parse_mode="HTML",
        )
        await maybe_offer_checkin(context.bot, update.effective_chat.id, uid)
        return

    context.user_data.clear()
    context.user_data["step"] = "awaiting_name"
    await update.message.reply_text(
        "Welcome to wajibot! 🌙\n\n"
        f"Every day at 8pm I'll ask how far you brisk walked (with 5kg weights) and whether you did your "
        f"{GOAL_PUSHUPS} pushups. Every Thursday at 9pm I'll share everyone's own progress toward their "
        f"goal of {GOAL_KM:g}km by {GOAL_DEADLINE.strftime('%d/%m')}.\n\n"
        "What's your name?"
    )


async def cmd_setgroup(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if update.effective_chat.type not in ("group", "supergroup"):
        await update.message.reply_text("Run /setgroup inside the group chat you want weekly summaries posted to.")
        return
    db.set_setting("group_chat_id", str(update.effective_chat.id))
    await update.message.reply_text("Got it — I will post the weekly summary here every Thursday at 9pm.")


async def cmd_status(update: Update, context: ContextTypes.DEFAULT_TYPE):
    uid = update.effective_user.id
    user = db.get_user(uid)
    if not user or not user["name"]:
        await update.message.reply_text("I don't know you yet — send /start first.")
        return
    total_km = db.get_total_km(uid)
    await update.message.reply_text(
        f"{escape(user['name'])}, you've logged {total_km:g}km toward the {GOAL_KM:g}km goal.\n"
        f"📝 Tracking streak: {user['tracking_streak']} day(s)\n"
        f"💪 Pushup streak: {user['pushup_streak']} day(s)",
        parse_mode="HTML",
    )


async def handle_text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    step = context.user_data.get("step")
    uid = update.effective_user.id
    chat_id = update.effective_chat.id
    text = (update.message.text or "").strip()

    if step == "awaiting_name":
        name = text[:50]
        if not name:
            await update.message.reply_text("Just type your name to continue.")
            return
        db.register_user(uid, chat_id, name)
        context.user_data.clear()
        await update.message.reply_text(
            f"Nice to meet you, {escape(name)}! I'll check in with you every day at 8pm. "
            f"Your goal is {GOAL_KM:g}km by {GOAL_DEADLINE.strftime('%d/%m')} plus "
            f"{GOAL_PUSHUPS} pushups every day. Let's go! 💪",
            parse_mode="HTML",
        )
        await maybe_offer_checkin(context.bot, chat_id, uid)
        return

    if step == "awaiting_km":
        km = parse_km(text)
        if km is None:
            await update.message.reply_text(
                "Sorry, I didn't catch that — please reply with just the number of km, e.g. 3 or 3km."
            )
            return
        context.user_data["pending_km"] = km
        context.user_data["step"] = "awaiting_pushup"
        checkin_date = context.user_data.get("checkin_date", now_local().date().isoformat())
        context.user_data["checkin_date"] = checkin_date
        await update.message.reply_text(Q_PUSHUP, reply_markup=pushup_keyboard(checkin_date))
        return

    if step == "awaiting_pushup":
        yn = parse_yes_no(text)
        if yn is None:
            await update.message.reply_text('Please tap Yes or No above, or reply "yes"/"no".')
            return
        checkin_date = context.user_data.get("checkin_date", now_local().date().isoformat())
        km = context.user_data.get("pending_km")
        tracking, pushup_streak, recorded = db.record_checkin(uid, checkin_date, km, yn)
        context.user_data.clear()
        if not recorded:
            await update.message.reply_text("Already logged for today ✅")
            return
        await update.message.reply_text(format_result(km, yn, tracking, pushup_streak))
        return

    if not db.get_user(uid):
        await update.message.reply_text("Type /start to begin.")
    else:
        await update.message.reply_text(
            "Nothing to answer right now — I'll check in with you at 8pm. Use /status to see your progress."
        )


async def handle_record_now_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    choice = query.data.split(":")[1]
    await query.answer()

    if choice == "no":
        await query.edit_message_text("No worries — I'll check in with you tonight at 8pm. 🌙")
        return

    today = now_local().date().isoformat()
    context.user_data["step"] = "awaiting_km"
    context.user_data["checkin_date"] = today
    await query.edit_message_text(Q_KM)


async def handle_pushup_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    uid = query.from_user.id
    user = db.get_user(uid)
    if not user:
        await query.answer("Please /start first.", show_alert=True)
        return

    _, checkin_date, choice = query.data.split(":")
    answer = choice == "yes"
    pending_km = context.user_data.get("pending_km")

    if pending_km is None:
        await query.answer("This button's expired — I'll ask again tonight.", show_alert=True)
        return

    tracking, pushup_streak, recorded = db.record_checkin(uid, checkin_date, pending_km, answer)
    if not recorded:
        await query.answer("Already logged for today ✅", show_alert=True)
        return

    await query.answer()
    context.user_data.clear()
    await query.edit_message_text(format_result(pending_km, answer, tracking, pushup_streak))


# ---------------------------------------------------------------------------
# Scheduled jobs
# ---------------------------------------------------------------------------

async def job_morning_catchup(context: ContextTypes.DEFAULT_TYPE):
    """7am: give anyone who missed yesterday's check-in one more chance to log it."""
    yesterday = (now_local().date() - timedelta(days=1)).isoformat()
    for u in db.get_all_users():
        if db.has_checked_in(u["user_id"], yesterday):
            continue
        context.application.user_data[u["user_id"]]["step"] = "awaiting_km"
        context.application.user_data[u["user_id"]]["checkin_date"] = yesterday
        try:
            await context.bot.send_message(
                u["chat_id"],
                f"⏰ Looks like yesterday ({yesterday}) didn't get logged — want to catch up now? "
                "🚶 How many km did you brisk walk yesterday with 5kg weights? "
                "(just the number is fine, e.g. 3 or 3km)",
            )
        except TelegramError as e:
            logger.warning("Failed to send morning catch-up to user_id=%s: %s", u["user_id"], e)


async def job_daily_checkin(context: ContextTypes.DEFAULT_TYPE):
    today = now_local().date().isoformat()
    for u in db.get_all_users():
        if db.has_checked_in(u["user_id"], today):
            continue
        context.application.user_data[u["user_id"]]["step"] = "awaiting_km"
        context.application.user_data[u["user_id"]]["checkin_date"] = today
        try:
            await context.bot.send_message(u["chat_id"], Q_KM)
        except TelegramError as e:
            logger.warning("Failed to send daily check-in to user_id=%s: %s", u["user_id"], e)


async def job_nudge(context: ContextTypes.DEFAULT_TYPE):
    """One gentle reminder for anyone who hasn't finished today's check-in yet."""
    today = now_local().date().isoformat()
    for u in db.get_all_users():
        if db.has_checked_in(u["user_id"], today):
            continue
        try:
            await context.bot.send_message(
                u["chat_id"],
                "⏰ Haven't heard from you today — don't forget to log your brisk walk + pushups!",
            )
        except TelegramError as e:
            logger.warning("Failed to send nudge to user_id=%s: %s", u["user_id"], e)


def build_weekly_summary():
    users = db.get_all_users()
    users = [u for u in users if u["name"]]
    if not users:
        return None

    start_str = db.get_setting("challenge_start_date")
    start = date.fromisoformat(start_str) if start_str else now_local().date()
    today = now_local().date()
    total_days = max((GOAL_DEADLINE - start).days, 1)
    elapsed = max((today - start).days, 0)
    expected_km = GOAL_KM * min(elapsed / total_days, 1)

    lines = [f"📊 Weekly progress — everyone's own goal of {GOAL_KM:g}km by {GOAL_DEADLINE.strftime('%d/%m')}", ""]
    laggers = []

    for u in users:
        km = db.get_total_km(u["user_id"])
        tracked_days = db.get_tracked_days(u["user_id"])
        pushup_days = db.get_pushup_days(u["user_id"])

        pct = min(round((km / GOAL_KM) * 100), 999)
        lines.append(
            f"• {u['name']}: {km:g}km / {GOAL_KM:g}km ({pct}%) — "
            f"{GOAL_PUSHUPS} pushups on {pushup_days}/{tracked_days} tracked days"
        )
        if km < expected_km * 0.9:
            laggers.append(u)

    if laggers:
        lines.append("")
        lines.append("💪 Let's go, don't let the goal slip:")
        for u in laggers:
            lines.append(f"{u['name']}, you're behind pace — a few extra km this week and you'll catch up!")
    elif elapsed > 0:
        lines.append("")
        lines.append("Everyone is on pace. Keep it up! 🔥")

    return "\n".join(lines)


async def job_weekly_summary(context: ContextTypes.DEFAULT_TYPE):
    summary = build_weekly_summary()
    if not summary:
        return

    group_chat_id = db.get_setting("group_chat_id")
    try:
        if group_chat_id:
            await context.bot.send_message(int(group_chat_id), summary)
        else:
            for u in db.get_all_users():
                await context.bot.send_message(u["chat_id"], summary)
    except TelegramError as e:
        logger.warning("Failed to send weekly summary: %s", e)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    db.init_db()

    app = Application.builder().token(BOT_TOKEN).build()

    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("setgroup", cmd_setgroup))
    app.add_handler(CommandHandler("status", cmd_status))
    app.add_handler(CallbackQueryHandler(handle_record_now_callback, pattern=r"^rec:"))
    app.add_handler(CallbackQueryHandler(handle_pushup_callback, pattern=r"^pu:"))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_text))

    jq = app.job_queue
    jq.run_daily(job_morning_catchup, Time(7, 0, tzinfo=TZ), name="morning_catchup")
    jq.run_once(job_morning_catchup, when=10, name="morning_catchup_on_start")
    jq.run_daily(job_daily_checkin, Time(20, 0, tzinfo=TZ), name="daily_checkin")
    jq.run_daily(job_nudge, Time(22, 0, tzinfo=TZ), name="nudge")
    jq.run_daily(job_weekly_summary, Time(21, 0, tzinfo=TZ), days=(3,), name="weekly_summary")  # Thursday

    logger.info("Bot running...")
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
