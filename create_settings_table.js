const mysql = require('mysql2');

const dbConfig = {
    host: 'mysql.gb.stackcp.com',
    port: 40762,
    user: 'Attendance-095a',
    password: 'S@i85t@run',
    database: 'tvs_attendance-3133319d91'
};

const connection = mysql.createConnection(dbConfig);

const createTableQuery = `
CREATE TABLE IF NOT EXISTS settings (
    setting_key VARCHAR(50) PRIMARY KEY,
    setting_value VARCHAR(255)
);
`;

const seedQuery = `
INSERT IGNORE INTO settings (setting_key, setting_value) VALUES ('office_ip', '0.0.0.0');
`;

connection.connect((err) => {
    if (err) {
        console.error('Error connecting to DB:', err);
        return;
    }
    console.log('Connected to DB');

    connection.query(createTableQuery, (err) => {
        if (err) {
            console.error('Error creating table:', err);
            process.exit(1);
        }
        console.log('Settings table created or already exists.');

        connection.query(seedQuery, (err) => {
            if (err) {
                console.error('Error seeding data:', err);
                process.exit(1);
            }
            console.log('Settings seeded.');
            connection.end();
        });
    });
});
