const axios = require("axios");

const api = axios.create({
  baseURL: "https://newtoo.space/"
});

module.exports = api;
