import { REST, Routes } from "discord.js";
import dotenv from "dotenv";
dotenv.config();

const rest = new REST().setToken(process.env.BOT_TOKEN);

(async () => {
  try {
    // Clear global commands
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: [] });
    console.log("✅ Cleared global commands");

    // Clear guild commands
    if (process.env.GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: [] });
      console.log("✅ Cleared guild commands");
    }
  } catch (err) {
    console.error("❌ Error:", err.message);
  }
})();
