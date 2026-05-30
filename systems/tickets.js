const { ChannelType, PermissionFlagsBits } = require('discord.js');

module.exports = {
  async createTicket(interaction) {
    const guild = interaction.guild;

    try {
      // Create the text channel safely
      const channel = await guild.channels.create({
        name: `ticket-${interaction.user.username}`,
        type: ChannelType.GuildText, // v14 compliant instead of '0'
        permissionOverwrites: [
          {
            // Deny @everyone from seeing the channel
            id: guild.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
          {
            // Allow the ticket creator to view and type in it
            id: interaction.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel, 
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory // Recommended so they see previous bot logs
            ],
          },
        ],
      });

      // Send the welcome message inside the new ticket channel
      await channel.send(`🎫 Ticket created by ${interaction.user}. Support will be with you shortly!`);
      
      return channel;

    } catch (error) {
      console.error('❌ Failed to create ticket channel:', error);
      
      // Let the user know something went wrong if they are waiting
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: 'There was an error creating your ticket. Please check my server permissions.', ephemeral: true });
      } else {
        await interaction.reply({ content: 'There was an error creating your ticket. Please check my server permissions.', ephemeral: true });
      }
      return null;
    }
  }
};