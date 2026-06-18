const db = require('./db.js');
db.prepare("UPDATE users SET subscribed = 0 WHERE username = 'testuser'").run();
console.log('Successfully unsubscribed testuser for UI preview.');
