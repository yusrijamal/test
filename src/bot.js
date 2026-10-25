const { Telegraf, Markup } = require('telegraf');
const config = require('./config');
const store = require('./store');
const { todayKey } = require('./dates');
const { parseKm, parseYesNo } = require('./parse');

const bot = new Telegraf(config.BOT_TOKEN);

const Q_KM = 'How many km did you brisk walk today with 5kg weights? (just the number is fine, e.g. 3 or 3km)';
const Q_PUSHUP = 'Did you do your 10 pushups today?';

function askKm(ctx, chatId) {
  return bot.telegram.sendMessage(chatId, Q_KM);
}

function askPushup(ctx, chatId) {
  return bot.telegram.sendMessage(
    chatId,
    Q_PUSHUP,
    Markup.inlineKeyboard([
      Markup.button.callback('Yes', 'pushup_yes'),
      Markup.button.callback('No', 'pushup_no'),
    ])
  );
}

bot.start((ctx) => {
  const userId = String(ctx.from.id);
  const existing = store.getUser(userId);
  store.upsertUser(userId, { chatId: ctx.chat.id });

  if (existing && existing.name) {
    ctx.reply(
      `Welcome back, ${existing.name}! I'll check in with you every day at 8pm for your brisk walk + pushups, ` +
        `and post a progress summary every Thursday at 9pm.`
    );
    return;
  }

  store.setUserState(userId, { step: 'awaiting_name' });
  ctx.reply(
    "Welcome to wajibot! Every day I'll ask how far you brisk walked (with 5kg weights) and whether you did " +
      "your 10 pushups. Every Thursday night I'll share everyone's progress toward the group goal.\n\n" +
      "What's your name?"
  );
});

bot.command('setgroup', (ctx) => {
  if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') {
    ctx.reply('Run /setgroup inside the group chat you want weekly summaries posted to.');
    return;
  }
  store.setGroupChatId(ctx.chat.id);
  ctx.reply('Got it — I will post the weekly summary here every Thursday at 9pm.');
});

bot.command('status', (ctx) => {
  const userId = String(ctx.from.id);
  const user = store.getUser(userId);
  if (!user || !user.name) {
    ctx.reply("I don't know you yet — send /start first.");
    return;
  }
  const km = Object.values(user.records).reduce((sum, r) => sum + (r.km || 0), 0);
  ctx.reply(`${user.name}, you've logged ${km.toFixed(1)}km so far toward the ${config.GOAL_KM}km goal.`);
});

bot.on('callback_query', async (ctx) => {
  const userId = String(ctx.from.id);
  const user = store.getUser(userId);
  const data = ctx.callbackQuery.data;

  if (!user || user.state.step !== 'awaiting_pushup' || !['pushup_yes', 'pushup_no'].includes(data)) {
    await ctx.answerCbQuery();
    return;
  }

  const done = data === 'pushup_yes';
  const date = user.state.date;
  store.recordDay(userId, date, { km: user.state.pendingKm, pushups: done });
  store.setUserState(userId, { step: 'idle' });

  await ctx.answerCbQuery();
  await ctx.editMessageReplyMarkup();
  await ctx.reply(
    `Logged for today: ${user.state.pendingKm}km brisk walk, pushups ${done ? 'done' : 'not done'}. ` +
      `${done ? 'Nice work!' : "No worries, get them in tomorrow!"}`
  );
});

bot.on('text', async (ctx) => {
  const userId = String(ctx.from.id);
  const user = store.getUser(userId);
  const text = ctx.message.text.trim();

  if (!user) return; // hasn't /start'ed yet

  if (user.state.step === 'awaiting_name') {
    store.upsertUser(userId, { name: text, chatId: ctx.chat.id });
    store.setUserState(userId, { step: 'idle' });
    ctx.reply(
      `Nice to meet you, ${text}! I'll check in with you every day at 8pm. ` +
        `The group goal is ${config.GOAL_KM}km by ${config.GOAL_DEADLINE.toLocaleDateString('en-GB')} ` +
        `plus ${config.GOAL_PUSHUPS} pushups every day. Let's go!`
    );
    return;
  }

  if (user.state.step === 'awaiting_km') {
    const km = parseKm(text);
    if (km === null) {
      ctx.reply("Sorry, I didn't catch that — please reply with just the number of km, e.g. 3 or 3km.");
      return;
    }
    store.setUserState(userId, { step: 'awaiting_pushup', date: user.state.date, pendingKm: km });
    askPushup(ctx, ctx.chat.id);
    return;
  }

  if (user.state.step === 'awaiting_pushup') {
    // allow a typed yes/no in addition to the buttons
    const yn = parseYesNo(text);
    if (yn === null) {
      ctx.reply('Please tap Yes or No above, or reply "yes"/"no".');
      return;
    }
    const date = user.state.date;
    store.recordDay(userId, date, { km: user.state.pendingKm, pushups: yn });
    store.setUserState(userId, { step: 'idle' });
    ctx.reply(
      `Logged for today: ${user.state.pendingKm}km brisk walk, pushups ${yn ? 'done' : 'not done'}. ` +
        `${yn ? 'Nice work!' : "No worries, get them in tomorrow!"}`
    );
    return;
  }

  // idle chit-chat
  ctx.reply("Nothing to answer right now — I'll check in with you at 8pm. Use /status to see your progress.");
});

async function sendDailyPrompt(userId, user) {
  const date = todayKey();
  store.setUserState(userId, { step: 'awaiting_km', date });
  await askKm(null, user.chatId);
}

module.exports = { bot, sendDailyPrompt };
