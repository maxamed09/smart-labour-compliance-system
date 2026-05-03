const { requestHandler } = require("../server.js");

function preserveOriginalApiPath(req) {
  const host = req.headers.host || "localhost";
  const url = new URL(req.url, `https://${host}`);
  const path = url.searchParams.get("path");

  if (path === null) {
    return;
  }

  url.searchParams.delete("path");
  req.url = `/api/${path}${url.search}`;
}

module.exports = async function handler(req, res) {
  preserveOriginalApiPath(req);
  return requestHandler(req, res);
};
