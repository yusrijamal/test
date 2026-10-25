const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'data.json');

function load() {
  if (!fs.existsSync(DATA_FILE)) {
    return { users: {}, responses: {} };
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function save(data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

let data = load();

function upsertUser(chatId, name) {
  const key = String(chatId);
  if (!data.users[key]) {
    data.users[key] = { chatId, name, firstSeen: new Date().toISOString() };
    save(data);
  }
}

function getAllUserIds() {
  return Object.keys(data.users);
}

function recordKm(chatId, date, kmRaw, kmValue) {
  const key = String(chatId);
  data.responses[key] = data.responses[key] || {};
  data.responses[key][date] = data.responses[key][date] || {};
  data.responses[key][date].kmRaw = kmRaw;
  data.responses[key][date].km = kmValue;
  save(data);
}

function recordPushups(chatId, date, done) {
  const key = String(chatId);
  data.responses[key] = data.responses[key] || {};
  data.responses[key][date] = data.responses[key][date] || {};
  data.responses[key][date].pushups = done;
  save(data);
}

function getTotals(chatId) {
  const key = String(chatId);
  const days = data.responses[key] || {};
  let totalKm = 0;
  let daysTracked = 0;
  let pushupDaysDone = 0;
  for (const date of Object.keys(days)) {
    const entry = days[date];
    if (typeof entry.km === 'number') totalKm += entry.km;
    if (typeof entry.km === 'number' || typeof entry.pushups === 'boolean') daysTracked += 1;
    if (entry.pushups === true) pushupDaysDone += 1;
  }
  return { totalKm, daysTracked, pushupDaysDone };
}

module.exports = {
  upsertUser,
  getAllUserIds,
  recordKm,
  recordPushups,
  getTotals,
};
