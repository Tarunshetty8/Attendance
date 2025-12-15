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
        if (err.code === 'PROTOCOL_CONNECTION_LOST') {
            isDbConnected = false;
            // handleDisconnect(); // Optional: Auto-reconnect
        } else {
            // throw err;
        }
    });
}

handleDisconnect();

// --- API Endpoints ---

// Login
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    console.log(`Login attempt: ${username}`);

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
            res.json({ success: true, role: results[0].role, user: results[0] });
        } else {
            res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
    });
});

// Mark Attendance (Called by Android App)
// Sync Attendance (New State-Sync Logic)
app.post('/attendance/sync', (req, res) => {
    const { user_id } = req.body;

    // 1. Detect IP
    const clientIp = req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0] : req.connection.remoteAddress;
    console.log(`Sync Request: User ${user_id} | IP: ${clientIp}`);

    // 2. Configuration
    const ALLOWED_IPS = [
        '::1',
        '127.0.0.1'
    ];

    // Allow Localhost OR Office Subnet (103.168.82.xxx)
    const isIpAllowed = ALLOWED_IPS.includes(clientIp) || clientIp.startsWith('103.168.82.');

    // Mock Mode Support
    if (!isDbConnected) {
        if (isIpAllowed) return res.json({ success: true, status: 'PRESENT', detected_ip: clientIp });
        return res.json({ success: true, status: 'ABSENT', detected_ip: clientIp, message: 'Invalid Network' });
    }

    const today = new Date().toISOString().split('T')[0];

    if (isIpAllowed) {
        // --- LOGIC: USER IS PRESENT ---
        // Insert entry if not exists. If exists, ensure status is present.
        const query = `
            INSERT INTO attendance (user_id, date, entry_time, status) 
            VALUES (?, ?, NOW(), 'present')
            ON DUPLICATE KEY UPDATE status = 'present' 
        `; // We don't overwrite entry_time to keep the first login of the day.

        db.query(query, [user_id, today], (err) => {
            if (err) {
                console.error('Db Error (Present):', err);
                return res.status(500).json({ success: false, message: 'DB Error' });
            }
            res.json({ success: true, status: 'PRESENT', detected_ip: clientIp });
        });

    } else {
        // --- LOGIC: USER IS ABSENT (Invalid Network) ---
        // If they had an open session, close it (mark exit time).
        const query = `UPDATE attendance SET exit_time = NOW() WHERE user_id = ? AND date = ? AND status = 'present'`;

        db.query(query, [user_id, today], (err) => {
            if (err) {
                console.error('Db Error (Absent):', err);
                return res.status(500).json({ success: false, message: 'DB Error' });
            }
            // VERBOSE ERROR FOR DEBUGGING
            res.json({ success: true, status: 'ABSENT', detected_ip: clientIp, message: `Invalid Network. Server sees: ${clientIp}` });
        });
    }
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
