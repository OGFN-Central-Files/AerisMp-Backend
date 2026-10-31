import express from "express";
const app = express.Router();
import Profile from "../User/Mongodb/Schema/profiles.js";
import Friends from "../User/Mongodb/Schema/friends.js";
import Utils from "../Utils/Utils.js";
import { verifyToken } from "../User/tokenManager/tokenVerify.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const keychainNewPath = path.join(__dirname, "../Base/responses/keychain.json");
const keychainOldPath = path.join(__dirname, "../Base/KeyChain/keychain.json");
const keychain = JSON.parse(
  fs.readFileSync(fs.existsSync(keychainNewPath) ? keychainNewPath : keychainOldPath, "utf8")
);

const catalogNewPath = path.join(__dirname, "../Base/responses/catalog.json");
const catalogOldPath = path.join(__dirname, "../Base/Storefront/Catalog.json");
const catalogPath = fs.existsSync(catalogNewPath) ? catalogNewPath : catalogOldPath;

const shopNewPath = path.join(__dirname, "../Base/shop.json");
const shopOldPath = path.join(__dirname, "../Base/Storefront/shop.json");
const shopPath = fs.existsSync(shopNewPath) ? shopNewPath : shopOldPath;

function buildEntryFromShopItem(key, item) {
  const templateId = item.itemGrants[0];
  const [type, name] = templateId.split(":");

  const prefixMap = {
    AthenaCharacter: "DA_Featured",
    AthenaBackpack: "DA_Featured",
    AthenaPickaxe: "DA_Featured",
    AthenaGlider: "DA_Featured",
    AthenaDance: "DA_Daily",
    AthenaItemWrap: "DA_Daily",
    AthenaMusicPack: "DA_Daily",
    AthenaLoadingscreen: "DA_Daily",
    AthenaLoadingScreen: "DA_Daily",
    AthenaSkyDiveContrail: "DA_Daily",
    AthenaEmoji: "DA_Daily",
    AthenaToy: "DA_Daily",
  };
  const prefix = prefixMap[type] || "DA_Featured";
  const assetName = `${prefix}_${name}`;
  const assetPath = `/Game/Catalog/DisplayAssets/${assetName}.${assetName}`;
  const sectionId = key.startsWith("featured") ? "Featured" : "Daily";

  return {
    devName: `[VIRTUAL]1 x ${name} for ${item.price} MtxCurrency`,
    offerId: `v2:/${Buffer.from(key + templateId).toString("base64")}`,
    fulfillmentIds: [],
    dailyLimit: -1,
    weeklyLimit: -1,
    monthlyLimit: -1,
    categories: [],
    prices: [
      {
        currencyType: "MtxCurrency",
        currencySubType: "",
        regularPrice: item.price,
        finalPrice: item.price,
        saleExpiration: "9999-12-31T23:59:59.999Z",
        basePrice: item.price,
      },
    ],
    meta: {},
    matchFilter: "",
    filterWeight: 0,
    appStoreId: [],
    requirements: [],
    offerType: "StaticPrice",
    giftInfo: {},
    refundable: true,
    metaInfo: [
      { key: "SectionId", value: sectionId },
      { key: "NewDisplayAssetPath", value: assetPath },
    ],
    displayAssetPath: assetPath,
    itemGrants: item.itemGrants.map((t) => ({ templateId: t, quantity: 1 })),
    sortPriority: -1,
    catalogGroupPriority: 0,
  };
}

function buildCatalogFromShop() {
  const shop = JSON.parse(fs.readFileSync(shopPath, "utf8"));
  const featured = [];
  const daily = [];

  for (const [key, item] of Object.entries(shop)) {
    const entry = buildEntryFromShopItem(key, item);
    if (key.startsWith("featured")) featured.push(entry);
    else daily.push(entry);
  }

  const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  for (const storefront of catalog.storefronts) {
    if (storefront.name === "BRWeeklyStorefront") storefront.catalogEntries = featured;
    if (storefront.name === "BRDailyStorefront") storefront.catalogEntries = daily;
  }
  fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2), "utf8");
  console.log(`[SHOP] Built from shop.json: ${featured.length} featured, ${daily.length} daily`);
}

