# Chromie's Codex

A WoW Forever trivia bot for Discord. Chromie asks questions about lore, quests, zones, items, and general knowledge, players answer with buttons, and the server keeps a running leaderboard.

## Commands

- `/trivia` posts a random question. Pass `category` to narrow it to lore, quests, zones, items, or general.
- `/leaderboard` shows the top players on the server.
- `/codex` shows a short about message.

Each question runs on a timer. Players tap A, B, C, or D, and everyone who gets it right earns points based on difficulty (easy 1, medium 2, hard 3).

## Setup

1. Create an application at https://discord.com/developers/applications and add a bot to it.
2. Copy the bot token and the application (client) id.
3. Invite the bot to your server with the `applications.commands` and `bot` scopes.
4. Copy `.env.example` to `.env` and fill it in:

```
DISCORD_TOKEN=your-bot-token
DISCORD_CLIENT_ID=your-application-id
DISCORD_GUILD_ID=your-server-id
QUESTION_SECONDS=20
DATA_DIR=./data
```

Setting `DISCORD_GUILD_ID` registers the slash commands to that server instantly. Leave it blank to register globally, which can take up to an hour to appear.

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

Scores are written to `DATA_DIR` (`/data` in the image), so mount a volume there to keep the leaderboard across restarts.

## Adding questions

Questions live in `data/questions.json`. Each entry looks like:

```json
{
  "id": "unique-id",
  "category": "lore",
  "difficulty": "medium",
  "question": "Your question text",
  "options": ["A text", "B text", "C text", "D text"],
  "answer": 0,
  "fact": "Optional lore blurb shown after the reveal"
}
```

`answer` is the zero based index of the correct option. Add as many as you like and rebuild.
