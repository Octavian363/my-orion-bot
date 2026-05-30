module.exports = {
  name: 'guildMemberAdd',
  async execute(member, client) {
    // 1. Find the channel safely
    // It's usually safer to look for a specific name configured by you, fallback to 'welcome', then 'general'
    const targetChannelName = client.config?.welcomeChannel || "welcome";
    
    let channel = member.guild.channels.cache.find(ch => ch.name === targetChannelName);

    // Backup fallback: If the configured channel doesn't exist, grab the system channel assigned by Discord
    if (!channel) {
      channel = member.guild.systemChannel;
    }

    // Send the server welcome message if a channel was found
    if (channel) {
      try {
        await channel.send(`👋 Welcome, ${member}! Enjoy your stay!`);
      } catch (error) {
        console.error(`Could not send public welcome message to channel:`, error.message);
      }
    }

    // 2. Send the private DM safely using a try/catch block
    try {
      await member.send(`👋 Welcome to the server, ${member.user.username}!`);
    } catch (error) {
      // Catching the error ensures your bot doesn't crash if the user's DMs are closed
      console.log(`ℹ️ Could not send a welcome DM to ${member.user.tag} (DMs are likely closed).`);
    }
  }
};