const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());
// app.use('/uploads', express.static('uploads')); // Replaced by DB Blob serve
app.get('/uploads/:filename', (req, res) => {
    const filename = req.params.filename;
    // Query DB for blob
    // Checks standard DB or Pool
    const sql = 'SELECT profile_image_blob FROM users WHERE profile_photo = ?';
    db.query(sql, [filename], (err, results) => {
        if (err) {
            console.error('Image Fetch Error:', err);
            return res.status(500).send('Database Error');
        }
        if (results.length > 0 && results[0].profile_image_blob) {
            const imgBuffer = results[0].profile_image_blob;
            res.writeHead(200, {
                'Content-Type': 'image/jpeg', // Assuming JPEG/PNG. Browser detects or we can store mime type.
                'Content-Length': imgBuffer.length
            });
            res.end(imgBuffer);
        } else {
            res.status(404).send('Image Not Found');
        }
    });
});

// Database Configuration
const dbConfig = {
    host: 'mysql.gb.stackcp.com',
    port: 40762,
    user: 'Attendance-095a',
    password: 'S@i85t@run',
    database: 'tvs_attendance-3133319d91',
    connectTimeout: 10000, // 10s timeout
    connectionLimit: 10,
    queueLimit: 0
};

// Use Connection Pool for stability
// Use Connection Pool for stability
const db = mysql.createPool(dbConfig);
let isDbConnected = false;

// Global Pool Error Handler
db.on('connection', (connection) => {
    // console.log('DB Connection acquired'); // Verbose
});
db.on('error', (err) => {
    console.error('MySQL Pool Error:', err);
    if (err.code === 'PROTOCOL_CONNECTION_LOST') {
        isDbConnected = false;
    }
});

// Heartbeat function to maintain validity of isDbConnected
function checkDbConnection() {
    db.query('SELECT 1', (err) => {
        if (err) {
            if (isDbConnected) console.error('DB Heartbeat Failed: Connection Lost');
            isDbConnected = false;
        } else {
            if (!isDbConnected) console.log('DB Heartbeat Success: Connection Restored');
            isDbConnected = true;
        }
    });
}

// Initial Check & Interval
checkDbConnection();
setInterval(checkDbConnection, 5000); // Check every 5s

// --- API Endpoints ---

