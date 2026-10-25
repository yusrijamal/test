const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'data.json');

function load() {
  if (!fs.existsSync(DATA_FILE)) {
    return { users: {}, groupChatId: null, challengeStartDate: null };
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function save(data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

let data = load();

function persist() {
  save(data);
}

function getUser(userId) {
  return data.users[userId];
}

function upsertUser(userId, fields) {
  const existing = data.users[userId] || {
    id: userId,
    name: null,
    chatId: null,
    state: { step: 'idle' },
    records: {}, // date -> { km, pushups }
  };
  data.users[userId] = { ...existing, ...fields };
  if (!data.challengeStartDate) {
    data.challengeStartDate = new Date().toISOString();
  }
  persist();
  return data.users[userId];
}

function setUserState(userId, state) {
  const user = data.users[userId];
  if (!user) return;
  user.state = state;
  persist();
}

function recordDay(userId, date, fields) {
  const user = data.users[userId];
  if (!user) return;
  user.records[date] = { ...(user.records[date] || {}), ...fields };
  persist();
}

function allUsers() {
  return Object.values(data.users);
}

function setGroupChatId(chatId) {
  data.groupChatId = chatId;
  persist();
}

function getGroupChatId() {
  return data.groupChatId;
}

function getChallengeStartDate() {
  return data.challengeStartDate ? new Date(data.challengeStartDate) : new Date();
}

module.exports = {
  getUser,
  upsertUser,
  setUserState,
  recordDay,
  allUsers,
  setGroupChatId,
  getGroupChatId,
  getChallengeStartDate,
};
