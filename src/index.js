const { bot } = require('./bot');
const scheduler = require('./scheduler');

scheduler.start();

bot.launch().then(() => {
  console.log('wajibot is running.');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
