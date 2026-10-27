// Official Pump SDK remains a contained web3.js v1 compatibility boundary.
module.exports = {
  pump: require("@pump-fun/pump-sdk"),
  web3: require("@solana/web3.js"),
  spl: require("@solana/spl-token"),
};
