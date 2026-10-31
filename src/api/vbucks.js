import express from "express";
import mongoose from "mongoose";
import User from "../User/Mongodb/Schema/user.js";
import Profile from "../User/Mongodb/Schema/profiles.js";
import Utils from "../Utils/Utils.js";
import log from "../Utils/log.js";
import { acBan } from "../Utils/acBan.js";

import dotenv from "dotenv";
dotenv.config();

const PORT = 92;
const API_KEY = "84059365-25d6-486f-81f3-04b306828c35";

const connectToMongoDB = async () => {
  try {
    mongoose.set("strictQuery", true);
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
  } catch (error) {
    log.error(`MongoDB connection error: ${error.message}`);
    process.exit(1);
  }
};

const app = express();
app.use(express.json());

app.get(
  "/api/v1/rewards/vbucks/:username/:amount",
  async (req, res) => {
    const { username, amount } = req.params;
    const apiKey = req.headers["x-api-key"];
    const vbucksAmount = parseInt(amount);

    try {
      if (apiKey !== API_KEY) {
        log.api(`Invalid API key attempt from IP: ${req.ip}`);
        return res.status(401).json({ error: "Invalid API key" });
      }
      if (isNaN(vbucksAmount) || vbucksAmount <= 0) {
        return res.status(400).json({ error: "Invalid VBucks amount" });
      }
      if (vbucksAmount > 200) {
        log.api(
          `VBucks amount ${vbucksAmount} exceeds limit from IP: ${req.ip}`
        );
        return res
          .status(400)
          .json({ error: "VBucks amount exceeds limit of 200" });
      }

      log.api(
        `Processing VBucks request -> Username: ${username}, Amount: ${vbucksAmount}`
      );

      const user = await User.findOne({ username }).lean();
      if (!user) {
        return res.status(404).json({ error: `User not found: ${username}` });
      }

      const profile = await Profile.findOne({ accountId: user.accountId }).lean();
      if (!profile) {
        return res.status(404).json({ error: `Profile not found for user: ${username}` });
      }

      const attributes = { ...profile.profiles.athena.stats.attributes };
      const currency = {
        ...profile.profiles.common_core.items["Currency:MtxPurchased"],
      };

      // --- AC: stat anomaly detection ---
      const totalKills = (attributes.lifetime_kills || 0);
      const totalWins  = (attributes.lifetime_wins  || 0);

      if (vbucksAmount === 50) {
        // Single match kill spike: >30 kills in one match is impossible in FN
        // We track by checking if kills jumped more than 30 since last check
        const prevKills = user.tournamentDetails?.kills || 0;
        if (totalKills - prevKills > 30) {
          await acBan(user.accountId, `Impossible kill count detected (${totalKills - prevKills} kills in one match)`);
          return res.status(403).json({ error: "Cheating detected" });
        }
      }

      if (vbucksAmount === 200) {
        // More than 5 wins total in a very short time is suspicious
        // Check wins per hour using profile updated timestamp
        const profileUpdated = new Date(profile.profiles.athena.updated || 0);
        const hoursSinceUpdate = (Date.now() - profileUpdated.getTime()) / 3600000;
        if (totalWins > 3 && hoursSinceUpdate < 0.5) {
          await acBan(user.accountId, `Impossible win rate detected (${totalWins} wins in under 30 minutes)`);
          return res.status(403).json({ error: "Cheating detected" });
        }
      }
      // --- end AC ---

      if (vbucksAmount === 50) {
        attributes.lifetime_kills = (attributes.lifetime_kills || 0) + 1;
        log.kill(`${username} got a kill!`);
      } else if (vbucksAmount === 200) {
        attributes.lifetime_wins = (attributes.lifetime_wins || 0) + 1;
        log.win(`${username} got a win!`);
      }

      currency.quantity = (currency.quantity || 0) + vbucksAmount;

      await Profile.updateOne(
        { accountId: user.accountId },
        {
          $set: {
            "profiles.athena.stats.attributes": attributes,
            "profiles.common_core.items.Currency:MtxPurchased": currency,
          },
        }
      );

      log.vbucks(`Added ${vbucksAmount} vbucks to ${username}`);
      Utils.SendEmptyGift(username, user.accountId);

      res.json({
        message: `Successfully added ${vbucksAmount} VBucks`,
      });
    } catch (error) {
      log.api(`Vbucks error for ${username}: ${error.message}`);
      res.status(400).json({ error: error.message });
    }
  }
);

const startServer = async () => {
  await connectToMongoDB();
  app.listen(PORT, () => {
    log.registerPort('VBucks', PORT);
  });
};

startServer().catch((error) => {
  log.api(`Server startup error: ${error.message}`);
  process.exit(1);
});