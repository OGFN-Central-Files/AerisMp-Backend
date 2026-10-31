import path from "path";
import log from "../Utils/log.js";
import { dirname } from "dirname-filename-esm";
const __dirname = dirname(import.meta);
import fs from "fs";
async function createProfiles(accountId) {
  log.debug(`Creating profiles for account ${accountId}`);
  let profiles = {};

  const newProfilesDir = path.join(__dirname, "../Base/DefaultProfiles/");
  const oldProfilesDir = path.join(__dirname, "../Profiles/DefaultProfiles/");
  const profilesDir = fs.existsSync(newProfilesDir) ? newProfilesDir : oldProfilesDir;

  fs.readdirSync(profilesDir).forEach(
    (fileName) => {
      if (fileName === "allathena.json") return;
      const profile = JSON.parse(
        fs.readFileSync(path.join(profilesDir, fileName), "utf-8").replace(/^\uFEFF/, "")
      );
      profile.accountId = accountId;
      profile.created = new Date().toISOString();
      profile.updated = new Date().toISOString();
      profiles[profile.profileId] = profile;
    }
  );
  return profiles;
}
async function validateProfile(profileId, profiles) {
  try {
    let profile = profiles.profiles[profileId];
    if (!profile || !profileId) throw new Error("Invalid profile/profileId");
  } catch {
    return false;
  }
  return true;
}
export default { createProfiles, validateProfile };