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
        console.log("--- Setup ---");
        // Create Office User
        await connection.execute(`INSERT INTO users (username, password_hash, role, designation, full_name, device_id) VALUES ('office_recheck', 'test', 'employee', 'Office', 'Office Recheck', 'dev_off') ON DUPLICATE KEY UPDATE designation='Office', device_id='dev_off'`);
        const [offU] = await connection.execute("SELECT id FROM users WHERE username='office_recheck'");
        const offId = offU[0].id;

        // Create Emp User
        await connection.execute(`INSERT INTO users (username, password_hash, role, designation, full_name, device_id) VALUES ('emp_recheck', 'test', 'employee', 'Employee', 'Emp Recheck', 'dev_emp') ON DUPLICATE KEY UPDATE designation='Employee', device_id='dev_emp'`);
        const [empU] = await connection.execute("SELECT id FROM users WHERE username='emp_recheck'");
        const empId = empU[0].id;

        // Reset Settings
        await connection.execute("UPDATE settings SET setting_value='0.0.0.0' WHERE setting_key='office_ip'");

        // 1. Office Sync (Updates IP)
        console.log("1. Office Sync (1.1.1.1)...");
        await postRequest('/attendance/sync', { user_id: offId, device_id: 'dev_off' }, { 'X-Forwarded-For': '1.1.1.1' });

        const [sets] = await connection.execute("SELECT setting_value FROM settings WHERE setting_key='office_ip'");
        console.log("   New IP:", sets[0].setting_value);
        if (sets[0].setting_value !== '1.1.1.1') throw new Error("Failed to update IP");

        // 2. Emp Sync Fail
        console.log("2. Emp Sync (2.2.2.2)...");
        const resFail = await postRequest('/attendance/sync', { user_id: empId, device_id: 'dev_emp' }, { 'X-Forwarded-For': '2.2.2.2' });
        console.log("   Status:", resFail.status);
        if (resFail.status !== 'ABSENT') throw new Error("Emp should be ABSENT");

        // 3. Emp Sync Success
        console.log("3. Emp Sync (1.1.1.1)...");
        const resPass = await postRequest('/attendance/sync', { user_id: empId, device_id: 'dev_emp' }, { 'X-Forwarded-For': '1.1.1.1' });
        console.log("   Status:", resPass.status);
        if (resPass.status !== 'PRESENT') throw new Error("Emp should be PRESENT");

        console.log("SUCCESS");

        // Cleanup
        await connection.execute("DELETE FROM attendance WHERE user_id IN (?, ?)", [offId, empId]);
        await connection.execute("DELETE FROM users WHERE id IN (?, ?)", [offId, empId]);

    } catch (e) {
        console.error("FAIL", e);
    } finally {
        if (connection) await connection.end();
    }
}
runTest();
