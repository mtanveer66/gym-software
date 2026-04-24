<?php
/**
 * Member Profile API (for member portal)
 */

require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../app/models/Member.php';
require_once __DIR__ . '/../app/models/Attendance.php';
require_once __DIR__ . '/../app/models/Payment.php';

// Release session lock immediately to prevent blocking
if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}

header('Content-Type: application/json');

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$memberCode = $_GET['code'] ?? '';
error_log("API Request: Action=$action, Code=$memberCode, ID=" . ($_GET['member_id'] ?? 'null'));


try {
    $database = new Database();
    $db = $database->getConnection();

    // For member lookup, we need to check both genders
    $memberMen = new Member($db, 'men');
    $memberWomen = new Member($db, 'women');
    
    $member = null;
    $gender = null;
    $memberId = $_GET['member_id'] ?? '';
    
    // Support lookup by CODE first (safest for gender detection)
    // 1. Support lookup by CODE/SEARCH TERM first (safest for gender detection)
    if (!empty($memberCode)) {
        // Try searching by member code first
        $member = $memberMen->getByCode($memberCode);
        $gender = 'men';
        
        if (!$member) {
            $member = $memberWomen->getByCode($memberCode);
            $gender = 'women';
        }
        
        // If not found by code, try searching by email, phone, or name
        if (!$member) {
            $searchTerm = $memberCode;
            // Search in men's table
            $searchQuery = "SELECT * FROM members_men WHERE 
                member_code LIKE :search OR 
                email LIKE :search OR 
                phone LIKE :search OR 
                name LIKE :search
                LIMIT 1";
            $searchStmt = $db->prepare($searchQuery);
            $searchParam = '%' . $searchTerm . '%';
            $searchStmt->bindValue(':search', $searchParam, PDO::PARAM_STR);
            $searchStmt->execute();
            $member = $searchStmt->fetch();
            $gender = 'men';
            
            // If not found in men's, try women's
            if (!$member) {
                $searchQuery = "SELECT * FROM members_women WHERE 
                    member_code LIKE :search OR 
                    email LIKE :search OR 
                    phone LIKE :search OR 
                    name LIKE :search
                    LIMIT 1";
                $searchStmt = $db->prepare($searchQuery);
                $searchStmt->bindValue(':search', $searchParam, PDO::PARAM_STR);
                $searchStmt->execute();
                $member = $searchStmt->fetch();
                $gender = 'women';
            }
        }
    } 
    // 2. Fallback to ID directly
    elseif (!empty($memberId)) {
        $memberMen = new Member($db, 'men');
        $member = $memberMen->getById($memberId);
        $gender = 'men';
        
        if (!$member) {
            $memberWomen = new Member($db, 'women');
            $member = $memberWomen->getById($memberId);
            $gender = 'women';
        }
    } 
    // 3. Fallback to Session
    elseif (isset($_SESSION['member_code'])) {
        // Use session data if available
        $gender = $_SESSION['member_gender'] ?? 'men';
        $memberModel = $gender === 'women' ? $memberWomen : $memberMen;
        $member = $memberModel->getByCode($_SESSION['member_code']);
    }

    if (!$member) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Member not found']);
        exit;
    }

    switch ($action) {
        case 'profile':
            echo json_encode([
                'success' => true,
                'data' => $member,
                'gender' => $gender
            ]);
            break;

        case 'attendance':
            $year = $_GET['year'] ?? date('Y');
            $month = $_GET['month'] ?? date('m');
            
            $attendance = new Attendance($db, $gender);
            $calendarData = $attendance->getCalendarData($member['id'], $year, $month);
            $attendanceList = $attendance->getByMemberId($member['id']);
            
            echo json_encode([
                'success' => true,
                'calendar' => $calendarData,
                'list' => $attendanceList
            ]);
            break;

        case 'payments':
            $payment = new Payment($db, $gender);
            $payments = $payment->getByMemberId($member['id']);
            
            echo json_encode([
                'success' => true,
                'data' => $payments
            ]);
            break;

        default:
            // Return full profile with all data
            $attendance = new Attendance($db, $gender);
            $payment = new Payment($db, $gender);
            
            $year = date('Y');
            $month = date('m');
            $calendarData = $attendance->getCalendarData($member['id'], $year, $month);
            $payments = $payment->getByMemberId($member['id']);
            
            // Check if member is a defaulter (hasn't paid in last 30 days)
            $oneMonthAgo = date('Y-m-d', strtotime('-1 month'));
            $defaulterQuery = "SELECT MAX(payment_date) as last_payment_date 
                              FROM payments_{$gender} 
                              WHERE member_id = :member_id";
            $defaulterStmt = $db->prepare($defaulterQuery);
            $defaulterStmt->bindValue(':member_id', $member['id'], PDO::PARAM_INT);
            $defaulterStmt->execute();
            $lastPayment = $defaulterStmt->fetch();
            $lastPaymentDate = $lastPayment['last_payment_date'] ?? $member['join_date'];
            $daysSincePayment = (strtotime(date('Y-m-d')) - strtotime($lastPaymentDate)) / (60 * 60 * 24);
            $isDefaulter = ($member['status'] === 'active' && $daysSincePayment >= 30);
            
            echo json_encode([
                'success' => true,
                'profile' => $member,
                'gender' => $gender,
                'is_defaulter' => $isDefaulter,
                'default_date' => $member['next_fee_due_date'] ?? null,
                'payments' => $payments,
                'attendance' => [
                    'calendar' => $calendarData,
                    'year' => $year,
                    'month' => $month
                ]
            ]);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Server error: ' . $e->getMessage()
    ]);
}

