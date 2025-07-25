# Referral/Vouch Tracker Discord Bot
A Discord bot for tracking user referrals and vouch counts in your server, powered by Node.js, discord.js, and SQLite3.

## ✨ Features
- Slash commands for tracking referrals ("vouches") and users
- Each server (guild) has its own database, so data is isolated
- Add, list, decrease, reset, and redeem vouch/referral points
- Simple SQLite database for persistent storage
- Uses ephemeral reply for DM restriction and sensitive operations

## 🚀 Setup & Installation
1. Clone the repository
```bash
git clone <your-repo-url>
cd <repo-folder>
```
2. Install dependencies
Install with npm:

```bash
npm install
```
3. Configure Environment Variables
Copy or create a .env.sample file and set the following variables inside .env

```text
TOKEN=your_discord_bot_token
CLIENT_ID=your_discord_application_client_id
```
Get your bot token and client ID from the Discord Developer Portal.

4. Start the bot
```bash
node index.js
```
On successful start, you should see:

```text
🤖 Bot is online as <botname>!
Bot is connected to X guild(s).
```
All slash commands will also auto-register.

## ⚡ Available Commands
All commands are registered as slash commands.

`/refferal`
- Track a referral between users. ("vouch" someone for inviting another)

`/referral-list`
- View which users have referred others.

`/reset-referral-of-user`
- Reset the vouch/referral count of a specific user.

`/decrease-referral-of-user`
- Decrease the vouch/referral count of a user by 1.

`/referral-bonus`
- User redeems their referral points (optionally used on another user).

## 🛠️ Technical Notes
- Bot auto-creates one SQLite3 database file per guild, e.g. guild_1234567890.db
- Will not respond in DMs (replies ephemerally if used outside a guild)
- Uses Discord's latest (v14+) API and modern slash commands
- All bot activity and errors are logged to the console
- Data is persistent per guild, and safe on bot restarts
