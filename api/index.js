const url = require('url');
const server = require('../server');

module.exports = async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  if (server.handleApi) {
    await server.handleApi(req, res, parsedUrl);
  } else {
    server.emit('request', req, res);
  }
};
