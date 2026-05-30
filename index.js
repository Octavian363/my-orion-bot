require('dotenv').config();

const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');

// 1. SECURE CONFIGURATION
// Îi dăm o cheie de rezervă locală dacă process.env e gol pe PC-ul tău
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY; 
const MEMORY_FILE = path.join(__dirname, 'memory.json');

const WELCOME_CHANNEL_NAME = "general"; 

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMembers, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent
    ] 
});

const groq = new Groq({ apiKey: GROQ_API_KEY });
let chats = new Map();

const BANNED_WORDS = ['scamlink', 'free-nitro', 'discord.gg/', 'http://', 'https://'];

function loadMemory() {
    try {
        if (fs.existsSync(MEMORY_FILE)) {
            const data = fs.readFileSync(MEMORY_FILE, 'utf8');
            const parsed = JSON.parse(data);
            chats = new Map(Object.entries(parsed));
            console.log('💾 Permanent memory loaded successfully from memory.json!');
        } else {
            chats = new Map();
        }
    } catch (error) {
        chats = new Map();
    }
}

function saveMemory() {
    try {
        const obj = Object.fromEntries(chats);
        fs.writeFileSync(MEMORY_FILE, JSON.stringify(obj, null, 2), 'utf8');
    } catch (error) {}
}

