require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const cron = require('node-cron');
const store = require('./store');
const { parseKm } = require('./parseKm');

const BOT_TOKEN = process.env.BOT_TOKEN;
const TIMEZONE = process.env.TIMEZONE || 'Asia/Jakarta';

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
  ctx.reply(
    "Welcome to wajibot! Every day at 8pm I'll ask about your brisk walk (with 5kg weights) " +
      "and your pushups. Every Thursday at 9pm I'll send you a summary of your totals to date."
  );
});

bot.on('text', (ctx) => {
  const chatId = ctx.chat.id;
  const session = sessions.get(chatId);
  if (!session || session.step !== 'awaiting_km') return;

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

function sendWeeklySummary() {
  for (const chatId of store.getAllUserIds()) {
    const { totalKm, daysTracked, pushupDaysDone } = store.getTotals(chatId);
    const message =
      'Weekly summary — your totals to date:\n\n' +
      `Brisk walk distance: ${totalKm.toFixed(1)} km\n` +
      `Pushup days completed: ${pushupDaysDone}\n` +
      `Days tracked: ${daysTracked}`;
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
