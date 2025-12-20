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
        console.log("Cleaning up duplicate logs...");

        // Logic: Keep the earliest entry_time for a given (user_id, date, 'present').
        // Delete rows where (user_id, date) matches but entry_time > min_entry_time

        // Since MySQL doesn't natively support easy DELETE with join on same table in one go smoothly sometimes,
        // we'll do it in two steps.

        // 1. Find duplicates
        const [rows] = await connection.execute(`
            SELECT t1.id 
            FROM attendance t1
            JOIN attendance t2 
            ON t1.user_id = t2.user_id 
            AND t1.date = t2.date 
            AND t1.entry_time > t2.entry_time 
            AND t1.status = 'present' 
            AND t2.status = 'present'
        `);

        if (rows.length === 0) {
            console.log("No duplicates found.");
            return;
        }

        const idsToDelete = rows.map(r => r.id);
        console.log(`Found ${idsToDelete.length} duplicates. Deleting...`);

        // Batch delete
        const idList = idsToDelete.join(',');
        await connection.execute(`DELETE FROM attendance WHERE id IN (${idList})`);

        console.log("Cleanup complete.");

    } catch (e) {
        console.error("Error:", e);
    } finally {
        await connection.end();
    }
}

cleanupDuplicates();
