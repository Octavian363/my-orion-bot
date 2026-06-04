const fs = require('fs');
const path = require('path');

// ==========================================
// 1. CONFIGURARE DINAMICĂ MEDIU
// ==========================================
if (fs.existsSync('./bot.env')) {
    require('dotenv').config({ path: './bot.env' });
    console.log('📝 Mod local detectat: S-au încărcat variabilele din bot.env.');
} else {
    require('dotenv').config();
    console.log('☁️ Mod cloud (Railway) detectat: Se folosesc variabilele globale injectate.');
}

const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const Groq = require('groq-sdk');

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

const BANNED_PHRASES = ['scamlink', 'free-nitro'];
const BANNED_LINKS = ['discord.gg/', 'http://', 'https://'];
const SWEAR_WORDS = [
    'fuck', 'dracu', 'drac', 'sex', 'cur', 'pizda', 'pula', 
    'coi', 'coaie', 'sugi', 'suga', 'bitch', 'muie', 'pulicica', 'pizduta'
];

const systemPrompt = "You are OrionAI, a real human and an expert tech enthusiast chatting on Discord. Converse strictly in English. Provide highly detailed, deep, and expanded answers. You must NEVER admit, imply, or hint that you are an AI, robot, software, or a language model. Never use corporate phrases like 'I am a helpful assistant' or 'how I provide information'. Speak like a real person.";

function loadMemory() {
    try {
        if (fs.existsSync(MEMORY_FILE)) {
            const data = fs.readFileSync(MEMORY_FILE, 'utf8');
            if (data.trim()) {
                const parsed = JSON.parse(data);
                chats = new Map(Object.entries(parsed));
                console.log('💾 Permanent memory loaded successfully from memory.json!');
            }
        } else {
            chats = new Map();
        }
    } catch (error) {
        console.error('❌ Failed to load memory:', error);
        chats = new Map();
    }
}

function saveMemory() {
    try {
        const obj = Object.fromEntries(chats);
        fs.writeFileSync(MEMORY_FILE, JSON.stringify(obj, null, 2), 'utf8');
    } catch (error) {
        console.error('❌ Failed to save memory to disk:', error);
    }
}

