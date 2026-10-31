import express from "express";
const app = express.Router();
import path from "path";
import fs from "fs";
import { dirname } from "dirname-filename-esm";
const __dirname = dirname(import.meta);
app.post("/fortnite/api/game/v2/chat/*/*/*/pc", (req, res) => {
  let resp = { GlobalChatRooms: [{ roomName: "Nebulaglobal" }] };
  res.json(resp);
});
app.post("/fortnite/api/game/v2/tryPlayOnPlatform/account/*", (req, res) => {
  res.setHeader("Content-Type", "text/plain");
  res.send(true);
});
app.get("/launcher/api/public/distributionpoints/", (req, res) => {
  res.json({
    distributions: [
      "https://download.epicgames.com/",
      "https://download2.epicgames.com/",
      "https://download3.epicgames.com/",
      "https://download4.epicgames.com/",
      "https://epicgames-download1.akamaized.net/",
    ],
  });
});
app.get("/launcher/api/public/assets/*", async (req, res) => {
  res.json({
    appName: "FortniteContentBuilds",
    labelName: "Nebula",
    buildVersion: "++Fortnite+Release-20.00-CL-19458861-Windows",
    catalogItemId: "5cb97847cee34581afdbc445400e2f77",
    expires: "9999-12-31T23:59:59.999Z",
    items: {
      MANIFEST: {
        signature: "Nebula",
        distribution: "https://Nebula.ol.epicgames.com/",
        path: "Builds/Fortnite/Content/CloudDir/Nebula.manifest",
        hash: "55bb954f5596cadbe03693e1c06ca73368d427f3",
        additionalDistributions: [],
      },
      CHUNKS: {
        signature: "Nebula",
        distribution: "https://Nebula.ol.epicgames.com/",
        path: "Builds/Fortnite/Content/CloudDir/Nebula.manifest",
        additionalDistributions: [],
      },
    },
    assetId: "FortniteContentBuilds",
  });
});
app.get("/Builds/Fortnite/Content/CloudDir/*.manifest", async (req, res) => {
  res.set("Content-Type", "application/octet-stream");
  const manifest = fs.readFileSync(
    path.join(
      __dirname,
      "../",
      "CloudDir",
      "Nebula.manifest"
    )
  );
  res.status(200).send(manifest).end();
});
app.get("/Builds/Fortnite/Content/CloudDir/*.chunk", async (req, res) => {
  res.set("Content-Type", "application/octet-stream");
  const chunk = fs.readFileSync(
    path.join(__dirname, "../", "CloudDir", "Nebula.chunk")
  );
  res.status(200).send(chunk).end();
});
app.get("/Builds/Fortnite/Content/CloudDir/*.ini", async (req, res) => {
  const ini = fs.readFileSync(
    path.join(__dirname, "../../", "CloudDir", "Full.ini")
  );
  res.status(200).send(ini).end();
});
app.get("/waitingroom/api/waitingroom", (req, res) => {
  res.status(204);
  res.end();
});
app.get("/socialban/api/public/v1/*", (req, res) => {
  res.json({
    bans: [],
    warnings: [],
  });
});
app.get(
  "/fortnite/api/game/v2/events/tournamentandhistory/*/EU/WindowsClient",
  (req, res) => {
    res.json({});
  }
);
app.get("/fortnite/api/statsv2/account/:accountId", (req, res) => {
  res.json({
    startTime: 0,
    endTime: 0,
    stats: {},
    accountId: req.params.accountId,
  });
});
app.get("/statsproxy/api/statsv2/account/:accountId", (req, res) => {
  res.json({
    startTime: 0,
    endTime: 0,
    stats: {},
    accountId: req.params.accountId,
  });
});
app.get(
  "/fortnite/api/stats/accountId/:accountId/bulk/window/alltime",
  (req, res) => {
    res.json({
      startTime: 0,
      endTime: 0,
      stats: {},
      accountId: req.params.accountId,
    });
  }
);
app.post("/fortnite/api/feedback/*", (req, res) => {
  res.status(200);
  res.end();
});
app.post("/fortnite/api/statsv2/query", (req, res) => {
  res.json([]);
});
app.post("/statsproxy/api/statsv2/query", (req, res) => {
  res.json([]);
});
app.post("/fortnite/api/game/v2/events/v2/setSubgroup/*", (req, res) => {
  res.status(204);
  res.end();
});
app.get("/fortnite/api/game/v2/enabled_features", (req, res) => {
  res.json([]);
});
app.post(
  "/api/v1/assets/Fortnite/*/*",
  async (req, res) => {
    /*if (req.body.hasOwnProperty("FortCreativeDiscoverySurface") && req.body.FortCreativeDiscoverySurface == 0) {
        const discovery_api_assets = require("../../responses/Athena/Discovery/discovery_api_assets.json");
        res.json(discovery_api_assets)
    }
    else {*/
    res.json({
      FortCreativeDiscoverySurface: {
        meta: {
          promotion: req.body.FortCreativeDiscoverySurface || 0,
        },
        assets: {},
      },
    });
  }
  /*}*/
);
app.get("/fortnite/api/game/v2/twitch/*", (req, res) => {
  res.status(200);
  res.end();
});
app.get("/fortnite/api/game/v2/world/info", (req, res) => {
  res.json({});
});
app.post(
  "/fortnite/api/game/v2/chat/*/recommendGeneralChatRooms/pc",
  (req, res) => {
    res.json({});
  }
);
app.get("/fortnite/api/receipts/v1/account/*/receipts", (req, res) => {
  res.json([]);
});
app.get("/fortnite/api/game/v2/leaderboards/cohort/*", (req, res) => {
  res.json([]);
});
app.post("/datarouter/api/v1/public/data", (req, res) => {
  res.status(204);
  res.end();
});
app.post("/api/v1/user/setting", async (req, res) => {
  res.json([]);
})
export default app;
//# sourceMappingURL=main.js.map