// 2. DEFINE ALL SLASH COMMANDS
const commands = [
    new SlashCommandBuilder()
        .setName('ask')
        .setDescription('Ask OrionAI a question')
        .addStringOption(option => 
            option.setName('message')
                .setDescription('What do you want to ask the bot?')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('reset')
        .setDescription('Reset your conversation history with OrionAI'),
    new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Delete a specific amount of messages from this channel')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Number of messages to delete (1-100)')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Kick a user with a savage AI-generated roast display')
        .addUserOption(option =>
            option.setName('target')
                .setDescription('The user you want to roast and kick')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('topic')
                .setDescription('Optional: What should the AI roast them for?')
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
    new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Ban a user permanently with a brutal AI roast card')
        .addUserOption(option =>
            option.setName('target')
                .setDescription('The user you want to ban')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('topic')
                .setDescription('Optional: What should the AI roast them for?')
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    new SlashCommandBuilder()
        .setName('unban')
        .setDescription('Unban a user from the server using their exact Username')
        .addStringOption(option =>
            option.setName('username')
                .setDescription('The exact username of the person (e.g., gabriel_12)')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    new SlashCommandBuilder()
        .setName('coinflip')
        .setDescription('Flip a coin! Head or Tail?'),
    new SlashCommandBuilder()
        .setName('rps')
        .setDescription('Play Rock, Paper, Scissors against OrionAI!')
        .addStringOption(option =>
            option.setName('choice')
                .setDescription('Choose your weapon')
                .setRequired(true)
                .addChoices(
                    { name: '✊ Rock', value: 'rock' },
                    { name: '✋ Paper', value: 'paper' },
                    { name: '✌️ Scissors', value: 'scissors' }
                )
        ),
    new SlashCommandBuilder()
        .setName('serverinfo')
        .setDescription('Display cool statistics and information about this server')
].map(command => command.toJSON());

// 3. BOT READY EVENT
client.once('clientReady', async () => {
    console.log(`🔒 Bot is online with Llama 3.3 Versatile (Groq): ${client.user.tag}`);
    loadMemory();

    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    try {
        console.log('Registering global slash commands...');
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ All slash commands are completely live in English!');
    } catch (error) { 
        console.error(error); 
    }
});

// WELCOME EVENT
client.on('guildMemberAdd', async member => {
    const welcomeChannel = member.guild.channels.cache.find(ch => ch.name === WELCOME_CHANNEL_NAME);
    if (!welcomeChannel) {
        console.log(`⚠️ Could not find a text channel named "${WELCOME_CHANNEL_NAME}" to send the welcome card.`);
        return;
    }

    const welcomeEmbed = new EmbedBuilder()
        .setColor('#00FF00') 
        .setTitle(`👋 Welcome to ${member.guild.name}!`)
        .setDescription(`Hello <@${member.id}>! We are super excited to have you here with us. 🎉`)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .addFields(
            { name: '👤 Member Username', value: member.user.tag, inline: true },
            { name: '📊 Total Members', value: `${member.guild.memberCount}`, inline: true }
        )
        .setTimestamp()
        .setFooter({ text: 'OrionAI Welcome System', iconURL: client.user.displayAvatarURL() });

    welcomeChannel.send({ embeds: [welcomeEmbed] }).catch(() => {});
});

// 4. AUTOMOD
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    const lowerContent = message.content.toLowerCase();
    const containsBanned = BANNED_WORDS.some(word => lowerContent.includes(word));

    if (containsBanned) {
        if (message.member.permissions.has(PermissionFlagsBits.Administrator)) return;
        try {
            await message.delete();
            const warning = await message.channel.send(`⚠️ <@${message.author.id}>, your message was removed automatically because it contained a restricted link or phrase.`);
            setTimeout(() => warning.delete().catch(() => {}), 5000);
        } catch (error) {}
    }
});

// 5. INTERACTION LOGIC
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    // --- HANDLE /ASK ---
    if (commandName === 'ask') {
        const userMessage = interaction.options.getString('message');
        const userId = interaction.user.id;
        await interaction.deferReply();

        if (!chats.has(userId)) {
            chats.set(userId, [
                { role: "system", content: "Hello! My name is OrionAI. I am a powerful Discord bot with full Administrator permissions. I have the right to use @everyone and @here. I will answer in a helpful, smart, and friendly way in English." }
            ]);
        }
        
        const history = chats.get(userId);
        history.push({ role: "user", content: userMessage });

        try {
            const response = await groq.chat.completions.create({
                model: "llama-3.3-70b-versatile", 
                messages: history,
            });

            const aiMessage = response.choices[0].message.content;
            history.push({ role: "assistant", content: aiMessage });
            saveMemory();
            
            let finalMessage = aiMessage;
            if (userMessage.toLowerCase().includes('all') || userMessage.toLowerCase().includes('everyone')) {
                try {
                    const members = await interaction.guild.members.fetch();
                    const memberPings = members.filter(m => !m.user.bot).map(m => `<@${m.id}>`).join(' ');
                    if (memberPings.length > 0) finalMessage += `\n\n**Members:**\n${memberPings}`;
                } catch (e) {}
            }

            if (finalMessage.length > 2000) {
                await interaction.editReply({ content: finalMessage.substring(0, 1950) + "...", allowedMentions: { parse: ['everyone', 'roles', 'users'] } });
            } else {
                await interaction.editReply({ content: finalMessage, allowedMentions: { parse: ['everyone', 'roles', 'users'] } });
            }
        } catch (err) {
            await interaction.editReply({ content: `❌ Generation failed: ${err.message}` });
        }
    }

    // --- HANDLE /RESET ---
    if (commandName === 'reset') {
        const userId = interaction.user.id;
        if (chats.has(userId)) {
            chats.delete(userId);
            saveMemory();
            await interaction.reply({ content: '🔄 Your conversation history with OrionAI has been completely wiped!', ephemeral: true });
        } else {
            await interaction.reply({ content: '📝 You do not have any active session memory to clear.', ephemeral: true });
        }
    }

    // --- HANDLE /CLEAR ---
    if (commandName === 'clear') {
        const amount = interaction.options.getInteger('amount');
        if (amount < 1 || amount > 100) return interaction.reply({ content: '❌ You can only delete between 1 and 100 messages at a time.', ephemeral: true });
        try {
            const deletedMessages = await interaction.channel.bulkDelete(amount, true);
            await interaction.reply({ content: `🧹 Successfully cleared **${deletedMessages.size}** messages from this channel!`, ephemeral: true });
        } catch (error) {
            await interaction.reply({ content: '❌ Failed to clear messages. Discord does not allow deleting messages older than 14 days.', ephemeral: true });
        }
    }

    // --- HANDLE /KICK ---
    if (commandName === 'kick') {
        const targetUser = interaction.options.getUser('target');
        const topic = interaction.options.getString('topic') || 'general bad behavior';
        await interaction.deferReply();

        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        if (!targetMember || targetUser.id === interaction.user.id || targetUser.id === client.user.id || !targetMember.kickable) {
            return interaction.editReply({ content: '❌ Cannot kick this user. Verify server hierarchies.' });
        }

        let roastMessage = "Pack your bags.";
        try {
            const roastResponse = await groq.chat.completions.create({
                model: "llama-3.3-70b-versatile",
                messages: [
                    { role: "system", content: "You are a savage, funny, and incredibly witty AI. Write a short 1-2 sentence brutal roast for a Discord user getting kicked. No emojis." },
                    { role: "user", content: `Roast ${targetUser.username}. Topic: ${topic}.` }
                ]
            });
            roastMessage = roastResponse.choices[0].message.content;
        } catch (apiError) {}

        const kickEmbed = new EmbedBuilder()
            .setColor('#FF5500')
            .setTitle('💥 YOU HAVE BEEN KICKED!')
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
            .setDescription(`You were removed from **${interaction.guild.name}** by the moderation team.`)
            .addFields(
                { name: '🔥 OrionAI\'s Roast', value: `*"${roastMessage}"*` },
                { name: '📋 Topic', value: topic }
            )
            .setTimestamp();

        try {
            await targetUser.send({ embeds: [kickEmbed] }).catch(() => {});
            await targetMember.kick(`AI Roast: ${roastMessage.substring(0, 450)}`);
            await interaction.editReply({ content: `💥 **${targetUser.tag}** has been officially booted! Here is their parting card:`, embeds: [kickEmbed] });
        } catch (error) {
            await interaction.editReply({ content: '❌ Error executing kick.' });
        }
    }

    // --- HANDLE /BAN ---
    if (commandName === 'ban') {
        const targetUser = interaction.options.getUser('target');
        const topic = interaction.options.getString('topic') || 'violating server rules';
        await interaction.deferReply();

        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        if (targetUser.id === interaction.user.id) return interaction.editReply({ content: "❌ You cannot ban yourself!" });
        if (targetUser.id === client.user.id) return interaction.editReply({ content: "❌ I cannot ban myself!" });
        if (targetMember && !targetMember.bannable) return interaction.editReply({ content: "❌ I cannot ban this user. Check role hierarchies." });

        let roastMessage = "Banned for eternity.";
        try {
            const roastResponse = await groq.chat.completions.create({
                model: "llama-3.3-70b-versatile",
                messages: [
                    { role: "system", content: "You are an extremely savage, ruthless and witty AI. Write a devastating 1-2 sentence roast for a Discord user getting permanently banned. No emojis." },
                    { role: "user", content: `Write a final brutal ban roast for ${targetUser.username}. Reason/Topic: ${topic}.` }
                ]
            });
            roastMessage = roastResponse.choices[0].message.content;
        } catch (apiError) {}

        const banEmbed = new EmbedBuilder()
            .setColor('#990000') 
            .setTitle('🚫 BAN HAMMER HAS SPOKEN!')
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
            .setDescription(`**${targetUser.tag}** has been permanently banned from **${interaction.guild.name}**!`)
            .addFields(
                { name: '🔥 Ultimate AI Roast', value: `*"${roastMessage}"*` },
                { name: '📋 Violation Topic', value: topic }
            )
            .setTimestamp();

        try {
            await targetUser.send({ embeds: [banEmbed] }).catch(() => {});
            await interaction.guild.members.ban(targetUser.id, { reason: `AI Roast: ${roastMessage}`, deleteMessageSeconds: 86400 });
            await interaction.editReply({ content: `⚡ **The Ban Hammer has dropped!** Goodbye, user.`, embeds: [banEmbed] });
        } catch (error) {
            await interaction.editReply({ content: '❌ Error executing ban.' });
        }
    }

    // --- HANDLE /UNBAN ---
    if (commandName === 'unban') {
        const inputUsername = interaction.options.getString('username').toLowerCase().trim();
        await interaction.deferReply();

        try {
            const banList = await interaction.guild.bans.fetch();
            const bannedInfo = banList.find(b => b.user.username.toLowerCase() === inputUsername);

            if (!bannedInfo) {
                return interaction.editReply({ content: `❌ I could not find any banned user with the exact username **"${inputUsername}"**. Please make sure the letters match!` });
            }

            const bannedUser = bannedInfo.user;
            let mercyMessage = "You have been given a second chance.";
            try {
                const aiResponse = await groq.chat.completions.create({
                    model: "llama-3.3-70b-versatile",
                    messages: [
                        { role: "system", content: "You are a smart, slightly sarcastic but generous AI bot. Write a short 1-sentence witty or funny message welcoming back a user who just got unbanned. No emojis." },
                        { role: "user", content: `Write a welcome back line for the user ${bannedUser.username}.` }
                    ]
                });
                mercyMessage = aiResponse.choices[0].message.content;
            } catch (e) {}

            await interaction.guild.members.unban(bannedUser.id);

            const unbanEmbed = new EmbedBuilder()
                .setColor('#00AAFF') 
                .setTitle('🔓 THE BAN HAS BEEN REVOKED!')
                .setDescription(`**${bannedUser.tag}** has been successfully unbanned and can rejoin the server!`)
                .addFields({ name: '🕊️ OrionAI\'s Second Chance Message', value: `*"${mercyMessage}"*` })
                .setTimestamp();

            await interaction.editReply({ embeds: [unbanEmbed] });
        } catch (error) {
            await interaction.editReply({ content: '❌ An error occurred while executing the unban.' });
        }
    }

    // --- HANDLE /COINFLIP ---
    if (commandName === 'coinflip') {
        const sides = ['🌟 Head', '🪙 Tail'];
        const result = sides[Math.floor(Math.random() * sides.length)];

        const coinEmbed = new EmbedBuilder()
            .setColor('#FFD700') 
            .setTitle('🪙 Coin Flip Result')
            .setDescription(`<@${interaction.user.id}> flipped a coin and it landed on:\n\n**${result}**!`)
            .setTimestamp()
            .setFooter({ text: 'OrionAI Arcade' });

        await interaction.reply({ embeds: [coinEmbed] });
    }

    // --- HANDLE /RPS ---
    if (commandName === 'rps') {
        const userChoice = interaction.options.getString('choice');
        const rpsOptions = ['rock', 'paper', 'scissors'];
        const botChoice = rpsOptions[Math.floor(Math.random() * rpsOptions.length)];

        const emojis = { rock: '✊ Rock', paper: '✋ Paper', scissors: '✌️ Scissors' };
        let gameResult = "";

        if (userChoice === botChoice) {
            gameResult = "👔 **It's a tie!** Great minds think alike.";
        } else if (
            (userChoice === 'rock' && botChoice === 'scissors') ||
            (userChoice === 'paper' && botChoice === 'rock') ||
            (userChoice === 'scissors' && botChoice === 'paper')
        ) {
            gameResult = "🎉 **You win!** You outsmarted OrionAI.";
        } else {
            gameResult = "🤖 **OrionAI wins!** Better luck next time.";
        }

        const rpsEmbed = new EmbedBuilder()
            .setColor('#9B59B6') 
            .setTitle('✌️ Rock, Paper, Scissors')
            .addFields(
                { name: '👤 Your Choice', value: emojis[userChoice], inline: true },
                { name: '🤖 OrionAI\'s Choice', value: emojis[botChoice], inline: true },
                { name: '📊 Outcome', value: gameResult }
            )
            .setTimestamp()
            .setFooter({ text: 'OrionAI Arcade' });

        await interaction.reply({ embeds: [rpsEmbed] });
    }

    // --- HANDLE /SERVERINFO ---
    if (commandName === 'serverinfo') {
        const { guild } = interaction;
        
        const totalMembers = guild.memberCount;
        const botCount = guild.members.cache.filter(m => m.user.bot).size || 1; 
        const humanCount = totalMembers - botCount;

        const serverEmbed = new EmbedBuilder()
            .setColor('#34495E')
            .setTitle(`📊 Server Info: ${guild.name}`)
            .setThumbnail(guild.iconURL({ dynamic: true }) || client.user.displayAvatarURL())
            .addFields(
                { name: '👑 Owner', value: `<@${guild.ownerId}>`, inline: true },
                { name: '📅 Created On', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true },
                { name: '🆔 Server ID', value: `\`${guild.id}\``, inline: true },
                { name: '👥 Total Members', value: `**${totalMembers}** total\n🧑 Humans: ${humanCount}\n🤖 Bots: ${botCount}`, inline: false },
                { name: '💬 Total Channels', value: `📁 Text/Voice: **${guild.channels.cache.size}**`, inline: true },
                { name: '🛡️ Roles Count', value: `🎨 **${guild.roles.cache.size}** roles`, inline: true }
            )
            .setTimestamp()
            .setFooter({ text: 'OrionAI Dashboard' });

        await interaction.reply({ embeds: [serverEmbed] });
    }
});

// 6. START THE BOT
client.login(DISCORD_TOKEN);