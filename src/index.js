require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const cron = require('node-cron');
const store = require('./store');
const { parseKm } = require('./parseKm');

const BOT_TOKEN = process.env.BOT_TOKEN;
const TIMEZONE = process.env.TIMEZONE || 'Asia/Jakarta';

const GOAL_KM = 30;
const GOAL_DEADLINE = '2026-11-13';

if (!BOT_TOKEN) {
  throw new Error('BOT_TOKEN is not set. Copy .env.example to .env and fill it in.');
}

const bot = new Telegraf(BOT_TOKEN);

// chatId -> { step: 'awaiting_km' | 'awaiting_pushups', date }
const sessions = new Map();

function todayKey() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE }); // YYYY-MM-DD
}

function askKm(chatId) {
  sessions.set(chatId, { step: 'awaiting_km', date: todayKey() });
  return bot.telegram.sendMessage(
    chatId,
    'Daily check-in time!\n\nHow many km did you brisk walk with 5kg weights today?'
  );
}

function askPushups(chatId) {
  sessions.set(chatId, { step: 'awaiting_pushups', date: todayKey() });
  return bot.telegram.sendMessage(
    chatId,
    'Did you do 10 pushups today?',
    Markup.inlineKeyboard([
      Markup.button.callback('Yes', 'pushups_yes'),
      Markup.button.callback('No', 'pushups_no'),
    ])
  );
}

bot.start((ctx) => {
  store.upsertUser(ctx.chat.id, ctx.from.first_name);
  sessions.set(ctx.chat.id, { step: 'awaiting_name' });
  ctx.reply("Welcome to wajibot! What should I call you?");
});

bot.on('text', (ctx) => {
  const chatId = ctx.chat.id;
  const session = sessions.get(chatId);
  if (!session) return;

  if (session.step === 'awaiting_name') {
    const name = ctx.message.text.trim();
    store.setName(chatId, name);
    sessions.delete(chatId);
    ctx.reply(
      `Nice to meet you, ${name}! Every day at 8pm I'll ask about your brisk walk (with 5kg weights) ` +
        `and your pushups. Every Thursday at 9pm I'll send a summary of your totals to date.\n\n` +
        `Goal: ${GOAL_KM}km by ${GOAL_DEADLINE}, plus 10 pushups every single day. Let's go!`
    );
    return;
  }

  if (session.step !== 'awaiting_km') return;

  const km = parseKm(ctx.message.text);
  if (km === null) {
    ctx.reply("Sorry, I didn't catch a number. How many km did you brisk walk with 5kg weights today? (e.g. 3 or 3km)");
    return;
  }

  store.recordKm(chatId, session.date, ctx.message.text, km);
  askPushups(chatId);
});

bot.action('pushups_yes', (ctx) => {
  const chatId = ctx.chat.id;
  const session = sessions.get(chatId);
  const date = session ? session.date : todayKey();
  store.recordPushups(chatId, date, true);
  sessions.delete(chatId);
  ctx.editMessageText('Did you do 10 pushups today?\n\nYou answered: Yes ✅');
  ctx.answerCbQuery();
});

bot.action('pushups_no', (ctx) => {
  const chatId = ctx.chat.id;
  const session = sessions.get(chatId);
  const date = session ? session.date : todayKey();
  store.recordPushups(chatId, date, false);
  sessions.delete(chatId);
  ctx.editMessageText('Did you do 10 pushups today?\n\nYou answered: No ❌');
  ctx.answerCbQuery();
});

function sendDailyQuestions() {
  for (const chatId of store.getAllUserIds()) {
    askKm(Number(chatId)).catch((err) => console.error('Failed to message', chatId, err.message));
  }
}

function daysBetween(fromIso, toIso) {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  return Math.max(ms / (1000 * 60 * 60 * 24), 0);
}

function buildMotivation(totalKm, pushupDaysDone, daysTracked, firstSeenIso) {
  const daysRemaining = Math.ceil(daysBetween(todayKey(), GOAL_DEADLINE));
  const kmRemaining = Math.max(GOAL_KM - totalKm, 0);

  const lines = [];

  if (totalKm >= GOAL_KM) {
    lines.push(`You've hit the ${GOAL_KM}km goal already! 🎉 Keep the streak going.`);
  } else if (daysRemaining <= 0) {
    lines.push(`The ${GOAL_DEADLINE} deadline has passed and you're at ${totalKm.toFixed(1)}/${GOAL_KM}km — finish it off!`);
  } else {
    const totalWindowDays = Math.max(daysBetween(firstSeenIso, GOAL_DEADLINE), 1);
    const elapsedDays = Math.max(daysBetween(firstSeenIso, todayKey()), 0);
    const expectedKm = GOAL_KM * Math.min(elapsedDays / totalWindowDays, 1);
    const neededPerDay = kmRemaining / daysRemaining;

    if (totalKm < expectedKm * 0.9) {
      lines.push(
        `You're behind pace for the ${GOAL_KM}km by ${GOAL_DEADLINE} goal. ` +
          `You need about ${neededPerDay.toFixed(1)}km/day for the next ${daysRemaining} days — you've got this, pick it up! 💪`
      );
    } else {
      lines.push(
        `You're on track for ${GOAL_KM}km by ${GOAL_DEADLINE}. ` +
          `Keep averaging about ${neededPerDay.toFixed(1)}km/day for the remaining ${daysRemaining} days.`
      );
    }
  }

  if (daysTracked > 0 && pushupDaysDone < daysTracked) {
    const missed = daysTracked - pushupDaysDone;
    lines.push(`You missed pushups on ${missed} tracked day(s) — the goal is 10 every single day, no skipping!`);
  } else if (daysTracked > 0) {
    lines.push('Perfect pushup streak so far — every tracked day done. Keep it up!');
  }

  return lines.join('\n');
}

function sendWeeklySummary() {
  for (const chatId of store.getAllUserIds()) {
    const user = store.getUser(chatId);
    const { totalKm, daysTracked, pushupDaysDone } = store.getTotals(chatId);
    const name = user && user.name ? user.name : 'there';
    const firstSeenIso = user ? user.firstSeen : new Date().toISOString();

    const message =
      `Hey ${name}, here's your weekly summary — totals to date:\n\n` +
      `Brisk walk distance: ${totalKm.toFixed(1)} / ${GOAL_KM} km (goal by ${GOAL_DEADLINE})\n` +
      `Pushup days completed: ${pushupDaysDone}\n` +
      `Days tracked: ${daysTracked}\n\n` +
      buildMotivation(totalKm, pushupDaysDone, daysTracked, firstSeenIso);

    bot.telegram
      .sendMessage(Number(chatId), message)
      .catch((err) => console.error('Failed to message', chatId, err.message));
  }
}

// Daily check-in at 20:00 every day.
cron.schedule('0 20 * * *', sendDailyQuestions, { timezone: TIMEZONE });

// Weekly summary every Thursday at 21:00.
cron.schedule('0 21 * * 4', sendWeeklySummary, { timezone: TIMEZONE });

bot.launch().then(() => {
  console.log(`wajibot is running (timezone: ${TIMEZONE})`);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
