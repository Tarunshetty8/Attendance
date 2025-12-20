const mysql = require('mysql2');

const dbConfig = {
    host: 'mysql.gb.stackcp.com',
    port: 40762,
    user: 'Attendance-095a',
    password: 'S@i85t@run',
    database: 'tvs_attendance-3133319d91'
};

const db = mysql.createConnection(dbConfig);

db.connect((err) => {
    if (err) {
        console.error('Connection failed:', err);
        return;
    }
    console.log('Connected to DB');

    const alterQuery1 = "ALTER TABLE users ADD COLUMN designation VARCHAR(100) DEFAULT 'Employee';";
    const alterQuery2 = "ALTER TABLE users ADD COLUMN profile_photo VARCHAR(255) DEFAULT NULL;";

    db.query(alterQuery1, (err, result) => {
        if (err) console.log('Column designation might already exist or error:', err.message);
        else console.log('Added designation column');

        db.query(alterQuery2, (err, result) => {
            if (err) console.log('Column profile_photo might already exist or error:', err.message);
            else console.log('Added profile_photo column');

            db.end();
        });
    });
});
