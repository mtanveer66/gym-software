<?php
/**
 * Auto-Archive Inactive Members Script
 * 
 * Logic:
 * 1. Find ACTIVE members who haven't paid in > 60 days.
 * 2. Logic: DATEDIFF(NOW(), COALESCE(MAX(payment_date), join_date)) > 60
 * 3. Update their status to 'inactive'.
 * 
 * Run this via cron or manually.
 */

require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../config/database.php';

header('Content-Type: text/html');

echo "<h1>Auto-Archive Inactive Members</h1>";

try {
    $database = new Database();
    $db = $database->getConnection();
    
    $tables = ['men', 'women']; // Genders
    
    echo "<p>Criteria: Active members with no payment (or join date) for more than <b>60 days</b>.</p>";
    
    foreach ($tables as $gender) {
        $memberTable = "members_{$gender}";
        $paymentTable = "payments_{$gender}";
        
        echo "<h3>Checking $gender...</h3>";
        
        // Find overdue active members using DATEDIFF logic
        $query = "SELECT m.id, m.name, m.member_code, m.join_date, 
                         MAX(p.payment_date) as last_payment_date,
                         DATEDIFF(CURDATE(), COALESCE(MAX(p.payment_date), m.join_date)) as days_inactive
                  FROM {$memberTable} m
                  LEFT JOIN {$paymentTable} p ON m.id = p.member_id
                  WHERE m.status = 'active'
                  GROUP BY m.id
                  HAVING days_inactive > 60";
        
        $stmt = $db->prepare($query);
        $stmt->execute();
        $members = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        if (count($members) > 0) {
            echo "<p>Found <b>" . count($members) . "</b> inactive members.</p>";
            echo "<ul>";
            
            $count = 0;
            foreach ($members as $m) {
                // Update status to inactive
                $updateQuery = "UPDATE {$memberTable} SET status = 'inactive' WHERE id = :id";
                $updateStmt = $db->prepare($updateQuery);
                $updateStmt->bindValue(':id', $m['id'], PDO::PARAM_INT);
                
                if ($updateStmt->execute()) {
                    $lastDate = $m['last_payment_date'] ? "Last Payment: " . $m['last_payment_date'] : "Joined: " . $m['join_date'];
                    echo "<li>Archived: <b>{$m['name']}</b> ({$m['member_code']}) - {$lastDate} ({$m['days_inactive']} days inactive)</li>";
                    $count++;
                } else {
                    echo "<li style='color:red'>Failed to archive: {$m['name']}</li>";
                }
                
                // Flush output buffer to show progress in real-time if huge list
                if ($count % 50 == 0) {
                    flush();
                    ob_flush();
                }
            }
            echo "</ul>";
            echo "<p style='color:green'>Total $count members moved to Inactive.</p>";
        } else {
            echo "<p>No members found matching criteria.</p>";
        }
    }
    
    echo "<hr><p>✅ Process Completed.</p>";
    echo "<a href='../admin-dashboard.html'>Return to Dashboard</a>";

} catch (Exception $e) {
    echo "<h2 style='color:red'>Error: " . $e->getMessage() . "</h2>";
}
