import { Client, GatewayIntentBits, MessageFlags, REST, Routes } from 'discord.js';
import { config } from './config.js';
import { commands, handleCommand } from './commands.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

async function registerCommands(): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(config.token);
  const route = config.guildId
    ? Routes.applicationGuildCommands(config.clientId, config.guildId)
    : Routes.applicationCommands(config.clientId);
  await rest.put(route, { body: commands });
}

client.once('ready', async () => {
  try {
    await registerCommands();
  } catch (error) {
    console.error('Command registration failed:', error);
  }

  console.log(`Chromie is awake as ${client.user?.tag}.`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  try {
    await handleCommand(interaction);
  } catch (error) {
    console.error('Command failed:', error);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'Something went sideways in the timeways. Try again.', flags: MessageFlags.Ephemeral }).catch(() => undefined);
    }
  }
});

await client.login(config.token);
