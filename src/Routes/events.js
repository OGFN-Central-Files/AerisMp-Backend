import express from "express";
import fs from "fs";
import Utils from "../Utils/Utils.js";
import log from "../Utils/log.js";
import path from "path";
import { dirname } from 'dirname-filename-esm';
import { v4 } from 'uuid';
import UserModel from "../User/Mongodb/Schema/user.js";
import ProfileModel from "../User/Mongodb/Schema/profiles.js";

import dotenv from "dotenv";
dotenv.config();

const __dirname = dirname(import.meta);
const app = express.Router();

async function GetPlayerHype(accountid) {
    try {
        const profile = await ProfileModel.findOne({ accountId: accountid }).lean();
        return profile?.profiles?.athena?.stats?.attributes?.arena_hype || 0;
    } catch (err) {
        log.error(`GetPlayerHype error: ${err.message}`);
        return 0;
    }
}

app.get("/api/v1/events/Fortnite/download/:accountid", async (req, res) => {
    console.log("[EVENTS] Download hit for accountId:", req.params.accountid);
    const seasonNum = Utils.GetVersion(req).season || parseInt(process.env.MAIN_SEASON) || 9;
    const accountid = req.params.accountid;
    const user = await UserModel.findOne({ accountId: accountid }).lean();

    // Don't block on missing user — still serve events with default tokens
    const username = user?.username || accountid;

    let playerHype = 0;
    try {
        playerHype = await GetPlayerHype(accountid);
    } catch (err) {
        log.error("Error getting player hype! Error :", err);
    }

    const currentSeason = "S" + seasonNum;

    // determine which division tokens the player has earned
    const divisionThresholds = [0, 250, 500, 1000, 1500, 2500, 4000, 6000, 12000, 16000];
    let divisionIndex = 0;
    for (let i = divisionThresholds.length - 1; i >= 0; i--) {
        if (playerHype >= divisionThresholds[i]) {
            divisionIndex = i;
            break;
        }
    }

    const tokens = [];
    for (let i = 1; i <= divisionIndex + 1; i++) {
        tokens.push(`ARENA_${currentSeason}_Division${i}`);
    }
    if (tokens.length === 0) tokens.push(`ARENA_${currentSeason}_Division1`);

    try {
        const eventsNewPath = path.join(__dirname, "../Base/responses/eventlistactive.json");
        const eventsOldPath = path.join(__dirname, "../Base/events/Events.json");
        const eventsFilePath = fs.existsSync(eventsNewPath) ? eventsNewPath : eventsOldPath;
        const eventsData = JSON.parse(
            fs.readFileSync(eventsFilePath, "utf-8").replace(/^\uFEFF/, "")
        );

        // patch the player's tokens and hype into the response
        if (eventsData.player) {
            eventsData.player.tokens = tokens;
            eventsData.player.accountId = accountid;
            if (eventsData.player.persistentScores !== undefined) {
                eventsData.player.persistentScores.Hype = playerHype;
            } else {
                eventsData.player.persistentScores = { Hype: playerHype };
            }
            if (eventsData.player.Hype !== undefined) {
                eventsData.player.Hype = playerHype;
            }
        } else {
            eventsData.player = {
                accountId: accountid,
                gameId: "Fortnite",
                persistentScores: { Hype: playerHype },
                tokens,
            };
        }

        // patch accountId into any scoreLocations or entries that need it
        const eventsStr = JSON.stringify(eventsData)
            .replace(/skunkyskunkyaccountid/g, accountid)
            .replace(/skunkyskunkyseason/g, currentSeason)
            .replace(/skunkyskunkyhype/g, String(playerHype))
            // Replace all hardcoded season numbers with the current season
            .replace(/S\d+_Division/g, `${currentSeason}_Division`)
            .replace(/Arena_S\d+/g, `Arena_${currentSeason}`)
            .replace(/epicgames_Arena_S\d+/g, `epicgames_Arena_${currentSeason}`)
            .replace(/eventTemplate_Arena_S\d+/g, `eventTemplate_Arena_${currentSeason}`);

        log.arena(username + " sent an arena JSON request!");
        res.json(JSON.parse(eventsStr));
    } catch (err) {
        log.error("Error reading/parsing Events.json:", err);
        res.status(500).send("Error reading events data");
    }
});

