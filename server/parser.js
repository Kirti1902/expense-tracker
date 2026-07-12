// Maps keywords found in the note to a category.
// Add/edit freely to match your own spending habits.
const CATEGORY_KEYWORDS = {
  food: ['lunch', 'dinner', 'breakfast', 'food', 'restaurant', 'cafe', 'coffee', 'snack', 'pizza', 'burger', 'zomato', 'swiggy', 'tea'],
  grocery: ['grocery', 'groceries', 'vegetables', 'fruits', 'supermarket', 'mart', 'bigbasket'],
  transport: ['uber', 'ola', 'taxi', 'bus', 'train', 'metro', 'fuel', 'petrol', 'diesel', 'cab', 'auto', 'flight', 'ticket'],
  shopping: ['shopping', 'clothes', 'shoes', 'amazon', 'flipkart', 'mall', 'myntra'],
  bills: ['rent', 'electricity', 'water bill', 'wifi', 'internet', 'phone bill', 'recharge', 'emi', 'insurance', 'bill'],
  entertainment: ['movie', 'netflix', 'spotify', 'game', 'concert', 'party', 'prime', 'hotstar'],
  health: ['medicine', 'doctor', 'hospital', 'pharmacy', 'gym', 'medical'],
};

function detectCategory(note) {
  const lower = note.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return category;
    }
  }
  return 'other';
}

const VALID_CATEGORIES = [...Object.keys(CATEGORY_KEYWORDS), 'other'];

// Parses messages like:
//   "250 lunch"
//   "1200 groceries for the week"
//   "80 coffee food"        (explicit category as last word, if it matches a known category)
function parseExpenseMessage(text) {
  const trimmed = text.trim();
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s+(.+)$/);
  if (!match) return null;

  const amount = parseFloat(match[1]);
  let note = match[2].trim();
  if (!amount || amount <= 0 || !note) return null;

  // If the last word explicitly names a valid category, use it and strip it from the note.
  const words = note.split(/\s+/);
  const lastWord = words[words.length - 1].toLowerCase();
  let category;
  if (VALID_CATEGORIES.includes(lastWord) && words.length > 1) {
    category = lastWord;
    note = words.slice(0, -1).join(' ');
  } else {
    category = detectCategory(note);
  }

  return { amount, category, note };
}

module.exports = { parseExpenseMessage, detectCategory, VALID_CATEGORIES };
