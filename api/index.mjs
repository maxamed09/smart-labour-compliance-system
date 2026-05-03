import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { ensureDb } = require("../src/storage.js");
const { requestHandler } = require("../server.js");

let readyPromise;

function prepareApplication() {
  if (!readyPromise) {
    readyPromise = ensureDb();
  }
  return readyPromise;
}

export default async function handler(req, res) {
  await prepareApplication();
  return requestHandler(req, res);
}
