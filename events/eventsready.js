const { Events } = require('discord.js');

module.exports = {
  // Fix: Use Events.ClientReady (which evaluates to the string 'ready')
  name: Events.ClientReady, 
  once: true,
  
  execute(client) {
    console.log(`🤖 Success! Bot is online and logged in as ${client.user.tag}`);
    
    // Optional Pro-Tip: Set your bot's status activity here when it boots up!
    client.user.setActivity({
      name: 'Managing Systems',
      type: 0 // 0 = Playing
    });
  }
};