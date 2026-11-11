# Chromie's Codex

A WoW Forever trivia bot for Discord. Chromie runs rounds of multiple-choice questions about Forever's lore, quests, zones, items, and NPCs. Everyone in the channel answers with buttons, faster and streakier answers score more, and the server keeps both a weekly season board and an all-time board.

The question bank ships with 4,400+ questions. Most are generated straight from the Forever game database (quote the quest text, name the quest; or name the NPC who gives a quest), alongside a hand-curated set of lore and hard-knowledge questions covering Warcraft history, factions and leaders, cities and zones, dungeons and raid bosses, world bosses, legendary items, and class and race lore.

## Don't want to use the public bot? Run your own

Chromie is open source under the MIT license, so you are free to host your own copy with your own name, branding, and separate leaderboards:

1. Clone this repo.
2. Create your own Discord application and bot, then copy its token and client id.
3. Follow the Setup and run steps below (local with `npm run dev`, or Docker).

Your instance is completely separate from everyone else's and keeps its own scores. You can also lift just the question bank (`data/questions.json`) or the round and scoring code into an existing bot of your own, the MIT license only asks that you keep the copyright notice.

## Commands

- `/trivia` runs a round of questions (5 by default), one at a time. Options:
  - `version` picks a WoW version. Only versions that have questions show up, so the list grows on its own as content is added.
  - `category` narrows to lore, quests, zones, items, general, or forever.
  - `count` sets how many questions this round: 1, 5, or 10 (defaults to 5).
- `/leaderboard` shows this season's top players and the all-time top players.
- `/stats [player]` shows a player's points, rank, and accuracy for all-time and the current season.
- `/codex` shows a short about message with the current question count.
- `/reset` clears the server's leaderboard (Manage Server only).
- `/settings` views or toggles features for the server (Manage Server only).

## How a round plays

Each question runs on a timer (30s by default). Players tap A, B, C, or D, one lock-in each, no changing your answer.

Scoring per correct answer:

- Base points by difficulty: easy 1, medium 2, hard 3.
- Speed bonus: up to +2 for answering early.
- Streak bonus: +1 while you are on a 3+ correct streak, with a flame tag.

Get all 5 right in a round for a Flawless callout. When the round ends, Chromie posts a scoreboard with the round's podium, and every answer also feeds the persistent leaderboard.

## Features and toggles

Everything below is on by default and can be switched per server with `/settings feature:<name> state:<on|off>`:

- `speedBonus` faster answers score more.
- `streaks` 3+ in a row earns a bonus and a flame.
- `sweep` the Flawless 5/5 callout.
- `seasons` weekly leaderboard that resets Mondays, with the old season's podium announced when a new one starts. Off means one continuous all-time board.
- `daily` the daily auto-round (needs a channel configured, see below).
- `champion` an auto-granted role for the current all-time number one.

Run `/settings` with no options to see the current on/off state for each.

## Setup

1. Create an application at https://discord.com/developers/applications and add a bot to it.
2. Copy the bot token and the application (client) id.
3. Invite the bot with the `bot` and `applications.commands` scopes.
4. Copy `.env.example` to `.env` and fill it in.

```
DISCORD_TOKEN=your-bot-token
DISCORD_CLIENT_ID=your-application-id
DISCORD_GUILD_ID=your-server-id
DATA_DIR=./data

# gameplay
QUESTION_SECONDS=30
QUESTIONS_PER_ROUND=5

# daily auto-trivia (optional, disabled unless a channel is set)
DAILY_TRIVIA_CHANNEL_ID=
DAILY_TRIVIA_HOUR=18
DAILY_TRIVIA_TZ=America/Phoenix
DAILY_TRIVIA_PING_ROLE_ID=

# champion role (optional)
CHAMPION_ROLE_ID=
```

Setting `DISCORD_GUILD_ID` registers the slash commands to that server instantly. Leave it blank to register globally, which can take up to an hour to appear.

Notes:

- Daily auto-trivia only runs when `DAILY_TRIVIA_CHANNEL_ID` is set. It posts at `DAILY_TRIVIA_HOUR` in `DAILY_TRIVIA_TZ` and pings `DAILY_TRIVIA_PING_ROLE_ID` if provided.
- The champion role is granted reliably, but removing it from a previous holder works best with the Server Members Intent enabled in the Dev Portal. The bot's role must sit above the champion role and it needs Manage Roles.

## Run it locally

```
npm install
npm run dev
```

## Build and run with Docker

```
docker build -t chromies-codex .
docker run --env-file .env -v chromie-data:/data chromies-codex
```

Scores and per-server settings are written to `DATA_DIR` (`/data` in the image) as `scores.json`, so mount a volume there to keep them across restarts.

## Adding questions

Questions live in `data/questions.json`. Each entry looks like:

```json
{
  "id": "unique-id",
  "category": "quests",
  "version": "forever",
  "difficulty": "medium",
  "question": "Your question text",
  "options": ["A text", "B text", "C text", "D text"],
  "answer": 1,
  "fact": "Optional blurb shown after the reveal"
}
```

`answer` is the zero based index of the correct option. `version` is optional and defaults to `forever`. Add as many as you like and rebuild.

## License

MIT. See [LICENSE](LICENSE). Use it, modify it, build it into your own bot, just keep the copyright notice.
