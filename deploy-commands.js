const { REST, Routes, SlashCommandBuilder } = require('discord.js');
const config = require('./config.json');

// 1. We build your commands directly here to match your current flat folder system
const commands = [
  new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Check your wallet balance'),
    
  new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Check your current level and XP'),
    
  new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Create a private support ticket')
].map(command => command.toJSON());

// Ensure there are actually commands to send
if (commands.length === 0) {
  console.error('⚠️ No commands found!');
  process.exit(1);
}

// 2. Prepare the Discord REST API client using your config file token
const rest = new REST({ version: '10' }).setToken(config.token);

// 3. Deploy the commands
(async () => {
  try {
    console.log(`⏳ Started refreshing ${commands.length} application (/) commands...`);

    // This pulls the clientId and guildId safely right out of your config.json file
    const data = await rest.put(
      Routes.applicationGuildCommands(config.clientId, config.guildId),
      { body: commands },
    );

    console.log(`✅ Successfully reloaded ${data.length} application (/) commands to your server!`);
  } catch (error) {
    console.error('❌ Discord Deployment API Error:');
    console.error(error);
  }
})();