import express from "express";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import jwt from "jsonwebtoken";
import { dirname } from "dirname-filename-esm";
import destr from "destr";
import { client } from "./discord/index.js";
import kv from "./Utils/kv.js";
import Utils from "./Utils/Utils.js";
import log from "./Utils/log.js";
import { DateAddHours } from "./Routes/auth.js";
import User from "./User/Mongodb/Schema/user.js";
import "./matchmaker/src/matchmaker.js";
import { v4 } from "uuid";

import dotenv from "dotenv";
dotenv.config();

const __dirname = dirname(import.meta);
global.kv = kv;
global.JWT_SECRET = process.env.JWT_SECRET || v4();
global.accessTokens = [];
global.refreshTokens = [];
global.clientTokens = [];
global.smartXMPP = false;
global.exchangeCodes = [];
const app = express();
const PORT = process.env.PORT;
const BACKEND_IP = process.env.BACKEND_IP;

// Allow requests from the Tauri launcher (any origin)
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Api-Key");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});
await client.login(process.env.BOT_TOKEN);
let redisTokens;
let tokens;
tokens = destr(
  fs.readFileSync(path.join(__dirname, "../tokens.json")).toString()
);
for (let tokenType in tokens) {
  for (let tokenIndex in tokens[tokenType]) {
    let decodedToken = jwt.decode(
      tokens[tokenType][tokenIndex].token.replace("eg1~", "")
    );
    if (
      DateAddHours(
        new Date(decodedToken.creation_date),
        decodedToken.hours_expire
      ).getTime() <= new Date().getTime()
    ) {
      tokens[tokenType].splice(Number(tokenIndex), 1);
    }
  }
}
fs.writeFileSync(
  path.join(__dirname, "../tokens.json"),
  JSON.stringify(tokens, null, 2) || ""
);
if (!tokens || !tokens.accessTokens) {
  console.log("No access tokens found, resetting tokens.json");
  await kv.set(
    "tokens",
    fs.readFileSync(path.join(__dirname, "../tokens.json")).toString()
  );
  tokens = destr(
    fs.readFileSync(path.join(__dirname, "../tokens.json")).toString()
  );
}
global.accessTokens = tokens.accessTokens;
global.refreshTokens = tokens.refreshTokens;
global.clientTokens = tokens.clientTokens;
mongoose.set("strictQuery", true);
mongoose
  .connect(process.env.MONGO_URI)
  .then(async () => {
    log.database("Connected to MongoDB");
    log.registerService('MongoDB Connected');

    // Migration: ensure all athena profiles have arena_hype and accountLevel >= 100
    try {
      const Profile = (await import("./User/Mongodb/Schema/profiles.js")).default;
      const result = await Profile.updateMany(
        { "profiles.athena.stats.attributes.arena_hype": { $exists: false } },
        { $set: { "profiles.athena.stats.attributes.arena_hype": 0 } }
      );
      if (result.modifiedCount > 0)
        log.database(`Migrated ${result.modifiedCount} profile(s): added arena_hype`);

      const result2 = await Profile.updateMany(
        { "profiles.athena.stats.attributes.accountLevel": { $lt: 100 } },
        { $set: { "profiles.athena.stats.attributes.accountLevel": 100 } }
      );
      if (result2.modifiedCount > 0)
        log.database(`Migrated ${result2.modifiedCount} profile(s): bumped accountLevel to 100`);
    } catch (e) {
      log.error(`Profile migration error: ${e.message}`);
    }
  })
  .catch((error) => {
    console.error("Error connecting to MongoDB: ", error);
  });
mongoose.connection.on("error", (err) => {
  log.error(
    "MongoDB failed to connect, please make sure you have MongoDB installed and running."
  );
  throw err;
});
app.get("/", (req, res) => {
  res.status(200).json({
    status: "ok",
    uptime: process.uptime(),
  });
});
app.get("/discord-profile/:discordId", async (req, res) => {
  try {
    const discordId = req.params.discordId;
    const user = await User.findOne({ discordId });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    const profile = {
      username: user.username,
      discriminator: "0000",
      email: user.email,
      mfa: user.mfa,
      canCreateCodes: user.canCreateCodes,
    };
    res.status(200).json(profile);
  } catch (err) {
    log.error("Error fetching Discord profile: ", err);
    res.status(500).json({ error: "Failed to fetch Discord profile" });
  }
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const importRoutes = async (dir) => {
  for (const fileName of fs.readdirSync(path.join(__dirname, dir))) {
    if (fileName.includes(".map")) continue;
    try {
      app.use((await import(`file://${__dirname}/${dir}/${fileName}`)).default);
    } catch (error) {
      console.log(fileName, error);
    }
  }
};
await importRoutes("Routes");
app
  .listen(PORT, BACKEND_IP, () => {
    log.registerPort('Backend', `${BACKEND_IP}:${PORT}`);
    import("./xmpp/xmpp.js").then(() => {
      log.registerPort('XMPP', process.env.XMPP_PORT);
      log.printStartupSummary();
    });
  })
  .on("error", async (err) => {
    if (err.message == "EADDRINUSE") {
      log.error(`Port ${PORT} is already in use!\nClosing in 3 seconds...`);
      process.exit(0);
    } else throw err;
  });
const loggedUrls = new Set();
app.use((req, res, next) => {
  const url = req.originalUrl;
  if (!loggedUrls.has(url)) {
    loggedUrls.add(url);
    log.debug(
      `Missing endpoint: ${req.method} ${url} request port ${req.socket.localPort}`
    );
    Utils.createError(
      "errors.com.epicgames.common.not_found",
      "Sorry the resource you were trying to find could not be found",
      undefined,
      1004,
      undefined,
      404,
      res
    );
  }
  next();
});