const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config();

if (!process.env.TOKEN || !process.env.CLIENT_ID) {
    console.error('Missing TOKEN or CLIENT_ID in .env file.');
    process.exit(1);
}

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

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent
    ]
});

client.once('ready', () => {
    console.log(`🤖 Bot is online as ${client.user.tag}!`);
    console.log(`Bot is connected to ${client.guilds.cache.size} guild(s).`);
});

const commands = [
    {
        name: 'refferal',
        description: 'Add a vouch for a user',
        options: [
            {
                name: 'referral',
                type: 6,
                description: 'The user who is referring.',
                required: true
            },
            {
                name: 'referred',
                type: 6,
                description: 'The referred user.',
                required: true
            }
        ]
    },
    {
        name: 'referral-list',
        description: 'View the list of users with their vouch counts'
    },
    {
        name: 'reset-referral-of-user',
        description: 'Reset vouches for a specific user',
        options: [
            {
                name: 'user',
                type: 6,
                description: 'The user whose vouches to reset',
                required: true
            }
        ]
    },
    {
        name: 'decrease-referral-of-user',
        description: 'Decrease a vouch for a specific user',
        options: [
            {
                name: 'user',
                type: 6,
                description: 'The user whose vouch count to decrease',
                required: true
            }
        ]
    }
];

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
(async () => {
    try {
        console.log('🔄 Registering slash commands...');
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands }
        );
        console.log('✅ Slash commands registered successfully!');
    } catch (error) {
        console.error('❌ Failed to register slash commands:', error);
    }
})();

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    console.log(`📥 Received command: ${interaction.commandName}`);
    console.log(`🔍 User: ${interaction.user.tag} (${interaction.user.id})`);
    console.log(`🌐 Guild: ${interaction.guild?.name || 'DM'}`);

    const { commandName, options } = interaction;

    const guildId = interaction.guild?.id;

    console.log(`Guild ID: ${guildId}`); // Debugging line to check if guildId is present
    if (!guildId) {
        console.log(`Command "${commandName}" was run in DM by ${interaction.user.tag}`);
        return interaction.reply({ content: 'This bot can only be used in servers.', ephemeral: true });
    }
    const db = getDatabase(guildId);

    if (commandName === 'refferal') {
        const vouchedFor = options.getUser('referral'); // who is referring
        const referral = options.getUser('referred'); // who got referred
        const vouchedBy = interaction.user.id; // who is using the command

        db.run(
            `INSERT INTO vouches (vouched_for, vouched_by, referral) VALUES (?, ?, ?)`,
            [vouchedFor.id, vouchedBy, referral.id],
            (err) => {
                if (err) {
                    console.error(err);
                    return interaction.reply({ content: 'An error occurred while saving the vouch.', ephemeral: true });
                }

                db.run(
                    `INSERT INTO users (user_id, vouch_count, referral_count) VALUES (?, 1, 1)
                     ON CONFLICT(user_id) DO UPDATE SET 
                        vouch_count = vouch_count + 1,
                        referral_count = referral_count + 1`,
                    [vouchedFor.id]
                );

                interaction.reply(`${vouchedFor} Referred 👉 ${referral}`);
                console.log(`Update: ${vouchedFor} Referred 👉 ${referral}`)
            }
        );
    }

    if (commandName === 'referral-list') {
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
                    .map((row, index) => `${index + 1}. <@${row.user_id}> has referred ${row.vouch_count} times!`)
                    .join('\n');

                interaction.reply(`🏆 **Referral Count List** 🏆\n${vouchList}`);
            }
        );
    }

    if (commandName === 'reset-referral-of-user') {
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

    if (commandName === 'decrease-referral-of-user') {
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

client.login(process.env.TOKEN);
