const { Client, GatewayIntentBits, REST, Routes, EmbedBuilder } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config();
const { COLOR_GOLD, COLOR_TRUE, COLOR_FALSE } = require('./utils/utils');

if (!process.env.TOKEN || !process.env.CLIENT_ID || !process.env.DISCORD_INVITE_LINK) {
    console.error('Missing TOKEN, CLIENT_ID or DISCORD_INVITE_LINK in .env file.');
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
        description: 'Reset referrals for a specific user',
        options: [
            {
                name: 'user',
                type: 6,
                description: 'The user whose referrals to reset',
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
    },
    {
        name: 'referral-bonus',
        description: 'Referral points redeemed by a user',
        options: [
            {
                name: 'user',
                type: 6,
                description: 'The user who is redeeming their referral points',
                required: true
            },
            {
                name: 'target',
                type: 6,
                description: 'The user on whom points are being used',
                required: false
            }
        ]
    },
    {
        name: 'invite',
        description: 'Get the Discord server invite link'
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

    // For /invite (works in DMs or guild)
    if (commandName === 'invite') {
        try {
            const embed = new EmbedBuilder()
                .setAuthor({
                    name: 'Referral Tracker Bot',
                    iconURL: interaction.client.user.avatarURL()
                })
                .setThumbnail(interaction.client.user.avatarURL())
                .setTitle('Discord Bot Invite Link')
                .setDescription(process.env.DISCORD_INVITE_LINK)
                .setColor(COLOR_GOLD)
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: false });
        } catch (err) {
            console.error(err);
            await interaction.reply({ content: 'An error occurred while sending the invite link.', ephemeral: true });
        }
        return;
    }

    // For all other commands: require guild
    if (!guildId) {
        console.log(`Command "${commandName}" was run in DM by ${interaction.user.tag}`);
        const embed = new EmbedBuilder()
            .setAuthor({
                name: 'Referral Tracker Bot',
                iconURL: interaction.client.user.avatarURL()
            })
            .setTitle('❌ This bot can only be used in servers.')
            .setDescription('Please use these commands inside a Discord server.')
            .setColor(COLOR_FALSE)
            .setTimestamp();
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    const db = getDatabase(guildId);

    // /refferal
    if (commandName === 'refferal') {
        const vouchedFor = options.getUser('referral'); // who is referring
        const referral = options.getUser('referred');    // who got referred
        const vouchedBy = interaction.user.id;           // who is using the command

        db.run(
            `INSERT INTO vouches (vouched_for, vouched_by, referral) VALUES (?, ?, ?)`,
            [vouchedFor.id, vouchedBy, referral.id],
            (err) => {
                if (err) {
                    console.error(err);
                    const embed = new EmbedBuilder()
                        .setAuthor({
                            name: 'Referral Tracker Bot',
                            iconURL: interaction.client.user.avatarURL()
                        })
                        .setTitle('❌ Database Error')
                        .setDescription('An error occurred while saving the vouch.')
                        .setColor(COLOR_FALSE);
                    return interaction.reply({ embeds: [embed], ephemeral: true });
                }

                db.run(
                    `INSERT INTO users (user_id, vouch_count, referral_count) VALUES (?, 1, 1)
                    ON CONFLICT(user_id) DO UPDATE SET 
                        vouch_count = vouch_count + 1,
                        referral_count = referral_count + 1`,
                    [vouchedFor.id]
                );

                const embed = new EmbedBuilder()
                    .setAuthor({
                        name: 'Referral Tracker Bot',
                        iconURL: interaction.client.user.avatarURL()
                    })
                    .setTitle('✅ Referral Added!')
                    .setDescription(`${vouchedFor} referred 👉 ${referral}`)
                    .setTimestamp()
                    .setColor(COLOR_TRUE);
                interaction.reply({ embeds: [embed] });
                console.log(`Update: ${vouchedFor} referred 👉 ${referral}`);
            }
        );
        return;
    }

    // /referral-list
    if (commandName === 'referral-list') {
        db.all(
            `SELECT user_id, vouch_count FROM users WHERE vouch_count > 0 ORDER BY vouch_count DESC`,
            (err, rows) => {
                if (err) {
                    console.error(err);
                    const embed = new EmbedBuilder()
                        .setAuthor({
                            name: 'Referral Tracker Bot',
                            iconURL: interaction.client.user.avatarURL()
                        })
                        .setTitle('❌ Database Error')
                        .setDescription('An error occurred while retrieving the vouch list.')
                        .setColor(COLOR_FALSE)
                        .setTimestamp();
                    return interaction.reply({ embeds: [embed], ephemeral: true });
                }

                if (rows.length === 0) {
                    const embed = new EmbedBuilder()
                        .setAuthor({
                            name: 'Referral Tracker Bot',
                            iconURL: interaction.client.user.avatarURL()
                        })
                        .setDescription('No users have referred anyone yet.')
                        .setTimestamp();
                    return interaction.reply({ embeds: [embed] });
                }

                const vouchList = rows
                    .map((row, idx) => `**${idx + 1}. <@${row.user_id}>:** ${row.vouch_count} referrals`)
                    .join('\n');

                const embed = new EmbedBuilder()
                    .setAuthor({
                        name: 'Referral Tracker Bot',
                        iconURL: interaction.client.user.avatarURL()
                    })
                    .setThumbnail(interaction.client.user.avatarURL())
                    .setTitle('🏆List')
                    .setDescription(vouchList)
                    .setColor(COLOR_GOLD)
                    .setTimestamp();
                interaction.reply({ embeds: [embed] });
            }
        );
        return;
    }

    // /reset-referral-of-user
    if (commandName === 'reset-referral-of-user') {
        const user = options.getUser('user');

        db.run(`DELETE FROM vouches WHERE vouched_for = ?`, [user.id], (err) => {
            if (err) {
                console.error(err);
                const embed = new EmbedBuilder()
                    .setAuthor({
                        name: 'Referral Tracker Bot',
                        iconURL: interaction.client.user.avatarURL()
                    })
                    .setTitle('❌ Database Error')
                    .setDescription('An error occurred while resetting referrals.')
                    .setColor(COLOR_FALSE);
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            db.run(`UPDATE users SET vouch_count = 0, referral_count = 0 WHERE user_id = ?`, [user.id], () => {
                const embed = new EmbedBuilder()
                    .setAuthor({
                        name: 'Referral Tracker Bot',
                        iconURL: interaction.client.user.avatarURL()
                    })
                    .setTitle('Referrals Reset')
                    .setDescription(`Referrals for ${user} have been reset.`)
                    .setTimestamp();
                interaction.reply({ embeds: [embed] });
            });
        });
        return;
    }

    // /decrease-referral-of-user
    if (commandName === 'decrease-referral-of-user') {
        const user = options.getUser('user');

        db.run(
            `UPDATE users SET vouch_count = vouch_count - 1 WHERE user_id = ? AND vouch_count > 0`,
            [user.id],
            function (err) {
                if (err) {
                    console.error(err);
                    const embed = new EmbedBuilder()
                        .setAuthor({
                            name: 'Referral Tracker Bot',
                            iconURL: interaction.client.user.avatarURL()
                        })
                        .setTitle('❌ Database Error')
                        .setDescription('An error occurred while decreasing the vouch count.')
                        .setColor(COLOR_FALSE);
                    return interaction.reply({ embeds: [embed], ephemeral: true });
                }

                if (this.changes === 0) {
                    const embed = new EmbedBuilder()
                        .setAuthor({
                            name: 'Referral Tracker Bot',
                            iconURL: interaction.client.user.avatarURL()
                        })
                        .setTitle('⚠️ No Referrals')
                        .setDescription(`${user} already has 0 referrals.`)
                        .setColor(COLOR_FALSE);
                    return interaction.reply({ embeds: [embed] });
                }

                const embed = new EmbedBuilder()
                    .setAuthor({
                        name: 'Referral Tracker Bot',
                        iconURL: interaction.client.user.avatarURL()
                    })
                    .setTitle('Referral Decreased')
                    .setDescription(`Decreased 1 referral from ${user}.`)
                    .setColor(COLOR_TRUE)
                    .setTimestamp();
                interaction.reply({ embeds: [embed] });
            }
        );
        return;
    }

    // /referral-bonus
    if (commandName === 'referral-bonus') {
        const user = options.getUser('user');
        const target = options.getUser('target');
        let description = `${user} has redeemed their referral points 🎉`;
        if (target) {
            description = `${user} has redeemed their referral points. Points used on ${target} 🎉`;
        }
        const embed = new EmbedBuilder()
            .setAuthor({
                name: 'Referral Tracker Bot',
                iconURL: interaction.client.user.avatarURL()
            })
            .setTitle('🎁 Referral Bonus Redeemed')
            .setDescription(description)
            .setColor(COLOR_TRUE)
            .setTimestamp();
        await interaction.reply({
            embeds: [embed],
            allowedMentions: { users: [user.id, target?.id] }
        });
        console.log(
            `Name: ${user.tag} (${user.id}) has redeemed their referral points${target ? ` on ${target.tag} (${target.id})` : ''}.`
        );
        return;
    }
});

client.login(process.env.TOKEN);