// Build catalog from shop.json on startup
buildCatalogFromShop();

app.get("/fortnite/api/storefront/v2/catalog", (req, res) => {
  console.log("[CATALOG] Hit by UA:", req.headers["user-agent"]);
  if (!req.headers["user-agent"]) {
    console.log("[CATALOG] Blocked - no user-agent");
    return res.status(400).end();
  }
  if (req.headers["user-agent"].includes("2870186")) {
    console.log("[CATALOG] Blocked - launcher UA");
    return res.status(404).end();
  }

  try {
    const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));

    console.log("[CATALOG] Loaded, storefronts:", catalog.storefronts.map(s => `${s.name}(${s.catalogEntries.length})`).join(", "));

    for (const storefront of catalog.storefronts) {
      for (const entry of storefront.catalogEntries) {
        // strip ownership requirements so items always show on full locker servers
        entry.requirements = [];

        // ensure metaInfo array exists
        if (!Array.isArray(entry.metaInfo)) entry.metaInfo = [];

        // set sectionId so the game places items in the right shop tab
        const sectionMap = {
          BRWeeklyStorefront: "Featured",
          BRDailyStorefront: "Daily",
        };
        const sectionId = sectionMap[storefront.name];
        if (sectionId) {
          const hasSectionId = entry.metaInfo.some((m) => (m.key || m.Key) === "SectionId");
          if (!hasSectionId) entry.metaInfo.push({ key: "SectionId", value: sectionId });
        }

        // normalize prices to numbers
        if (Array.isArray(entry.prices)) {
          entry.prices = entry.prices.map((p) => ({
            ...p,
            regularPrice: Number(p.regularPrice) || 0,
            finalPrice: Number(p.finalPrice) || 0,
            basePrice: Number(p.basePrice) || 0,
          }));
        }

        // auto-generate displayAssetPath and Season 19+ NewDisplayAssetPath from first itemGrant if missing
        if (entry.itemGrants?.length > 0) {
          const templateId = entry.itemGrants[0].templateId;
          const [type, name] = templateId.split(":");
          const prefixMap = {
            AthenaCharacter: "DA_Featured",
            AthenaBackpack: "DA_Featured",
            AthenaPickaxe: "DA_Featured",
            AthenaGlider: "DA_Featured",
            AthenaDance: "DA_Daily",
            AthenaItemWrap: "DA_Daily",
            AthenaMusicPack: "DA_Daily",
            AthenaLoadingScreen: "DA_Daily",
            AthenaSkyDiveContrail: "DA_Daily",
          };
          const prefix = prefixMap[type] || "DA_Featured";
          const assetName = `${prefix}_${name}`;
          const assetPath = `/Game/Catalog/DisplayAssets/${assetName}.${assetName}`;

          if (!entry.displayAssetPath) entry.displayAssetPath = assetPath;

          // Season 14+ uses NewDisplayAssetPath in metaInfo
          if (!Array.isArray(entry.metaInfo)) entry.metaInfo = [];
          const hasNew = entry.metaInfo.some(m => m.key === "NewDisplayAssetPath" || m.Key === "NewDisplayAssetPath");
          if (!hasNew) {
            entry.metaInfo.push({ key: "NewDisplayAssetPath", value: assetPath });
          }
        }
      }
    }

    res.json(catalog);
  } catch (err) {
    console.log("Failed to load catalog.json:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
app.get(
  "/fortnite/api/storefront/v2/gift/check_eligibility/recipient/:recipientId/offer/:offerId",
  verifyToken,
  async (req, res) => {
    const findOfferId = Utils.getOfferID(req.params.offerId);
    if (!findOfferId) {
      return Utils.createError(
        "errors.com.epicgames.fortnite.id_invalid",
        `Offer ID (id: "${req.params.offerId}") not found`,
        [req.params.offerId],
        16027,
        undefined,
        400,
        res
      );
    }
    const sender = await Friends.findOne({
      accountId: req.user.accountId,
    }).lean();
    const acceptedFriend = sender.list.accepted.find(
      (i) => i.accountId == req.params.recipientId
    );
    if (!acceptedFriend && req.params.recipientId != req.user.accountId) {
      return Utils.createError(
        "errors.com.epicgames.friends.no_relationship",
        `User ${req.user.accountId} is not friends with ${req.params.recipientId}`,
        [req.user.accountId, req.params.recipientId],
        28004,
        undefined,
        403,
        res
      );
    }
    const profiles = await Profile.findOne({
      accountId: req.params.recipientId,
    });
    const athena = profiles.profiles["athena"];
    for (const itemGrant of findOfferId.offerId.itemGrants) {
      if (!athena.items || typeof athena.items !== "object") {
        return Utils.createError(
          "errors.com.epicgames.modules.gamesubcatalog.purchase_not_allowed",
          `Could not purchase catalog offer ${findOfferId.offerId.devName}, item ${itemGrant.templateId} as 'items' is not an object`,
          [findOfferId.offerId.devName, itemGrant.templateId],
          28004,
          undefined,
          403,
          res
        );
      }
      const templateIdLowerCase = itemGrant.templateId.toLowerCase();
      const itemKeys = Object.keys(athena.items);
      if (
        itemKeys.some(
          (itemKey) => itemKey.toLowerCase() === templateIdLowerCase
        )
      ) {
        return Utils.createError(
          "errors.com.epicgames.modules.gamesubcatalog.purchase_not_allowed",
          `Could not purchase catalog offer ${findOfferId.offerId.devName}, item ${itemGrant.templateId}`,
          [findOfferId.offerId.devName, itemGrant.templateId],
          28004,
          undefined,
          403,
          res
        );
      }
    }
    res.json({
      price: findOfferId.offerId.prices[0],
      items: findOfferId.offerId.itemGrants,
    });
  }
);
app.get("/fortnite/api/storefront/v2/keychain", (req, res) => {
  res.json(keychain);
});
app.get("/catalog/api/shared/bulk/offers", (req, res) => {
  res.json({});
});

// V-Bucks give endpoint (used by /give Discord command)
app.post("/api/v1/vbucks/give", async (req, res) => {
  const apiKey = req.headers["x-api-key"];
  if (apiKey !== process.env.GAME_API_KEY && apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { accountId, amount } = req.body;
  if (!accountId || !amount || isNaN(amount) || amount <= 0) {
    return res.status(400).json({ error: "Invalid accountId or amount" });
  }

  try {
    const profile = await Profile.findOne({ accountId });
    if (!profile) return res.status(404).json({ error: "Profile not found" });

    const cc = profile.profiles["common_core"];
    if (!cc.items["Currency:MtxPurchased"]) {
      cc.items["Currency:MtxPurchased"] = { templateId: "Currency:MtxPurchased", attributes: { platform: "Shared" }, quantity: 0 };
    }
    cc.items["Currency:MtxPurchased"].quantity += Number(amount);
    cc.rvn += 1;
    cc.commandRevision += 1;
    cc.updated = new Date().toISOString();

    await profile.updateOne({ $set: { "profiles.common_core": cc } });

    res.json({ success: true, vbucks: cc.items["Currency:MtxPurchased"].quantity });
  } catch (err) {
    console.error("vbucks/give error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// V-Bucks balance endpoint
app.get("/api/v1/vbucks/balance/:accountId", async (req, res) => {
  const apiKey = req.headers["x-api-key"];
  if (apiKey !== process.env.GAME_API_KEY && apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const profile = await Profile.findOne({ accountId: req.params.accountId }).lean();
    if (!profile) return res.status(404).json({ error: "Profile not found" });
    const vbucks = profile.profiles["common_core"]?.items?.["Currency:MtxPurchased"]?.quantity ?? 0;
    res.json({ vbucks });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});
app.post("/api/v1/shop/rotate", (req, res) => {
  const apiKey = req.headers["x-api-key"];
  if (apiKey !== process.env.GAME_API_KEY && apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    buildCatalogFromShop();
    const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
    const daily = catalog.storefronts.find((s) => s.name === "BRDailyStorefront")?.catalogEntries?.length || 0;
    const weekly = catalog.storefronts.find((s) => s.name === "BRWeeklyStorefront")?.catalogEntries?.length || 0;
    res.json({ success: true, daily, weekly });
  } catch (err) {
    console.error("Failed to rotate shop:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default app;
//# sourceMappingURL=storefront.js.map
