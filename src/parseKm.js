function parseKm(text) {
  const match = String(text).match(/(\d+(?:[.,]\d+)?)/);
  if (!match) return null;
  return parseFloat(match[1].replace(',', '.'));
}

module.exports = { parseKm };