app.get("/api/v1/players/Fortnite/tokens", async (req, res) => {
    res.json({});
});

app.get("/api/v1/leaderboards/Fortnite/:eventId/:eventWindowId/:accountId", async (req, res) => {
    try {
        const { eventId, eventWindowId, accountId } = req.params;
        const newLeaderboardPath = path.join(__dirname, "../Base/responses/leaderboard.json");
        const oldLeaderboardPath = path.join(__dirname, "../Base/events/leaderboard.json");
        const filePath = fs.existsSync(path.dirname(newLeaderboardPath)) ? newLeaderboardPath : oldLeaderboardPath;

        if (!fs.existsSync(filePath)) {
            console.error(`leaderboard.json not found at ${filePath}`);
            return res.status(404).json({ error: "Leaderboard data not found" });
        }

        const users = await UserModel.find({});
        if (!users || users.length === 0) {
            console.warn("No users found in database");
            return res.status(404).json({ error: "No users found" });
        }

        const leaderboard = {
            entries: [],
            eventId,
            eventWindowId,
            gameId: "Fortnite",
            page: 0,
            totalPages: 1,
            updatedTime: new Date().toISOString(),
        };

        for (const user of users) {
            if (user.accountId !== accountId) continue;
            if (!user.tournamentDetails?.played) continue;

            const matches = user.tournamentDetails?.matches ?? [];
            if (!Array.isArray(matches) || matches.length === 0) {
                continue;
            }

            const pointBreakdown = {};
            const sessionHistory = [];

            let totalPoints = 0;
            let totalKills = 0;

            for (const match of matches) {
                const isValid =
                    match.placement != null &&
                    match.placementPoints != null &&
                    match.kills != null &&
                    match.killPoints != null &&
                    match.timeAlive != null &&
                    match.victory != null;

                if (!isValid) {
                    console.log(
                        `⚠️ Incomplete match skipped for user ${user.accountId}:`,
                        JSON.stringify(match, null, 2)
                    );
                    continue;
                }

                const placementKey = `PLACEMENT_STAT_INDEX:${match.placement}`;
                if (!pointBreakdown[placementKey]) {
                    pointBreakdown[placementKey] = {
                        pointsEarned: match.placementPoints,
                        timesAchieved: 1,
                    };
                } else {
                    pointBreakdown[placementKey].pointsEarned += match.placementPoints;
                    pointBreakdown[placementKey].timesAchieved += 1;
                }

                totalKills += match.kills;
                totalPoints += match.placementPoints + match.killPoints;

                sessionHistory.push({
                    endTime: new Date().toISOString(),
                    sessionId: v4(),
                    trackedStats: {
                        MATCH_PLAYED_STAT: 1,
                        PLACEMENT_STAT_INDEX: match.placement,
                        TEAM_ELIMS_STAT_INDEX: match.kills,
                        TIME_ALIVE_STAT: match.timeAlive,
                        VICTORY_ROYALE_STAT: match.victory,
                    },
                });
            }

            if (totalKills > 0) {
                pointBreakdown["TEAM_ELIMS_STAT_INDEX:0"] = {
                    pointsEarned: totalKills,
                    timesAchieved: totalKills,
                };
            }

            leaderboard.entries.push({
                eventId,
                eventWindowId,
                gameId: "Fortnite",
                percentile: 0,
                pointBreakdown,
                pointsEarned: totalPoints,
                rank: 1,
                score: Date.now(),
                scoreKey: {
                    _scoreId: null,
                    eventId,
                    eventWindowId,
                    gameId: "Fortnite",
                },
                sessionHistory,
                teamAccountIds: [user.accountId],
                teamId: user.accountId,
                unscoredSessions: {},
            });
        }

        try {
            fs.writeFileSync(filePath, JSON.stringify(leaderboard, null, 2), "utf8");
        } catch (writeError) {
            console.error(`Failed to write leaderboard.json:`, writeError);
            return res.status(500).json({ error: "Failed to save leaderboard data" });
        }

        return res.json(leaderboard);
    } catch (error) {
        console.error(
            `Error in /api/v1/leaderboards/Fortnite/:eventId/:eventWindowId/:accountId:`,
            error
        );
        return res.status(500).json({ error: "Internal server error" });
    }
});

