import express from "express";
import fs from "fs";
import path from "path";
import { dirname } from "dirname-filename-esm";
const __dirname = dirname(import.meta);
const eulaNewPath = path.join(__dirname, "../Base/responses/eula/SharedAgreements.json");
const eulaOldPath = path.join(__dirname, "../Base/eula/SharedAgreements.json");
const eulaJson = JSON.parse(
  fs.readFileSync(fs.existsSync(eulaNewPath) ? eulaNewPath : eulaOldPath, "utf8")
);
const app = express.Router();
app.get("/eulatracking/api/shared/agreements/fn", async (req, res) => {
  res.json(eulaJson);
});
app.get(
  "/eulatracking/api/public/agreements/fn/account/:accountId",
  async (req, res) => {
    res.status(204).send();
  }
);
export default app;