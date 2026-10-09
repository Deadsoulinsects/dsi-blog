// Verification-only preload. It is never imported by the normal application/build.
const net = require('node:net');
const http = require('node:http');
const https = require('node:https');
const deny = () => { throw new Error('FONT_OFFLINE_VERIFICATION: network access prohibited'); };
net.Socket.prototype.connect = deny;
net.connect = deny;
net.createConnection = deny;
http.request = deny;
http.get = deny;
https.request = deny;
https.get = deny;
globalThis.fetch = deny;
