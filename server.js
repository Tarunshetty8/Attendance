const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Database Configuration
const db = mysql.createConnection({
    host: 'mysql.gb.stackcp.net', // Updated Hostname (Note: stackcp.com usually maps to stackcp.net for DBs, but using provided base)
    port: 40762,                   // Explicit Port
    user: 'Attendance-095a',
    password: 'S@i85t@run',
    database: 'tvs_attendance-3133319d91'
});

db.connect(err => {
    if (err) {
        console.error('Database connection failed:', err.stack);
        console.log('Running in MOCK mode (No DB connection). Data will not be saved.');
    } else {
        console.log('Connected to MySQL database.');
    }
});

// --- API Endpoints ---

// Login
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const query = 'SELECT * FROM users WHERE username = ? AND password_hash = ?';

    // Using Mock for demo if DB fails
    if (db.state === 'disconnected') {
        if (username === 'admin' && password === 'admin123') return res.json({ success: true, role: 'admin', token: 'mock-admin' });
        if (username === 'emp01' && password === 'emp123') return res.json({ success: true, role: 'employee', token: 'mock-emp' });
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    db.query(query, [username, password], (err, results) => {
        if (err) return res.status(500).json({ error: err });
        if (results.length > 0) {
            res.json({ success: true, role: results[0].role, user: results[0] });
        } else {
            res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
    });
});

// Mark Attendance (Called by Android App)
app.post('/attendance/mark', (req, res) => {
    const { user_id, wifi_bssid, event } = req.body; // event: 'connect' or 'disconnect'

    // First verify WiFi BSSID
    const checkWifi = 'SELECT * FROM wifi_config WHERE bssid = ?';

    const processAttendance = () => {
        const today = new Date().toISOString().split('T')[0];

        if (event === 'connect') {
            const query = `
                INSERT INTO attendance (user_id, date, entry_time, status) 
                VALUES (?, ?, NOW(), 'present')
                ON DUPLICATE KEY UPDATE entry_time = IF(entry_time IS NULL, NOW(), entry_time), status = 'present'
            `;
            if (db.state !== 'disconnected') {
                db.query(query, [user_id, today], (err) => {
                    if (err) return res.status(500).json({ error: err });
                    res.json({ success: true, message: 'Attendance marked: Present' });
                });
            } else {
                res.json({ success: true, message: 'MOCK: Attendance marked: Present' });
            }
        } else if (event === 'disconnect') {
            const query = `UPDATE attendance SET exit_time = NOW() WHERE user_id = ? AND date = ?`;
            if (db.state !== 'disconnected') {
                db.query(query, [user_id, today], (err) => {
                    if (err) return res.status(500).json({ error: err });
                    res.json({ success: true, message: 'Attendance updated: Exit time logged' });
                });
            } else {
                res.json({ success: true, message: 'MOCK: Attendance updated: Exit time logged' });
            }
        }
    };

    if (db.state !== 'disconnected') {
        db.query(checkWifi, [wifi_bssid], (err, results) => {
            if (err) return res.status(500).json({ error: err });
            if (results.length > 0) {
                processAttendance();
            } else {
                res.status(403).json({ success: false, message: 'Invalid Office WiFi' });
            }
        });
    } else {
        // Allow in mock mode
        processAttendance();
    }
});

// Admin: View Attendance
app.get('/admin/attendance', (req, res) => {
    const query = `
        SELECT a.*, u.full_name 
        FROM attendance a 
        JOIN users u ON a.user_id = u.id 
        ORDER BY a.date DESC, a.entry_time DESC
    `;
    if (db.state !== 'disconnected') {
        db.query(query, (err, results) => {
            if (err) return res.status(500).json({ error: err });
            res.json(results);
        });
    } else {
        res.json([
            { id: 1, full_name: 'John Doe', date: '2023-10-27', entry_time: '09:00:00', exit_time: '17:00:00', status: 'present' },
            { id: 2, full_name: 'Jane Smith', date: '2023-10-27', entry_time: '09:15:00', exit_time: null, status: 'present' }
        ]);
    }
});

// Admin: Payroll (Simple calculation)
app.get('/admin/payroll', (req, res) => {
    // Calculate hours worked * hourly_rate
    const query = `
        SELECT u.full_name, u.hourly_rate, 
        SUM(TIMESTAMPDIFF(HOUR, a.entry_time, IFNULL(a.exit_time, NOW()))) as total_hours,
        (SUM(TIMESTAMPDIFF(HOUR, a.entry_time, IFNULL(a.exit_time, NOW()))) * u.hourly_rate) as total_pay
        FROM attendance a
        JOIN users u ON a.user_id = u.id
        WHERE a.status = 'present'
        GROUP BY u.id
    `;
    if (db.state !== 'disconnected') {
        db.query(query, (err, results) => {
            if (err) return res.status(500).json({ error: err });
            res.json(results);
        });
    } else {
        res.json([
            { full_name: 'John Doe', hourly_rate: 25, total_hours: 40, total_pay: 1000 },
            { full_name: 'Jane Smith', hourly_rate: 30, total_hours: 38, total_pay: 1140 }
        ]);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});


app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

