const cron = require('node-cron');
const config = require('./config');
const store = require('./store');
const { bot, sendDailyPrompt } = require('./bot');
const { buildWeeklySummary } = require('./summary');

function start() {
  cron.schedule(
    config.DAILY_CRON,
    async () => {
      for (const user of store.allUsers()) {
        if (!user.name || !user.chatId) continue;
        try {
          await sendDailyPrompt(user.id, user);
        } catch (err) {
          console.error(`Failed to send daily prompt to ${user.id}:`, err.message);
        }
      }
    },
    { timezone: config.TZ }
  );

  cron.schedule(
    config.WEEKLY_CRON,
    async () => {
      const summary = buildWeeklySummary();
      if (!summary) return;
      const groupChatId = store.getGroupChatId();
      try {
        if (groupChatId) {
          await bot.telegram.sendMessage(groupChatId, summary, { parse_mode: 'Markdown' });
        } else {
          // no group configured yet — DM every user instead
          for (const user of store.allUsers()) {
            if (user.chatId) await bot.telegram.sendMessage(user.chatId, summary, { parse_mode: 'Markdown' });
          }
        }
      } catch (err) {
        console.error('Failed to send weekly summary:', err.message);
      }
    },
    { timezone: config.TZ }
  );
}

module.exports = { start };
