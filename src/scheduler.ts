import { Client, GuildTextBasedChannel } from 'discord.js';
import { config } from './config.js';
import { runRound } from './trivia.js';
import { getSettings } from './store.js';

// Seconds past local midnight in the configured timezone.
function secondsOfDay(): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: config.dailyTz,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  let hour = get('hour');
  if (hour === 24) hour = 0; // some runtimes report midnight as 24
  return hour * 3600 + get('minute') * 60 + get('second');
}

function msUntilNextRun(): number {
  const target = config.dailyHour * 3600;
  const now = secondsOfDay();
  let delta = target - now;
  if (delta <= 0) delta += 86400; // already passed today -> tomorrow
  return delta * 1000;
}

async function fire(client: Client): Promise<void> {
  try {
    const channel = await client.channels.fetch(config.dailyChannelId).catch(() => null);
    if (!channel || !channel.isTextBased() || channel.isDMBased() || !('guild' in channel)) {
      console.warn('Daily trivia channel not found or not a guild text channel:', config.dailyChannelId);
      return;
    }
    const guildChannel = channel as GuildTextBasedChannel;
    if (!getSettings(guildChannel.guild.id).daily) {
      console.log('Daily auto-trivia skipped (disabled in /settings for this server).');
      return;
    }
    await runRound(guildChannel, guildChannel.guild.id, {
      intro: 'A fresh round of 5 Forever questions. Tap in — speed and streaks earn bonus points!',
      pingRoleId: config.dailyPingRoleId || undefined,
    });
  } catch (error) {
    console.error('Daily trivia run failed:', error);
  }
}

export function startScheduler(client: Client): void {
  if (!config.dailyChannelId) {
    console.log('Daily auto-trivia disabled (no DAILY_TRIVIA_CHANNEL_ID set).');
    return;
  }
  const schedule = (): void => {
    const wait = msUntilNextRun();
    const hours = (wait / 3600000).toFixed(1);
    console.log(`Daily auto-trivia scheduled in ~${hours}h (${config.dailyHour}:00 ${config.dailyTz}).`);
    setTimeout(async () => {
      await fire(client);
      schedule();
    }, wait);
  };
  schedule();
}
