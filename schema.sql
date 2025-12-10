CREATE DATABASE IF NOT EXISTS attendance_db;
USE attendance_db;

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin', 'employee') NOT NULL DEFAULT 'employee',
    full_name VARCHAR(100),
    hourly_rate DECIMAL(10, 2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS attendance (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    date DATE NOT NULL,
    entry_time DATETIME,
    exit_time DATETIME,
    status ENUM('present', 'absent') DEFAULT 'absent',
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS wifi_config (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ssid VARCHAR(100) NOT NULL,
    bssid VARCHAR(100) NOT NULL, -- Public WiFi Address (MAC)
    description VARCHAR(100)
);

-- Seed Admin User (password: admin123)
-- In a real app, use hashed passwords (e.g., bcrypt)
INSERT INTO users (username, password_hash, role, full_name, hourly_rate) VALUES 
('admin', 'admin123', 'admin', 'System Admin', 0.00),
('emp01', 'emp123', 'employee', 'John Doe', 25.00);

-- Seed WiFi Config
INSERT INTO wifi_config (ssid, bssid, description) VALUES 
('OfficeWifi', '00:11:22:33:44:55', 'Main Office WiFi');
