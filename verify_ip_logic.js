const http = require('http');
const mysql = require('mysql2/promise');

const dbConfig = {
    host: 'mysql.gb.stackcp.com',
    port: 40762,
    user: 'Attendance-095a',
    password: 'S@i85t@run',
    database: 'tvs_attendance-3133319d91'
};

function postRequest(path, data, headers = {}) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...headers
            }
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (e) {
                    resolve(body);
                }
            });
        });

        req.on('error', (e) => reject(e));
        req.write(JSON.stringify(data));
        req.end();
    });
}

async function runTest() {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        console.log("--- 1. Setup: Creating Office User ---");
        await connection.execute(
            `INSERT INTO users (username, password_hash, role, designation, full_name) 
             VALUES ('office_test', 'test', 'employee', 'Office', 'Office User') 
             ON DUPLICATE KEY UPDATE designation='Office'`
        );

        const [users] = await connection.execute("SELECT id FROM users WHERE username = 'office_test'");
        const officeUserId = users[0].id;

        const [empUsers] = await connection.execute("SELECT id FROM users WHERE username = 'emp01'");
        const empUserId = empUsers[0].id;

        console.log(`Office User ID: ${officeUserId}, Emp User ID: ${empUserId}`);

        // --- TEST 1: Office User Syncs (Updates IP) ---
        console.log("\n--- TEST 1: Office User Syncs (IP: 100.100.100.100) ---");
        const res1 = await postRequest('/attendance/sync', {
            user_id: officeUserId,
            device_id: 'device_office'
        }, { 'X-Forwarded-For': '100.100.100.100' });
        console.log("Response:", res1);

        // Verify DB Setting
        const [settings] = await connection.execute("SELECT setting_value FROM settings WHERE setting_key = 'office_ip'");
        console.log("DB Office IP:", settings[0].setting_value);
        if (settings[0].setting_value !== '100.100.100.100') throw new Error("Office IP not updated!");

        // --- TEST 2: Employee Syncs (Wrong IP) ---
        console.log("\n--- TEST 2: Employee Syncs (IP: 200.200.200.200) ---");
        const res2 = await postRequest('/attendance/sync', {
            user_id: empUserId,
            device_id: 'device_emp'
        }, { 'X-Forwarded-For': '200.200.200.200' });
        console.log("Response:", res2);
        if (res2.status !== 'ABSENT') throw new Error("Employee should be ABSENT on wrong IP");

        // --- TEST 3: Employee Syncs (Correct IP) ---
        console.log("\n--- TEST 3: Employee Syncs (IP: 100.100.100.100) ---");
        const res3 = await postRequest('/attendance/sync', {
            user_id: empUserId,
            device_id: 'device_emp'
        }, { 'X-Forwarded-For': '100.100.100.100' });
        console.log("Response:", res3);
        if (res3.status !== 'PRESENT') throw new Error("Employee should be PRESENT on correct IP");

        console.log("\nSUCCESS! All tests passed.");

        // Cleanup
        console.log("Cleaning up...");
        await connection.execute("DELETE FROM attendance WHERE user_id = ?", [officeUserId]);
        await connection.execute("DELETE FROM users WHERE id = ?", [officeUserId]);

    } catch (e) {
        console.error("TEST FAILED:", e.message);
    } finally {
        if (connection) await connection.end();
    }
}

runTest();
