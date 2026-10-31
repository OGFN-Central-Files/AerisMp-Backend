/**
 * Creates a dedicated host/gameserver account and writes credentials to gameserver.json5.
 * Run once on first setup: node src/scripts/createGameserverAccount.js
 * Safe to re-run — skips creation if the account already exists.
 */

import mongoose from "mongoose";
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import dotenv from "dotenv";
dotenv.config();

import User from "../User/Mongodb/Schema/user.js";
import Profile from "../User/Mongodb/Schema/profiles.js";
import Friends from "../database/Schema/friends.js";
import profileManager from "../User/profile.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(__dirname, "../../gameserver.json5");

const GS_DISCORD_ID  = "gameserver-host-000000000000000000";
const GS_USERNAME    = "GameServer";
const GS_EMAIL       = "gameserver@aeris.internal";
const GS_PASSWORD    = uuidv4().replace(/-/g, "").slice(0, 20); // random 20-char password

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB");

  // Check if already exists
  const existing = await User.findOne({ discordId: GS_DISCORD_ID });

  if (existing) {
    console.log(`Host account already exists: ${existing.username} (${existing.accountId})`);

    // If credentials file is missing, regenerate it with a note
    if (!fs.existsSync(OUTPUT_PATH)) {
      console.warn("gameserver.json5 missing — cannot recover password (it's hashed). Delete the DB account and re-run to reset.");
    } else {
      console.log(`Credentials file already exists at: ${OUTPUT_PATH}`);
    }

    await mongoose.disconnect();
    return;
  }

  const accountId      = uuidv4().replace(/-/g, "");
  const hashedPassword = await bcrypt.hash(GS_PASSWORD, 10);
  const now            = new Date().toISOString();

  await User.create({
    created:        now,
    banned:         false,
    discordId:      GS_DISCORD_ID,
    accountId:      accountId,
    username:       GS_USERNAME,
    username_lower: GS_USERNAME.toLowerCase(),
    email:          GS_EMAIL,
    password:       hashedPassword,
    isServer:       true,
    matchmakingId:  uuidv4(),
  });

  await Profile.create({
    created:  now,
    accountId,
    profiles: await profileManager.createProfiles(accountId),
  });

  await Friends.create({ created: now, accountId });

  // Write credentials to gameserver.json5
  const credentials = {
    // Aeris gameserver host account credentials
    // Used by Erbium (game server) to authenticate with the backend API.
    // Keep this file private — do not commit to version control.
    account: {
      username:  GS_USERNAME,
      email:     GS_EMAIL,
      password:  GS_PASSWORD,
      accountId: accountId,
    },
    backend: {
      url:    process.env.BACKEND_IP
        ? `http://${process.env.BACKEND_IP}:${process.env.PORT}`
        : `http://127.0.0.1:${process.env.PORT || 3551}`,
      apiKey: process.env.API_KEY || "Aeris",
    },
  };

  // Write as JSON5 (with comments)
  const json5Content = `// Aeris Gameserver Host Account Credentials
// Generated: ${now}
// DO NOT COMMIT THIS FILE — add gameserver.json5 to .gitignore
{
  account: {
    username:  "${credentials.account.username}",
    email:     "${credentials.account.email}",
    password:  "${credentials.account.password}",
    accountId: "${credentials.account.accountId}",
  },
  backend: {
    url:    "${credentials.backend.url}",
    apiKey: "${credentials.backend.apiKey}",
  },
}
`;

  fs.writeFileSync(OUTPUT_PATH, json5Content, "utf8");

  console.log(`\nHost account created successfully!`);
  console.log(`  Username:  ${GS_USERNAME}`);
  console.log(`  Email:     ${GS_EMAIL}`);
  console.log(`  AccountId: ${accountId}`);
  console.log(`  Password:  ${GS_PASSWORD}`);
  console.log(`\nCredentials written to: ${OUTPUT_PATH}`);

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("Failed to create gameserver account:", err);
  process.exit(1);
});
