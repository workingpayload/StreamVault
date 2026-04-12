/**
 * One-time script to generate a Telegram string session.
 * Run with: npm run generate-session
 *
 * You'll need:
 * 1. Your API ID and API Hash from https://my.telegram.org
 * 2. Your phone number (with country code)
 * 3. The verification code Telegram sends you
 */

require('dotenv').config();

const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const input = require('input');

const API_ID = parseInt(process.env.TELEGRAM_API_ID);
const API_HASH = process.env.TELEGRAM_API_HASH;

if (!API_ID || !API_HASH) {
  console.error('❌ Please set TELEGRAM_API_ID and TELEGRAM_API_HASH in your .env file first.');
  process.exit(1);
}

(async () => {
  console.log('\n🔐 Telegram Session Generator');
  console.log('=============================\n');
  console.log('This will log into your Telegram account and generate a session string.');
  console.log('You only need to do this once.\n');

  const stringSession = new StringSession('');
  const client = new TelegramClient(stringSession, API_ID, API_HASH, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => await input.text('📱 Enter your phone number (with country code, e.g. +91...): '),
    password: async () => await input.text('🔑 Enter your 2FA password (if enabled, otherwise press Enter): '),
    phoneCode: async () => await input.text('📨 Enter the verification code Telegram sent you: '),
    onError: (err) => console.error('Error:', err),
  });

  console.log('\n✅ Successfully logged in!\n');

  const session = client.session.save();
  console.log('📋 Your session string (copy this to .env as TELEGRAM_STRING_SESSION):');
  console.log('\n' + session + '\n');

  // Also try to find the channel
  console.log('\n🔍 Looking for your channels...\n');

  try {
    const dialogs = await client.getDialogs({});
    const channels = dialogs.filter(d => d.isChannel);

    if (channels.length > 0) {
      console.log('Your channels:');
      for (const ch of channels) {
        const entity = ch.entity;
        const id = entity.id ? `-100${entity.id}` : 'unknown';
        console.log(`  📺 ${ch.title} (ID: ${id})`);
      }
      console.log('\nCopy the channel ID to .env as TELEGRAM_CHANNEL_ID');
    } else {
      console.log('No channels found. Make sure you are an admin of the channel.');
    }
  } catch (err) {
    console.error('Could not list channels:', err.message);
  }

  await client.disconnect();
  process.exit(0);
})();
