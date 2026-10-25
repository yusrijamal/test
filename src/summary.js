const config = require('./config');
const store = require('./store');
const { daysBetween } = require('./dates');

function buildWeeklySummary() {
  const users = store.allUsers().filter((u) => u.name);
  if (users.length === 0) return null;

  const start = store.getChallengeStartDate();
  const now = new Date();
  const totalDays = Math.max(daysBetween(new Date(start), new Date(config.GOAL_DEADLINE)), 1);
  const daysElapsed = Math.max(daysBetween(new Date(start), new Date(now)), 0);
  const expectedKm = config.GOAL_KM * Math.min(daysElapsed / totalDays, 1);

  const lines = [`📊 *Weekly progress toward ${config.GOAL_KM}km by ${config.GOAL_DEADLINE.toLocaleDateString('en-GB')}*`, ''];
  const laggers = [];
  let groupKm = 0;

  for (const user of users) {
    const records = Object.values(user.records);
    const km = records.reduce((sum, r) => sum + (r.km || 0), 0);
    const trackedDays = records.length;
    const pushupDays = records.filter((r) => r.pushups).length;
    groupKm += km;

    const pct = Math.min(Math.round((km / config.GOAL_KM) * 100), 999);
    lines.push(
      `• *${user.name}*: ${km.toFixed(1)}km / ${config.GOAL_KM}km (${pct}%) — ` +
        `${config.GOAL_PUSHUPS} pushups on ${pushupDays}/${trackedDays} tracked days`
    );

    if (km < expectedKm * 0.9) {
      laggers.push(user);
    }
  }

  lines.push('');
  lines.push(`Group total: ${groupKm.toFixed(1)}km`);

  if (laggers.length > 0) {
    lines.push('');
    lines.push("💪 Let's go, don't let the goal slip:");
    for (const user of laggers) {
      lines.push(`${user.name}, you're behind pace — a few extra km this week and you'll catch up!`);
    }
  } else if (daysElapsed > 0) {
    lines.push('');
    lines.push('Everyone is on pace. Keep it up! 🔥');
  }

  return lines.join('\n');
}

module.exports = { buildWeeklySummary };
