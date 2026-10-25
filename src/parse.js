// Extracts a km distance from free text like "3", "3km", "3 km", "about 3.5".
// Returns a number, or null if no number could be found.
function parseKm(text) {
  const match = text.replace(',', '.').match(/(\d+(\.\d+)?)/);
  if (!match) return null;
  const value = Number(match[1]);
  if (Number.isNaN(value) || value < 0 || value > 200) return null;
  return value;
}

// Interprets a free-text yes/no answer. Returns true, false, or null if unclear.
function parseYesNo(text) {
  const t = text.trim().toLowerCase();
  if (['y', 'yes', 'yep', 'yup', 'ya', 'done', 'iya', 'sudah'].includes(t)) return true;
  if (['n', 'no', 'nope', 'not yet', 'belum', 'tidak'].includes(t)) return false;
  return null;
}

module.exports = { parseKm, parseYesNo };