app.get("/api/v1/events/Fortnite/data/", async (req, res) => {
    res.json({});
});

app.get("/api/v1/events/Fortnite/:eventId/:eventWindowId/history/:accountId", async (req, res) => {
    res.json({});
});

app.get("/api/v1/events/Fortnite/:eventId/history/:accountId", async (req, res) => {
    try {
        const historyNewPath = path.join(__dirname, "../Base/responses/history.json");
        const historyOldPath = path.join(__dirname, "../Base/events/history.json");
        const historyPath = fs.existsSync(historyNewPath) ? historyNewPath : (fs.existsSync(historyOldPath) ? historyOldPath : null);
        if (!historyPath) return res.json([]);
        const history = JSON.parse(
            fs.readFileSync(historyPath, { encoding: "utf8" }).replace(/^\uFEFF/, "")
        );

        history[0].scoreKey.eventId = req.params.eventId;
        history[0].teamId = req.params.accountId;
        history[0].teamAccountIds.push(req.params.accountId);

        const user = await UserModel.findOne({ accountId: req.params.accountId });
        if (!user) {
            console.error(`User not found for accountId: ${req.params.accountId}`);
            return res.status(404).json({ error: "User not found" });
        }

        const tournamentDetails = user.tournamentDetails || {
            kills: 0,
            placement: 0,
            points: 0,
            wins: 0,
            matchesPlayed: 0,
            matches: [],
        };

        const dedicatedPlayer = {
            TeamId: user.username || "Unknown",
            TeamAccountId: user.accountId,
            PointsEarned: tournamentDetails.points,
            SessionHistory: user.username ? `${user.username}sessionId` : "unknownSessionId",
        };

        const eventId = "helixlg_cup";
        const windowId = "helixlg_cup1";
        const rank = 5;
        const percentile = 0;
        const pointBreakdown = {
            eliminations: tournamentDetails.kills,
            placements: tournamentDetails.placement,
        };

        const response = [
            {
                scoreKey: {
                    gameId: "Fortnite",
                    eventId,
                    eventWindowId: windowId,
                    _scoreId: null,
                },
                teamId: dedicatedPlayer.TeamId,
                teamAccountIds: Array.isArray(dedicatedPlayer.TeamAccountId)
                    ? dedicatedPlayer.TeamAccountId
                    : [dedicatedPlayer.TeamAccountId],
                liveSessionId: null,
                pointsEarned: dedicatedPlayer.PointsEarned,
                eventWindowId: windowId,
                score: dedicatedPlayer.PointsEarned,
                gameId: "Fortnite",
                eventId,
                rank: rank,
                percentile: Math.round(percentile),
                pointBreakdown: pointBreakdown,
                sessionHistory: dedicatedPlayer.SessionHistory,
                unscoredSessions: [],
            },
        ];

        return res.json(response);
    } catch (error) {
        console.error(`Error in /api/v1/events/Fortnite/:eventId/history/:accountId:`, error);
        return res.status(500).json({ error: "Internal server error" });
    }
});

app.get("/api/v1/events/Fortnite/:windowId/history/:accountId", async (req, res) => {
    res.json({});
});

app.get("/api/v1/players/Fortnite/:accountId", async (req, res) => {
    res.json({
        "result": true,
        "region": "EU",
        "lang": "en",
        "season": process.env.MAIN_SEASON,
        "events": []
    });
});

export default app;