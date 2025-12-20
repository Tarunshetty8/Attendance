const mysql = require('mysql2/promise');

const dbConfig = {
    host: 'mysql.gb.stackcp.com',
    port: 40762,
    user: 'Attendance-095a',
    password: 'S@i85t@run',
    database: 'tvs_attendance-3133319d91'
};

async function cleanupDuplicates() {
    const connection = await mysql.createConnection(dbConfig);
    try {
        console.log("Aggressive Duplicate Cleanup...");

        // Strategy: For any (user_id, date), if there are multiple 'present' or 'absent' rows starting within 2 minutes of each other, keep only the first one.

        const [rows] = await connection.execute(`
            SELECT id, user_id, date, entry_time 
            FROM attendance 
            ORDER BY user_id, date, entry_time ASC
        `);

        let toDelete = [];
        let previous = null;

        for (const row of rows) {
            if (previous &&
                previous.user_id === row.user_id &&
                previous.date.toISOString().split('T')[0] === row.date.toISOString().split('T')[0]) {

                const timeDiff = Math.abs(new Date(row.entry_time) - new Date(previous.entry_time)); // in ms
                // If within 90 seconds, treat as duplicate
                if (timeDiff < 90000) {
                    console.log(`Duplicate found: ID ${row.id} is duplicate of ${previous.id} (Diff: ${timeDiff}ms)`);
                    toDelete.push(row.id);
                    continue; // Skip updating 'previous' so we catch consecutive duplicates against the original
                }
            }
            previous = row;
        }

        if (toDelete.length > 0) {
            console.log(`Deleting ${toDelete.length} duplicate records...`);
            const placeholders = toDelete.map(() => '?').join(',');
            await connection.execute(`DELETE FROM attendance WHERE id IN (${placeholders})`, toDelete);
            console.log("Deletion Complete.");
        } else {
            console.log("No duplicates found to clean.");
        }

    } catch (e) {
        console.error("Error:", e);
    } finally {
        await connection.end();
    }
}

cleanupDuplicates();
