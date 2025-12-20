const mysql = require('mysql2');

const dbConfig = {
    host: 'mysql.gb.stackcp.com',
    port: 40762,
    user: 'Attendance-095a',
    password: 'S@i85t@run',
    database: 'tvs_attendance-3133319d91',
    connectTimeout: 10000
};

const connection = mysql.createConnection(dbConfig);

const alterQuery = "ALTER TABLE attendance ADD COLUMN last_seen DATETIME DEFAULT NULL;";

connection.query(alterQuery, (err, results) => {
    if (err) {
        if (err.code === 'ER_DUP_FIELDNAME') {
            console.log("Column 'last_seen' already exists.");
        } else {
            console.error("Error adding column:", err.message);
        }
    } else {
        console.log("Column 'last_seen' added successfully.");
    }
    connection.end();
});
