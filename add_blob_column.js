
const mysql = require('mysql2');

const dbConfig = {
    host: 'mysql.gb.stackcp.com',
    port: 40762,
    user: 'Attendance-095a',
    password: 'S@i85t@run',
    database: 'tvs_attendance-3133319d91',
    multipleStatements: true
};

const db = mysql.createConnection(dbConfig);

db.connect((err) => {
    if (err) {
        console.error('Connection Failed:', err);
        return;
    }
    console.log('Connected to MySQL');

    // Add profile_image_blob column
    const sql = "ALTER TABLE users ADD COLUMN profile_image_blob LONGBLOB DEFAULT NULL";

    db.query(sql, (err, result) => {
        if (err) {
            if (err.code === 'ER_DUP_FIELDNAME') {
                console.log('Column already exists.');
            } else {
                console.error('Error altering table:', err);
            }
        } else {
            console.log('Table altered successfully.');
        }
        db.end();
    });
});
