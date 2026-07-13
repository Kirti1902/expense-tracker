const dns = require('dns');
dns.setDefaultResultOrder('ipv4first'); // avoids ETIMEDOUT on networks with broken/unreliable IPv6

require('dotenv').config();
const { createServer } = require('./server/api');
const { createBot } = require('./server/bot');

const PORT = process.env.PORT || 3000;

const app = createServer();
app.listen(PORT, () => {
  console.log(`📊 Dashboard running at http://localhost:${PORT}`);
});

const bot = createBot();
if (bot) {
  bot.launch();
  console.log('🤖 Telegram bot is running...');
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}