app.get("/region", (req, res) => {
  res.json({
    continent: { code: "EU", geoname_id: 6255148, names: { en: "Europe" } },
    country: { geoname_id: 2635167, is_in_european_union: false, iso_code: "GB", names: { en: "United Kingdom" } },
  });
});

app.get("/v1/avatar/fortnite/ids", (req, res) => {
  res.json([]);
});

app.get("/content-controls/:accountId", (req, res) => {
  res.json({ accountId: req.params.accountId, settings: [] });
});

app.get("/content-controls/:accountId/rules/namespaces/:namespace", (req, res) => {
  res.json({ rules: [] });
});

app.post("/api/v1/fortnite-br/surfaces/motd/interactions", (req, res) => {
  res.status(204).end();
});

app.put("/profiles", (req, res) => {
  res.status(204).end();
});

app.post("/profile/privacy_settings", (req, res) => {
  res.status(204).end();
});

app.put("/profile/privacy_settings", (req, res) => {
  res.status(204).end();
});

app.put("/profile/languages", (req, res) => {
  res.status(204).end();
});

app.get("/presence/api/v1/_/:accountId/last-online", (req, res) => {
  res.json([]);
});

app.get("/api/v2/interactions/latest/Fortnite/:accountId", (req, res) => {
  res.json({ interactions: [] });
});

app.get("/api/v2/interactions/aggregated/Fortnite/:accountId", (req, res) => {
  res.json({ interactions: [] });
});

app.get("/api/content/v2/launch-data", (req, res) => {
  res.json({});
});

app.get("/fortnite/api/game/v2/br-inventory/account/:accountId", (req, res) => {
  res.json({ stash: { globalcash: 0 } });
});

app.get("/party/api/v1/Fortnite/user/:accountId/notifications/undelivered/count", (req, res) => {
  res.json({ count: 0 });
});

app.get("/fortnite/api/cloudstorage/system/config", (req, res) => {
  res.status(204).end();
});

app.get("/fortnite/api/game/v2/creative/favorites/:accountId", (req, res) => {
  res.json({ results: [], total: 0 });
});

app.get("/fortnite/api/game/v2/creative/history/:accountId", (req, res) => {
  res.json({ results: [], total: 0 });
});

app.post("/fortnite/api/game/v2/creative/discovery/surface/:accountId", (req, res) => {
  try {
    const discovery = JSON.parse(
      fs.readFileSync(path.join(__dirname, "../", "Base", "Discovery", "Discovery.json"), "utf-8")
    );
    res.json(discovery);
  } catch {
    res.json({ Panels: [], TestCohorts: [], ModeSets: {} });
  }
});
