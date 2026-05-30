module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    // Only handle Slash (Chat Input) Commands
    if (!interaction.isChatInputCommand()) return;

    // Fetch the command from the collection
    const command = client.commands.get(interaction.commandName);
    if (!command) {
      console.warn(`[WARNING] Command ${interaction.commandName} was brought up but not found in client.commands.`);
      return;
    }

    try {
      // Execute the command logic
      await command.execute(interaction, client);
    } catch (error) {
      console.error(`❌ Error executing command /${interaction.commandName}:`);
      console.error(error);

      const errorMessage = 'There was an error while executing this command!';

      // Fix: Safely reply depending on the interaction's current state
      if (interaction.replied || interaction.deferred) {
        // If the bot already sent a response, append the error as a follow-up message
        await interaction.followUp({ content: errorMessage, ephemeral: true }).catch(err => console.error('Failed to send error followUp:', err));
      } else {
        // If the bot hasn't responded yet, issue a fresh reply
        await interaction.reply({ content: errorMessage, ephemeral: true }).catch(err => console.error('Failed to send error reply:', err));
      }
    }
  }
};