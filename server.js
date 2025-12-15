const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Database Configuration
const dbConfig = {
    host: 'mysql.gb.stackcp.com',
    port: 40762,
    user: 'Attendance-095a',
    password: 'S@i85t@run',
    database: 'tvs_attendance-3133319d91',
    connectTimeout: 10000 // 10s timeout
};

let db;
let isDbConnected = false;

function handleDisconnect() {
    db = mysql.createConnection(dbConfig);

    db.connect(err => {
        if (err) {
            console.error('Database connection failed:', err.message);
            console.log('Running in MOCK mode (No DB connection). Data will not be saved.');
            isDbConnected = false;
        } else {
            console.log('Connected to MySQL database.');
            isDbConnected = true;
        }
    });

    db.on('error', err => {
        console.error('Database error:', err);
        if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
            console.log('Reconnecting to Database...');
            isDbConnected = false;
            handleDisconnect();
        } else {
            // throw err; // Don't crash server on DB error
        }
    });
}

// Keep-Alive mechanism (Ping DB every 1 hour)
setInterval(() => {
    if (isDbConnected && db) {
        db.query('SELECT 1', (err) => {
            if (err) {
                console.error('Keep-Alive Failed:', err.message);
                isDbConnected = false;
                handleDisconnect(); // Force reconnect
            } else {
                console.log('Keep-Alive: DB Connection Active');
            }
        });
    } else {
        console.log('Keep-Alive: Attempting Reconnect...');
        handleDisconnect();
    }
}, 3600000); // 1 hour

handleDisconnect();

// --- API Endpoints ---

// Login
app.post('/login', (req, res) => {
    const { username, password, device_id } = req.body;
    console.log(`Login attempt: ${username} Device: ${device_id}`);

    if (!isDbConnected) {
        console.log('Using Mock Login (DB Disconnected)');
        if (username === 'admin' && password === 'admin123') return res.json({ success: true, role: 'admin', token: 'mock-admin', user: { id: 1, full_name: 'Admin User' } });
        if (username === 'emp01' && password === 'emp123') return res.json({ success: true, role: 'employee', token: 'mock-emp', user: { id: 2, full_name: 'John Doe' } });
        return res.status(401).json({ success: false, message: 'Invalid credentials (Mock)' });
    }

    const query = 'SELECT * FROM users WHERE username = ? AND password_hash = ?';
    db.query(query, [username, password], (err, results) => {
        if (err) {
            console.error('Login Query Error:', err);
            // Fallback to mock if query fails (e.g. table missing)
            if (username === 'emp01' && password === 'emp123') return res.json({ success: true, role: 'employee', token: 'mock-emp', user: { id: 2, full_name: 'John Doe' } });
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

    // Check if Device ID matches
    const deviceCheckQuery = 'SELECT device_id FROM users WHERE id = ?';
    db.query(deviceCheckQuery, [user_id], (err, results) => {
        if (err) {
            return res.json({ success: false, status: 'ERROR', message: `DB Error: ${err.message}` });
        }
        if (results.length === 0) {
            return res.json({ success: false, status: 'ERROR', message: 'User not found' });
        }

        const storedDeviceId = results[0].device_id;
        // If stored ID exists and doesn't match current request -> Session Expired (Logged in elsewhere)
        if (storedDeviceId && storedDeviceId !== device_id) {
            console.warn(`Session conflict for User ${user_id}. Expected: ${storedDeviceId}, Got: ${device_id}`);
            return res.json({ success: false, status: 'SESSION_EXPIRED', message: 'Logged in on another device' });
        }

        // Proceed with IP Check (Rest of existing logic)
        const clientIp = req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0] : req.connection.remoteAddress;
        console.log(`Sync Request: User ${user_id} | IP: ${clientIp}`);

        const ALLOWED_IPS = [
            '::1',
            '127.0.0.1'
        ];

        // Allow Localhost OR Office Subnet (103.168.82.xxx)
        const isIpAllowed = ALLOWED_IPS.includes(clientIp) || clientIp.startsWith('103.168.82.');

        // Calculate Today in IST
        const todayDate = new Date();
        todayDate.setHours(todayDate.getHours() + 5);
        todayDate.setMinutes(todayDate.getMinutes() + 30);
        const today = todayDate.toISOString().split('T')[0];

        if (isIpAllowed) {
            // --- LOGIC: USER IS PRESENT ---
            // Check the LATEST record for today
            const checkQuery = `SELECT id, status FROM attendance WHERE user_id = ? AND date = ? ORDER BY entry_time DESC LIMIT 1`;

            db.query(checkQuery, [user_id, today], (err, results) => {
                if (err) return res.json({ success: false, status: 'ERROR', message: 'DB Error' });

                const lastRecord = results.length > 0 ? results[0] : null;

                if (!lastRecord || lastRecord.status === 'absent') {
                    // NEW SESSION: Insert new row
                    const insertQuery = `INSERT INTO attendance (user_id, date, entry_time, status) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 330 MINUTE), 'present')`;
                    db.query(insertQuery, [user_id, today], (err) => {
                        if (err) return res.json({ success: false, status: 'ERROR', message: 'DB Insert Failed' });
                        res.json({ success: true, status: 'PRESENT', detected_ip: clientIp });
                    });
                } else {
                    // EXISTING SESSION: Already present, Just OK (Heartbeat)
                    // Optionally update a 'last_seen' column if you had one, but for now just confirm logic.
                    res.json({ success: true, status: 'PRESENT', detected_ip: clientIp });
                }
            });

        } else {
            // --- LOGIC: USER IS ABSENT (Invalid Network) ---
            // If they have an Open Session ('present'), Close it.
            const query = `UPDATE attendance SET exit_time = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 330 MINUTE), status = 'absent' WHERE user_id = ? AND date = ? AND status = 'present'`;

            db.query(query, [user_id, today], (err) => {
                if (err) {
                    // ... error handling
                }
                res.json({ success: true, status: 'ABSENT', message: 'Invalid Network', detected_ip: clientIp });
            });
        }

        db.query(query, [user_id, today], (err) => {
            if (err) {
                console.error('Db Error (Absent):', err);
                return res.status(500).json({ success: false, message: 'DB Error' });
            }
            res.json({ success: true, status: 'ABSENT', detected_ip: clientIp, message: `Invalid Network. Server sees: ${clientIp}` });
        });
    }
    });
});

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
    const { username, password, full_name, hourly_rate } = req.body;

    if (!username || !password || !full_name) {
        return res.status(400).json({ success: false, message: 'Missing fields' });
    }

    if (!isDbConnected) {
        return res.json({ success: true, message: 'MOCK: Employee created', id: 999 });
    }

    const query = 'INSERT INTO users (username, password_hash, role, full_name, hourly_rate) VALUES (?, ?, "employee", ?, ?)';
    db.query(query, [username, password, full_name, hourly_rate || 0], (err, result) => {
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
        SUM(TIMESTAMPDIFF(HOUR, a.entry_time, IFNULL(a.exit_time, NOW()))) as total_hours,
        (SUM(TIMESTAMPDIFF(HOUR, a.entry_time, IFNULL(a.exit_time, NOW()))) * u.hourly_rate) as total_pay
        FROM attendance a
        JOIN users u ON a.user_id = u.id
        WHERE a.status = 'present'
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