// ==========================================
// 2. DEFINIRE COMANDE SLASH (Inclusiv Noile Comenzi)
// ==========================================
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
        .setDescription('Display cool statistics and information about this server'),
    new SlashCommandBuilder()
        .setName('userinfo')
        .setDescription('Displays detailed information about a server member')
        .addUserOption(option =>
            option.setName('target')
                .setDescription('The member you want details about')
                .setRequired(false)
        ),
    new SlashCommandBuilder()
        .setName('photo')
        .setDescription('Generate a custom photo using AI based on your description')
        .addStringOption(option =>
            option.setName('description')
                .setDescription('Describe the photo you want the AI to create')
                .setRequired(true)
        ),
    // --- NOILE COMANDE ADAUGATE ---
    new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Warn a user and log it into the memory file')
        .addUserOption(option => option.setName('target').setDescription('The user to warn').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('Reason for warning').setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    new SlashCommandBuilder()
        .setName('mute')
        .setDescription('Timeout/Mute a member for a specific duration')
        .addUserOption(option => option.setName('target').setDescription('The member to mute').setRequired(true))
        .addIntegerOption(option => option.setName('duration').setDescription('Duration in minutes').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('Reason for mute').setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    new SlashCommandBuilder()
        .setName('unmute')
        .setDescription('Remove timeout/mute from a member')
        .addUserOption(option => option.setName('target').setDescription('The member to unmute').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('Reason for unmute').setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    new SlashCommandBuilder()
        .setName('avatar')
        .setDescription('Get the avatar of a user')
        .addUserOption(option => option.setName('target').setDescription('Select a user (Leave blank for yours)').setRequired(false)),
    new SlashCommandBuilder()
        .setName('roll')
        .setDescription('Roll a random dice (Default 1-6) or custom maximum value')
        .addIntegerOption(option => option.setName('max').setDescription('Maximum value of the dice').setRequired(false)),
    new SlashCommandBuilder()
        .setName('8ball')
        .setDescription('Ask the Magic 8-Ball a question and get an answer')
        .addStringOption(option => option.setName('question').setDescription('What do you want to ask?').setRequired(true))
].map(command => command.toJSON());

// ==========================================
// 3. EVENIMENT READY
// ==========================================
client.once('ready', async () => {
    console.log(`🔒 OrionAI is online and connected to Groq (Llama 3.3 70B)! Connected as: ${client.user.tag}`);
    loadMemory();

    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    try {
        console.log('Registering global slash commands...');
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ All slash commands are completely live!');
    } catch (error) { 
        console.error(error); 
    }
});

// WELCOME EVENT
client.on('guildMemberAdd', async member => {
    const welcomeChannel = member.guild.channels.cache.find(ch => ch.name === WELCOME_CHANNEL_NAME);
    if (!welcomeChannel) return;

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

// ==========================================
// 4. AUTOMOD CU AVERTISMENTE GENERATE DE AI
// ==========================================
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;
    if (message.member?.permissions.has(PermissionFlagsBits.Administrator)) return;

    const lowerContent = message.content.toLowerCase();
    const cleanContent = lowerContent.replace(/[@!$*0-9\s\-_.]/g, '');

    const containsPhrase = BANNED_PHRASES.some(word => lowerContent.includes(word));
    const containsLink = BANNED_LINKS.some(link => lowerContent.includes(link));
    const containsSwear = SWEAR_WORDS.some(swear => cleanContent.includes(swear) || lowerContent.includes(swear));

    if (containsPhrase || containsLink || containsSwear) {
        try {
            await message.delete().catch(() => {});
            const userId = message.author.id;

            if (!chats.has(userId)) {
                chats.set(userId, { history: [], warningsCount: 0 });
            }
            
            let userSessionData = chats.get(userId);
            
            if (Array.isArray(userSessionData)) {
                userSessionData = { history: userSessionData, warningsCount: 0 };
            }

            userSessionData.warningsCount = (userSessionData.warningsCount || 0) + 1;
            chats.set(userId, userSessionData);
            saveMemory();

            const chancesLeft = 3 - userSessionData.warningsCount;

            if (chancesLeft > 0) {
                let aiWarningMessage = `Hey! Cut the bad language. You have exactly ${chancesLeft} chances left before a 5-week ban.`;
                
                try {
                    const groqResponse = await groq.chat.completions.create({
                        model: "llama-3.3-70b-versatile",
                        messages: [
                            { 
                                role: "system", 
                                content: `You are OrionAI, a real tech enthusiast on Discord acting as a strict human moderator. Write a direct, sharp, and slightly annoyed warning in English to a user who just swore. You MUST explicitly state in your response that they have EXACTLY ${chancesLeft} chances left before a 5-week ban. Keep it under 2 sentences and do not use corporate language.` 
                            },
                            { 
                                role: "user", 
                                content: `Warn the user ${message.author.username}.` 
                            }
                        ],
                        temperature: 0.8,
                        max_tokens: 120
                    });
                    
                    if (groqResponse.choices && groqResponse.choices[0]?.message?.content) {
                        aiWarningMessage = groqResponse.choices[0].message.content;
                    }
                } catch (apiError) {
                    console.error('⚠️ Groq API Error (AutoMod): Se folosește mesajul standard.', apiError.message);
                }

                const finalText = `⚠️ **Notification from ${message.guild.name}:**\n\n${aiWarningMessage}`;

                await message.author.send(finalText).catch(async () => {
                    const channelWarn = await message.channel.send(`⚠️ <@${userId}>, check your DMs! Restricted content removed.\n*"${aiWarningMessage}"*`);
                    setTimeout(() => channelWarn.delete().catch(() => {}), 8000);
                });

            } else {
                const autoBanEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('🚫 AUTOMATED AUTOMOD BAN')
                    .setDescription(`**${message.author.tag}** has been banned for 5 weeks after exhausting all 3 system warnings.`)
                    .setTimestamp();

                await message.author.send(`❌ You have been banned from **${message.guild.name}** for 5 weeks because you ran out of chances.`).catch(() => {});
                
                await message.guild.members.ban(userId, { reason: 'AutoMod: Reached 3 warnings for banned words/phrases/links.' });
                await message.channel.send({ embeds: [autoBanEmbed] });
                
                userSessionData.warningsCount = 0;
                chats.set(userId, userSessionData);
                saveMemory();
            }
        } catch (error) {
            console.error('❌ Failed to process AutoMod execution:', error);
        }
    }
});

// ==========================================
// 5. GESTIONARE INTERACȚIUNI
// ==========================================
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;
    const userId = interaction.user.id;

    if (!chats.has(userId)) {
        chats.set(userId, { history: [], warningsCount: 0 });
    }
    
    let userSessionData = chats.get(userId);
    if (Array.isArray(userSessionData)) {
        userSessionData = { history: userSessionData, warningsCount: 0 };
        chats.set(userId, userSessionData);
    }

    // --- HANDLE /ASK ---
    if (commandName === 'ask') {
        const userMessage = interaction.options.getString('message');
        await interaction.deferReply();

        const cleanMessage = userMessage.toLowerCase().trim().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g," ");

        if (/^(hello|helo|hi)$/i.test(cleanMessage.replace(/\s+/g, ''))) {
            const staticReply = "Hello! My name is OrionAI and I'm ready to help you.";
            userSessionData.history.push({ role: "user", content: userMessage }, { role: "assistant", content: staticReply });
            chats.set(userId, userSessionData);
            saveMemory();
            return await interaction.editReply({ content: staticReply });
        }

        if (
            /\byou\b.*\ban\b.*\bai\b/i.test(cleanMessage) || 
            /\bare\b.*\byou\b.*\bai\b/i.test(cleanMessage) || 
            /\byou\b.*\ba\b.*\bbot\b/i.test(cleanMessage) || 
            /\bare\b.*\byou\b.*\ba\b.*\bbot\b/i.test(cleanMessage) ||
            /\byour\b.*\bmemory\b/i.test(cleanMessage) ||
            /\bhow\b.*\bdo\b.*\byou\b.*\bremember\b/i.test(cleanMessage) ||
            /\bare\b.*\byou\b.*\bhuman\b/i.test(cleanMessage) ||
            /\bretain\b.*\band\b.*\brecall\b/i.test(cleanMessage) ||
            /\btraining\b.*\bdata\b/i.test(cleanMessage)
        ) {
            const humanExcuse = "What? No, I'm a real person, haha! 'OrionAI' is just the online gaming tag I've been using for years because I love astronomy and tech. As for remembering things, I just have a really sharp memory, I take notes, and I spend way too much time on Discord. Let's get back to our topic, what's on your mind?";
            
            userSessionData.history.push({ role: "user", content: userMessage }, { role: "assistant", content: humanExcuse });
            chats.set(userId, userSessionData);
            saveMemory();
            return await interaction.editReply({ content: humanExcuse });
        }

        const validHistory = userSessionData.history.filter(msg => msg && msg.role && msg.content);

        const fullHistory = [
            { role: "system", content: systemPrompt }, 
            ...validHistory.slice(-10), 
            { role: "user", content: userMessage }
        ];

        try {
            const response = await groq.chat.completions.create({
                model: "llama-3.3-70b-versatile",
                messages: fullHistory,
                temperature: 0.7
            });

            if (!response.choices || response.choices.length === 0) {
                throw new Error("Groq API a returnat un răspuns gol.");
            }

            let aiMessage = response.choices[0].message.content;
            
            userSessionData.history.push({ role: "user", content: userMessage }, { role: "assistant", content: aiMessage });
            chats.set(userId, userSessionData);
            saveMemory();
            
            let finalMessage = aiMessage;

            const words = userMessage.toLowerCase().split(/\s+/);
            if (words.includes('all') || words.includes('everyone')) {
                try {
                    const members = await interaction.guild.members.fetch();
                    const memberPings = members.filter(m => !m.user.bot).map(m => `<@${m.id}>`).join(' ');
                    if (memberPings.length > 0) finalMessage += `\n\n**Members:**\n${memberPings}`;
                } catch (e) {}
            }

            if (finalMessage.length <= 2000) {
                await interaction.editReply({ content: finalMessage, allowedMentions: { parse: ['everyone', 'roles', 'users'] } });
            } else {
                const chunks = [];
                let str = finalMessage;
                
                while (str.length > 0) {
                    if (str.length <= 1950) {
                        chunks.push(str);
                        break;
                    }
                    
                    let cutIndex = str.substring(0, 1950).lastIndexOf(' ');
                    if (cutIndex === -1) cutIndex = 1950;
                    
                    chunks.push(str.substring(0, cutIndex));
                    str = str.substring(cutIndex).trim();
                }

                await interaction.editReply({ content: chunks[0], allowedMentions: { parse: ['everyone', 'roles', 'users'] } });

                for (let i = 1; i < chunks.length; i++) {
                    await interaction.followUp({ content: chunks[i], allowedMentions: { parse: ['everyone', 'roles', 'users'] } });
                }
            }
        } catch (err) {
            console.error('🔴 EROARE CRITICĂ DISCORD/GROQ:', err);
            await interaction.editReply({ content: `❌ System Error: Conexiune eșuată cu serverul AI sau istoric corupt.` });
        }
    }

    // --- HANDLE /RESET ---
    if (commandName === 'reset') {
        if (userSessionData.history.length > 0) {
            userSessionData.history = [];
            chats.set(userId, userSessionData);
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
            await interaction.editReply({ content: `💥 **${targetUser.tag}** has been officially booted!`, embeds: [kickEmbed] });
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
            .setTitle('🚫 BAN HAM HAS SPOKEN!')
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
            await interaction.editReply({ content: `⚡ **The Ban Hammer has dropped!**`, embeds: [banEmbed] });
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
                return interaction.editReply({ content: `❌ I could not find any banned user with the username **"${inputUsername}"**.` });
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
                .setDescription(`**${bannedUser.tag}** has been successfully unbanned!`)
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
            .setDescription(`<@${userId}> flipped a coin and it landed on:\n\n**${result}**!`)
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
        await interaction.deferReply();
        const { guild } = interaction;
        
        try {
            const accurateMembers = await guild.members.fetch();
            const totalMembers = guild.memberCount;
            const botCount = accurateMembers.filter(m => m.user.bot).size; 
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

            await interaction.editReply({ embeds: [serverEmbed] });
        } catch (err) {
            console.error(err);
            await interaction.editReply({ content: '❌ Failed to collect server statistics.' });
        }
    }

    // --- HANDLE /USERINFO ---
    if (commandName === 'userinfo') {
        const targetUser = interaction.options.getUser('target') || interaction.user;
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

        const infoEmbed = new EmbedBuilder()
            .setColor('#2ECC71')
            .setTitle(`👤 User Info: ${targetUser.username}`)
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: '🆔 User ID', value: `\`${targetUser.id}\``, inline: true },
                { name: '🤖 Is Bot?', value: targetUser.bot ? 'Yes' : 'No', inline: true },
                { name: '📅 Account Created', value: `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:R>`, inline: false }
            )
            .setTimestamp();

        if (targetMember) {
            infoEmbed.addFields(
                { name: '📥 Joined Server', value: `<t:${Math.floor(targetMember.joinedTimestamp / 1000)}:R>`, inline: true },
                { name: '🎨 Roles', value: targetMember.roles.cache.filter(r => r.id !== interaction.guild.id).map(r => `<@&${r.id}>`).join(' ') || 'No roles', inline: false }
            );
        }

        await interaction.reply({ embeds: [infoEmbed] });
    }

    // --- HANDLE /PHOTO ---
    if (commandName === 'photo') {
        const description = interaction.options.getString('description');
        await interaction.deferReply();

        try {
            const encodedPrompt = encodeURIComponent(description);
            const randomSeed = Math.floor(Math.random() * 1000000);
            const imageUrl = `https://image.pollinations.ai/p/${encodedPrompt}?width=1024&height=1024&seed=${randomSeed}&enhance=true`;

            const photoEmbed = new EmbedBuilder()
                .setColor('#9B59B6')
                .setTitle('🎨 Custom AI Photo Generated')
                .setDescription(`**Prompt:** ${description}`)
                .setImage(imageUrl)
                .setTimestamp()
                .setFooter({ text: 'Powered by Pollinations AI' });

            await interaction.editReply({ embeds: [photoEmbed] });
        } catch (error) {
            await interaction.editReply({ content: '❌ Error generating image. Pollinations service might be busy.' });
        }
    }

    // ========================================================================
    // LOGICA NOUĂ PENTRU CELE 6 COMANDE ADAUGATE 
    // ========================================================================

    // --- HANDLE /WARN ---
    if (commandName === 'warn') {
        const targetUser = interaction.options.getUser('target');
        const reason = interaction.options.getString('reason') || 'No reason provided.';
        
        if (targetUser.bot) return interaction.reply({ content: "❌ You cannot warn a bot.", ephemeral: true });

        if (!chats.has(targetUser.id)) {
            chats.set(targetUser.id, { history: [], warningsCount: 0 });
        }
        let targetData = chats.get(targetUser.id);
        if (Array.isArray(targetData)) targetData = { history: targetData, warningsCount: 0 };

        targetData.warningsCount = (targetData.warningsCount || 0) + 1;
        chats.set(targetUser.id, targetData);
        saveMemory();

        const warnEmbed = new EmbedBuilder()
            .setColor('#F1C40F')
            .setTitle('⚠️ User Warned')
            .setDescription(`**${targetUser.tag}** has been warned by <@${interaction.user.id}>.`)
            .addFields(
                { name: '📋 Reason', value: reason },
                { name: '📊 Total Warnings Now', value: `**${targetData.warningsCount}** / 3` }
            )
            .setTimestamp();

        await targetUser.send(`⚠️ You received a warning in **${interaction.guild.name}**.\nReason: ${reason}\nTotal warnings: ${targetData.warningsCount}/3`).catch(() => {});
        await interaction.reply({ embeds: [warnEmbed] });
    }

    // --- HANDLE /MUTE ---
    if (commandName === 'mute') {
        const targetUser = interaction.options.getUser('target');
        const duration = interaction.options.getInteger('duration');
        const reason = interaction.options.getString('reason') || 'No reason provided.';

        const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        if (!member) return interaction.reply({ content: "❌ Member not found in server.", ephemeral: true });
        if (!member.moderatable) return interaction.reply({ content: "❌ I cannot mute this user. Check role hierarchies/permissions.", ephemeral: true });

        try {
            await member.timeout(duration * 60 * 1000, reason);
            
            const muteEmbed = new EmbedBuilder()
                .setColor('#E67E22')
                .setTitle('🔇 Member Muted')
                .setDescription(`**${targetUser.tag}** has been put in timeout.`)
                .addFields(
                    { name: '⏳ Duration', value: `${duration} minutes`, inline: true },
                    { name: '📋 Reason', value: reason, inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [muteEmbed] });
        } catch (err) {
            await interaction.reply({ content: "❌ Failed to apply timeout structure.", ephemeral: true });
        }
    }

    // --- HANDLE /UNMUTE ---
    if (commandName === 'unmute') {
        const targetUser = interaction.options.getUser('target');
        const reason = interaction.options.getString('reason') || 'No reason provided.';

        const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        if (!member) return interaction.reply({ content: "❌ Member not found in server.", ephemeral: true });
        if (!member.moderatable) return interaction.reply({ content: "❌ Cannot alter status for this user.", ephemeral: true });

        try {
            await member.timeout(null, reason);
            
            const unmuteEmbed = new EmbedBuilder()
                .setColor('#2ECC71')
                .setTitle('🔊 Member Unmuted')
                .setDescription(`Timeout removed for **${targetUser.tag}**.`)
                .addFields({ name: '📋 Reason', value: reason })
                .setTimestamp();

            await interaction.reply({ embeds: [unmuteEmbed] });
        } catch (err) {
            await interaction.reply({ content: "❌ Failed to remove timeout.", ephemeral: true });
        }
    }

    // --- HANDLE /AVATAR ---
    if (commandName === 'avatar') {
        const targetUser = interaction.options.getUser('target') || interaction.user;
        const avatarUrl = targetUser.displayAvatarURL({ dynamic: true, size: 1024 });

        const avatarEmbed = new EmbedBuilder()
            .setColor('#3498DB')
            .setTitle(`🖼️ Avatar: ${targetUser.username}`)
            .setDescription(`[Click here to download original link](${avatarUrl})`)
            .setImage(avatarUrl)
            .setTimestamp();

        await interaction.reply({ embeds: [avatarEmbed] });
    }

    // --- HANDLE /ROLL ---
    if (commandName === 'roll') {
        const max = interaction.options.getInteger('max') || 6;
        if (max < 1) return interaction.reply({ content: "❌ Cannot roll a dice lower than 1.", ephemeral: true });
        
        const rolled = Math.floor(Math.random() * max) + 1;

        await interaction.reply({ content: `🎲 <@${interaction.user.id}> rolled a **${rolled}** (out of **${max}**)!` });
    }

    // --- HANDLE /8BALL ---
    if (commandName === '8ball') {
        const question = interaction.options.getString('question');
        const responses = [
            'It is certain.', 'It is decidedly so.', 'Without a doubt.', 'Yes, definitely.',
            'You may rely on it.', 'As I see it, yes.', 'Most likely.', 'Outlook good.',
            'Yes.', 'Signs point to yes.', 'Reply hazy, try again.', 'Ask again later.',
            'Better not tell you now.', 'Cannot predict now.', 'Concentrate and ask again.',
            'Don\'t count on it.', 'My reply is no.', 'My sources say no.',
            'Outlook not so good.', 'Very doubtful.'
        ];
        const randomAnswer = responses[Math.floor(Math.random() * responses.length)];

        const ballEmbed = new EmbedBuilder()
            .setColor('#2C3E50')
            .setTitle('🔮 Magic 8-Ball')
            .addFields(
                { name: '❓ Question', value: question },
                { name: '🎱 Answer', value: randomAnswer }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [ballEmbed] });
    }
});

// Pornirea clientului
client.login(DISCORD_TOKEN);