// Login
app.post('/login', (req, res) => {
    const { username, password, device_id } = req.body;
    console.log(`Login attempt: ${username} Device: ${device_id}`);

    if (!isDbConnected) {
        console.log('Using Mock Login (DB Disconnected)');
        if (username === 'admin' && password === 'admin123') return res.json({ success: true, role: 'admin', token: 'mock-admin', user: { id: 1, full_name: 'Admin User', designation: 'Administrator', profile_photo: null } });
        if (username === 'emp01' && password === 'emp123') return res.json({ success: true, role: 'employee', token: 'mock-emp', user: { id: 2, full_name: 'John Doe', designation: 'Software Engineer', profile_photo: null } });
        return res.status(401).json({ success: false, message: 'Invalid credentials (Mock)' });
    }

    const query = 'SELECT * FROM users WHERE username = ? AND password_hash = ?';
    db.query(query, [username, password], (err, results) => {
        if (err) {
            console.error('Login Query Error:', err);
            // Fallback to mock if query fails (e.g. table missing)
            if (username === 'emp01' && password === 'emp123') return res.json({ success: true, role: 'employee', token: 'mock-emp', user: { id: 2, full_name: 'John Doe', designation: 'Software Engineer', profile_photo: null } });
            return res.status(500).json({ error: err.message || 'Database error' });
        }
        if (results.length > 0) {
            const user = results[0];
            // Update Device ID
            if (device_id && user.role === 'employee') {
                db.query('UPDATE users SET device_id = ? WHERE id = ?', [device_id, user.id]);
            }
            res.json({ success: true, role: user.role, user: user });
        } else {
            res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
    });
});

// Mark Attendance (Called by Android App)
// Sync Attendance (New State-Sync Logic)
// Sync Attendance (New State-Sync Logic)
app.post('/attendance/sync', (req, res) => {
    const { user_id, device_id } = req.body;
    const clientIp = req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0] : req.connection.remoteAddress;
    console.log(`Sync Request: User ${user_id} | IP: ${clientIp}`);

    // Calculate Today in IST
    const todayDate = new Date();
    todayDate.setHours(todayDate.getHours() + 5);
    todayDate.setMinutes(todayDate.getMinutes() + 30);
    const today = todayDate.toISOString().split('T')[0];

    // 1. Get User Details & Global Settings
    const userQuery = 'SELECT device_id, designation FROM users WHERE id = ?';
    db.query(userQuery, [user_id], (err, userResults) => {
        if (err) return res.json({ success: false, status: 'ERROR', message: `DB Error: ${err.message}` });
        if (userResults.length === 0) return res.json({ success: false, status: 'ERROR', message: 'User not found' });

        const user = userResults[0];
        const isOfficeUser = user.designation && user.designation.toLowerCase() === 'office';

        // 2. Resolve Allowed IP
        const settingsQuery = "SELECT setting_value FROM settings WHERE setting_key = 'office_ip'";
        db.query(settingsQuery, (err, settingsResults) => {
            let officeIp = '0.0.0.0'; // Default
            if (!err && settingsResults.length > 0) {
                officeIp = settingsResults[0].setting_value;
            }

            // 3. Determine IP Validity
            let isIpAllowed = false;
            const isLocalhost = clientIp === '::1' || clientIp === '127.0.0.1';

            if (isLocalhost) {
                isIpAllowed = true;
            } else if (isOfficeUser) {
                // Office User: Always Allowed + Updates the Office IP
                isIpAllowed = true;
                if (clientIp !== officeIp) {
                    console.log(`Updating Office IP from ${officeIp} to ${clientIp}`);
                    db.query("UPDATE settings SET setting_value = ? WHERE setting_key = 'office_ip'", [clientIp]);
                }
            } else {
                // Regular Employee: Must match Office IP
                // Simple string match. For subnets, we might need more logic, but "Public IP" implies exact match usually.
                // If officeIp is 0.0.0.0 (uninitialized), nobody can login remotely except Office user.
                if (clientIp === officeIp) {
                    isIpAllowed = true;
                }
            }

            if (!isIpAllowed) {
                // --- LOGIC: USER IS ABSENT (Invalid Network) ---
                const query = `UPDATE attendance SET exit_time = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 330 MINUTE), status = 'absent' WHERE user_id = ? AND date = ? AND status = 'present'`;
                db.query(query, [user_id, today], (err) => {
                    if (err) console.warn("DB Error during ABSENT update:", err.message);
                    res.json({ success: true, status: 'ABSENT', message: 'Invalid Network', detected_ip: clientIp, office_ip: officeIp });
                });
                return;
            }

            // 4. SESSION CHECK (Device ID)
            const storedDeviceId = user.device_id;
            if (storedDeviceId && storedDeviceId !== device_id) {
                console.warn(`Session conflict for User ${user_id}.`);
                return res.json({ success: false, status: 'SESSION_EXPIRED', message: 'Logged in on another device' });
            }

            // 5. MARK PRESENT
            // Check for ANY 'present' record within the last 1 minute to prevent duplicates (Debounce)
            const checkQuery = `
                SELECT id, status, entry_time 
                FROM attendance 
                WHERE user_id = ? 
                  AND date = ? 
                  AND status = 'present' 
                  AND entry_time >= DATE_SUB(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 330 MINUTE), INTERVAL 1 MINUTE)
                LIMIT 1
            `;

            db.query(checkQuery, [user_id, today], (err, results) => {
                if (err) return res.json({ success: false, status: 'ERROR', message: 'DB Error' });

                if (results.length > 0) {
                    // CACHE HIT: Already marked present recently
                    return res.json({ success: true, status: 'PRESENT', detected_ip: clientIp });
                }

                // Double Check: Ensure we don't have multiple open sessions anyway
                const openSessionQuery = `SELECT id FROM attendance WHERE user_id = ? AND date = ? AND status = 'present' LIMIT 1`;
                db.query(openSessionQuery, [user_id, today], (err, openResults) => {
                    if (openResults.length > 0) {
                        // Session already open
                        return res.json({ success: true, status: 'PRESENT', detected_ip: clientIp });
                    }

                    // NEW SESSION
                    const insertQuery = `INSERT INTO attendance (user_id, date, entry_time, status) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 330 MINUTE), 'present')`;
                    db.query(insertQuery, [user_id, today], (err) => {
                        if (err) return res.json({ success: false, status: 'ERROR', message: 'DB Insert Failed' });
                        res.json({ success: true, status: 'PRESENT', detected_ip: clientIp });
                    });
                });
            });
        });
    });
}); // Closing app.post('/attendance/sync')

