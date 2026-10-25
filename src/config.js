require('dotenv').config();

function parseDdMmYyyy(value) {
  const [d, m, y] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  throw new Error('BOT_TOKEN is not set. Copy .env.example to .env and fill it in.');
}

module.exports = {
  BOT_TOKEN,
  TZ: process.env.TZ || 'Asia/Jakarta',
  GOAL_KM: Number(process.env.GOAL_KM || 30),
  GOAL_PUSHUPS: Number(process.env.GOAL_PUSHUPS || 10),
  GOAL_DEADLINE: parseDdMmYyyy(process.env.GOAL_DEADLINE || '13-11-2026'),
  DAILY_CRON: '0 20 * * *', // 8:00 PM every day
  WEEKLY_CRON: '0 21 * * 4', // 9:00 PM every Thursday
};
