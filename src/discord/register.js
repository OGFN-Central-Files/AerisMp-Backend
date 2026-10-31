import path from "path";
import logger from "../core/logger.js";
import { dirname } from "dirname-filename-esm";
const __dirname = dirname(import.meta);
import { REST, Routes } from "discord.js";
const token = process.env.BOT_TOKEN;
import fs from "node:fs";
import dotenv from "dotenv";
dotenv.config();

const commands = [];
const foldersPath = path.join(__dirname, "commands");
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
  const commandsPath = path.join(foldersPath, folder);
  const commandFiles = fs
    .readdirSync(commandsPath)
    .filter((file) => file.endsWith(".js"));
  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = await import("file://" + filePath);
    commands.push(command.data.toJSON());
  }
}

const rest = new REST().setToken(token);

(async () => {
  try {
    const clientId = process.env.CLIENT_ID || global.clientId;
    if (!clientId) {
      logger.error("CLIENT_ID not set in .env — skipping command registration.");
      return;
    }
    
    // Try guild commands first
    try {
      await rest.put(Routes.applicationGuildCommands(clientId, process.env.GUILD_ID), {
        body: commands,
      });
      logger.debug(`Aeris Command Services Refreshed (Guild)`);
    } catch (guildError) {
      // If guild commands fail, try global commands
      if (guildError.code === 50001 || guildError.code === 20012) {
        logger.bot("Guild commands failed - trying global commands...");
        await rest.put(Routes.applicationCommands(clientId), {
          body: commands,
        });
        logger.debug(`Aeris Command Services Refreshed (Global)`);
      } else {
        throw guildError;
      }
    }
  } catch (error) {
    if (error.code === 50001 || error.code === 20012) {
      logger.bot("Slash commands disabled - bot needs 'applications.commands' scope.");
      logger.bot("You must be the application owner to add this scope.");
      logger.bot(`Invite link: https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID}&permissions=8&scope=bot%20applications.commands`);
    } else {
      console.error(error);
    }
  }
})();
  