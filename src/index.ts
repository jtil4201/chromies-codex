import { Client, GatewayIntentBits, MessageFlags, REST, Routes } from 'discord.js';
import { config } from './config.js';
import { commands, handleCommand } from './commands.js';
import { startScheduler } from './scheduler.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

async function registerCommands(): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(config.token);
  await rest.put(Routes.applicationCommands(config.clientId), { body: commands });

  // A guild id gives the home server its commands instantly instead of waiting
  // on global propagation. Skip quietly if the bot is not in that guild yet.
  if (config.guildId) {
    try {
      await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body: commands });
    } catch (error) {
      console.warn('Guild command registration skipped:', error instanceof Error ? error.message : error);
    }
  }
}

client.once('ready', async () => {
  try {
    await registerCommands();
  } catch (error) {
    console.error('Command registration failed:', error);
  }

  console.log(`Chromie is awake as ${client.user?.tag}.`);
  startScheduler(client);
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
