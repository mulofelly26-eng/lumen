const path = require("path");
// On your PC this reads the .env file in the main folder. On a host like Render there is no file:
// the values come from the host's settings page instead. ENV_FILE can point at a different file.
require("dotenv").config({ path: process.env.ENV_FILE || path.join(__dirname, "..", ".env") });
 
const mysql = require("mysql2/promise");
 
// Hosted databases (Aiven and others) require an encrypted connection.
function sslOptions() {
    if (process.env.DB_CA) {
        // The provider's CA certificate: encrypted AND the server's identity is checked
        return { ca: process.env.DB_CA.replace(/\\n/g, "\n"), rejectUnauthorized: true };
    }
    if (process.env.DB_SSL === "true") {
        return { rejectUnauthorized: false };     // encrypted, but the identity is not checked
    }
    return undefined;                              // local MySQL: no encryption needed
}
 
const pool = mysql.createPool({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: sslOptions(),
    waitForConnections: true,   // queue requests when all connections are busy
    connectionLimit: 10,
});
 
module.exports = pool;
