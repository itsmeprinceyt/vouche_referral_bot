// Import necessary libraries
const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config();

// Check for required environment variables
if (!process.env.TOKEN || !process.env.CLIENT_ID) {
    console.error('Missing TOKEN or CLIENT_ID in .env file.');
    process.exit(1);
}

// Helper function to get or create a database for a guild
function getDatabase(guildId) {
    const db = new sqlite3.Database(`./guild_${guildId}.db`);
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS users (
            user_id TEXT PRIMARY KEY,
            vouch_count INTEGER DEFAULT 0,
            referral_count INTEGER DEFAULT 0
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS vouches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            vouched_for TEXT,
            vouched_by TEXT,
            referral TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
    });
    return db;
}

// Initialize the Discord bot
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent
    ]
});

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

// Register slash commands
const commands = [
    {
        name: 'vouche',
        description: 'Add a vouch for a user',
        options: [
            {
                name: 'user',
                type: 6, // USER type
                description: 'The user you are vouching for',
                required: true
            },
            {
                name: 'referral',
                type: 6, // USER type
                description: 'The referral user',
                required: true
            }
        ]
    },
    {
        name: 'vouch-list',
        description: 'View the list of users with their vouch counts'
    },
    {
        name: 'reset-vouche',
        description: 'Reset vouches for a specific user',
        options: [
            {
                name: 'user',
                type: 6, // USER type
                description: 'The user whose vouches to reset',
                required: true
            }
        ]
    },
    {
        name: 'decrease-vouche',
        description: 'Decrease a vouch for a specific user',
        options: [
            {
                name: 'user',
                type: 6, // USER type
                description: 'The user whose vouch count to decrease',
                required: true
            }
        ]
    }
];

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
(async () => {
    try {
        console.log('Registering slash commands...');
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands }
        );
        console.log('Slash commands registered!');
    } catch (error) {
        console.error('Failed to register slash commands:', error);
    }
})();

// Handle slash commands
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    const { guildId, commandName, options } = interaction;

    if (!guildId) {
        return interaction.reply({ content: 'This bot can only be used in servers.', ephemeral: true });
    }

    const db = getDatabase(guildId);

    if (commandName === 'vouche') {
        const vouchedFor = options.getUser('user');
        const referral = options.getUser('referral');
        const vouchedBy = interaction.user.id;

        // Add vouch to database
        db.run(
            `INSERT INTO vouches (vouched_for, vouched_by, referral) VALUES (?, ?, ?)`,
            [vouchedFor.id, vouchedBy, referral.id],
            (err) => {
                if (err) {
                    console.error(err);
                    return interaction.reply({ content: 'An error occurred while saving the vouch.', ephemeral: true });
                }

                // Increment vouch and referral counts
                db.run(
                    `INSERT INTO users (user_id, vouch_count, referral_count) VALUES (?, 1, 1)
                     ON CONFLICT(user_id) DO UPDATE SET 
                        vouch_count = vouch_count + 1,
                        referral_count = referral_count + 1`,
                    [vouchedFor.id]
                );

                interaction.reply(`${interaction.user} vouched for ${vouchedFor} (Referral: ${referral})!`);
            }
        );
    }

    if (commandName === 'vouch-list') {
        db.all(
            `SELECT user_id, vouch_count FROM users WHERE vouch_count > 0 ORDER BY vouch_count DESC`,
            (err, rows) => {
                if (err) {
                    console.error(err);
                    return interaction.reply({ content: 'An error occurred while retrieving the vouch list.', ephemeral: true });
                }

                if (rows.length === 0) {
                    return interaction.reply('No users have received any vouches yet.');
                }

                const vouchList = rows
                    .map((row, index) => `${index + 1}. <@${row.user_id}>: ${row.vouch_count} vouches`)
                    .join('\n');

                interaction.reply(`🏆 **Vouch List** 🏆\n${vouchList}`);
            }
        );
    }

    if (commandName === 'reset-vouche') {
        const user = options.getUser('user');

        db.run(`DELETE FROM vouches WHERE vouched_for = ?`, [user.id], (err) => {
            if (err) {
                console.error(err);
                return interaction.reply({ content: 'An error occurred while resetting vouches.', ephemeral: true });
            }

            db.run(`UPDATE users SET vouch_count = 0, referral_count = 0 WHERE user_id = ?`, [user.id], () => {
                interaction.reply(`Vouches for ${user} have been reset.`);
            });
        });
    }

    if (commandName === 'decrease-vouche') {
        const user = options.getUser('user');

        db.run(
            `UPDATE users SET vouch_count = vouch_count - 1 WHERE user_id = ? AND vouch_count > 0`,
            [user.id],
            function (err) {
                if (err) {
                    console.error(err);
                    return interaction.reply({ content: 'An error occurred while decreasing the vouch count.', ephemeral: true });
                }

                if (this.changes === 0) {
                    return interaction.reply(`${user} already has 0 vouches.`);
                }

                interaction.reply(`Decreased 1 vouch from ${user}.`);
            }
        );
    }
});

// Log in the bot
client.login(process.env.TOKEN);
