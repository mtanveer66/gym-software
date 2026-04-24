<?php
/**
 * Auto-Deactivate Members API
 * Deactivates members who haven't attended for more than 2 months
 */

require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../app/models/Member.php';

header('Content-Type: application/json');

// Check authentication
if (!isset($_SESSION['role']) || $_SESSION['role'] !== 'admin') {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Unauthorized']);
    exit;
}

try {
    $database = new Database();
    $db = $database->getConnection();
    
    $deactivated = 0;
    $errors = [];
    
    // Process both men and women
    foreach (['men', 'women'] as $gender) {
        $member = new Member($db, $gender);
        $memberTable = 'members_' . $gender;
        $attendanceTable = 'attendance_' . $gender;
        
        // Get all active members
        $query = "SELECT * FROM {$memberTable} WHERE status = 'active'";
        $stmt = $db->prepare($query);
        $stmt->execute();
        $members = $stmt->fetchAll();
        
        foreach ($members as $memberData) {
            try {
                // Find last attendance date for this member
                $attendanceQuery = "SELECT MAX(check_in) as last_attendance 
                                    FROM {$attendanceTable} 
                                    WHERE member_id = :member_id";
                $attendanceStmt = $db->prepare($attendanceQuery);
                $attendanceStmt->bindValue(':member_id', $memberData['id'], PDO::PARAM_INT);
                $attendanceStmt->execute();
                $lastAttendance = $attendanceStmt->fetch();

                // Use join date if no attendance was ever recorded
                $referenceDate = $lastAttendance['last_attendance'] ?? $memberData['join_date'];
                $referenceDateTime = new DateTime($referenceDate);
                $currentDateTime = new DateTime();

                // Calculate total days since last attendance
                $daysSinceAttendance = $referenceDateTime->diff($currentDateTime)->days;

                // More than 2 months (~60 days) without attendance => deactivate
                if ($daysSinceAttendance > 60) {
                    $updateQuery = "UPDATE {$memberTable} SET status = 'inactive' WHERE id = :id";
                    $updateStmt = $db->prepare($updateQuery);
                    $updateStmt->bindValue(':id', $memberData['id'], PDO::PARAM_INT);
                    $updateStmt->execute();
                    $deactivated++;
                }
            } catch (Exception $e) {
                $errors[] = "Error processing member {$memberData['member_code']}: " . $e->getMessage();
            }
        }
    }
    
    echo json_encode([
        'success' => true,
        'deactivated' => $deactivated,
        'errors' => $errors,
        'message' => "Auto-deactivation completed. {$deactivated} members deactivated."
    ]);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Error: ' . $e->getMessage()
    ]);
}