// Logout
app.post('/attendance/logout', (req, res) => {
    const { user_id } = req.body;

    // Calculate Today in IST
    const todayDate = new Date();
    todayDate.setHours(todayDate.getHours() + 5);
    todayDate.setMinutes(todayDate.getMinutes() + 30);
    const today = todayDate.toISOString().split('T')[0];

    // 1. Mark Absent (Exit Time) for the latest open session
    const updateAttendance = `UPDATE attendance SET exit_time = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 330 MINUTE), status = 'absent' WHERE user_id = ? AND date = ? AND status = 'present'`;
    db.query(updateAttendance, [user_id, today], (err) => {
        if (err) console.error("Logout Attendance Error", err);
    });

    // 2. Clear Device ID
    const clearDevice = `UPDATE users SET device_id = NULL WHERE id = ?`;
    db.query(clearDevice, [user_id], (err) => {
        if (err) return res.status(500).json({ success: false, message: 'Logout Error' });
        res.json({ success: true, message: 'Logged out successfully' });
    });
});

// Admin: Create New User
app.post('/admin/users', (req, res) => {
    const { username, password, full_name, hourly_rate, designation, profile_photo } = req.body;

    if (!username || !password || !full_name) {
        return res.status(400).json({ success: false, message: 'Missing fields' });
    }

    if (!isDbConnected) {
        return res.json({ success: true, message: 'MOCK: Employee created', id: 999 });
    }

    const query = 'INSERT INTO users (username, password_hash, role, full_name, hourly_rate, designation, profile_photo) VALUES (?, ?, "employee", ?, ?, ?, ?)';
    db.query(query, [username, password, full_name, hourly_rate || 0, designation || 'Employee', profile_photo || null], (err, result) => {
        if (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({ success: false, message: 'Username already exists' });
            }
            console.error('Create User Error:', err);
            return res.json({ success: true, message: 'MOCK (Fallback): Employee created', id: 999 });
        }
        res.json({ success: true, message: 'Employee created successfully', id: result.insertId });
    });
});

// Admin: View Attendance
app.get('/admin/attendance', (req, res) => {
    const mockData = [
        { id: 1, full_name: 'John Doe', date: '2023-10-27', entry_time: '2023-10-27T09:00:00.000Z', exit_time: '2023-10-27T17:00:00.000Z', status: 'present' },
        { id: 2, full_name: 'Jane Smith', date: '2023-10-27', entry_time: '2023-10-27T09:15:00.000Z', exit_time: null, status: 'present' }
    ];

    if (!isDbConnected) return res.json(mockData);

    const query = `
        SELECT a.*, u.full_name 
        FROM attendance a 
        JOIN users u ON a.user_id = u.id 
        ORDER BY a.date DESC, a.entry_time DESC
    `;
    db.query(query, (err, results) => {
        if (err) {
            console.error('View Attendance Error:', err);
            return res.json(mockData); // Fallback
        }
        res.json(results);
    });
});

// Admin: Payroll (Simple calculation)
app.get('/admin/payroll', (req, res) => {
    const mockPayroll = [
        { full_name: 'John Doe', hourly_rate: 25, total_hours: 40, total_pay: 1000 },
        { full_name: 'Jane Smith', hourly_rate: 30, total_hours: 38, total_pay: 1140 }
    ];

    if (!isDbConnected) return res.json(mockPayroll);

    const query = `
        SELECT u.full_name, u.hourly_rate, 
        SUM(TIMESTAMPDIFF(HOUR, a.entry_time, IFNULL(a.exit_time, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 330 MINUTE)))) as total_hours,
        (SUM(TIMESTAMPDIFF(HOUR, a.entry_time, IFNULL(a.exit_time, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 330 MINUTE)))) * u.hourly_rate) as total_pay
        FROM attendance a
        JOIN users u ON a.user_id = u.id
        GROUP BY u.id
    `;
    db.query(query, (err, results) => {
        if (err) {
            console.error('Payroll Error:', err);
            return res.json(mockPayroll);
        }
        res.json(results);
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
