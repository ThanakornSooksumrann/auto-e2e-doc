#!/usr/bin/env node
"use strict";

/**
 * Script for AI to check if a new version of the auto-e2e-doc skill is available.
 * It compares the local package.json version with the master branch on GitHub.
 */

const fs = require("fs");
const path = require("path");

const REPO_PACKAGE_URL = "https://raw.githubusercontent.com/ThanakornSooksumrann/auto-e2e-doc/master/package.json";
const LOCAL_PACKAGE_PATH = path.join(__dirname, "..", "..", "..", "package.json");

// Simple semver compare (a > b)
function isNewerVersion(remote, local) {
  if (!remote || !local) return false;
  const rParts = remote.split('.').map(Number);
  const lParts = local.split('.').map(Number);
  
  for (let i = 0; i < 3; i++) {
    const r = rParts[i] || 0;
    const l = lParts[i] || 0;
    if (r > l) return true;
    if (r < l) return false;
  }
  return false;
}

async function checkUpdate() {
  try {
    // Read local version
    if (!fs.existsSync(LOCAL_PACKAGE_PATH)) {
      // If we can't find the root package.json, try the skill's own package.json
      const skillPackagePath = path.join(__dirname, "..", "package.json");
      if (!fs.existsSync(skillPackagePath)) return;
      var localData = JSON.parse(fs.readFileSync(skillPackagePath, "utf8"));
    } else {
      var localData = JSON.parse(fs.readFileSync(LOCAL_PACKAGE_PATH, "utf8"));
    }
    const localVersion = localData.version || "1.0.0";

    // Fetch remote version
    const response = await fetch(REPO_PACKAGE_URL, {
      // short timeout to prevent hanging the AI
      signal: AbortSignal.timeout(3000)
    });
    
    if (!response.ok) return;
    const remoteData = await response.json();
    const remoteVersion = remoteData.version;

    if (isNewerVersion(remoteVersion, localVersion)) {
      console.log(`UPDATE_AVAILABLE: ${remoteVersion}`);
    } else {
      console.log("UP_TO_DATE");
    }
  } catch (error) {
    // Silently fail if offline or timeout
    console.log("UPDATE_CHECK_FAILED");
  }
}

checkUpdate();
