<?php
/**
 * Get Due Fees API - Get all members with due fees
 */

// Start output buffering to prevent any accidental output
ob_start();

require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../app/models/Member.php';

// Clear any output that might have been generated
ob_clean();

header('Content-Type: application/json');

// Check authentication
if (!isset($_SESSION['role']) || $_SESSION['role'] !== 'admin') {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Unauthorized']);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

try {
    $gender = $_GET['gender'] ?? 'all'; // 'men', 'women', or 'all'
    $search = $_GET['search'] ?? '';
    $page = intval($_GET['page'] ?? 1);
    $limit = intval($_GET['limit'] ?? 50);
    $offset = ($page - 1) * $limit;
    
    $database = new Database();
    $db = $database->getConnection();
    
    // Check if column exists
    $checkColumnQuery = "SELECT COUNT(*) as col_count FROM INFORMATION_SCHEMA.COLUMNS 
                        WHERE TABLE_SCHEMA = DATABASE() 
                        AND TABLE_NAME = 'members_men' 
                        AND COLUMN_NAME = 'total_due_amount'";
    $checkStmt = $db->prepare($checkColumnQuery);
    $checkStmt->execute();
    $columnExists = $checkStmt->fetch()['col_count'] > 0;
    
    if (!$columnExists) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'message' => 'Database column "total_due_amount" does not exist. Please run the migration script: database/add_due_amount_simple.sql in phpMyAdmin first.',
            'error_code' => 'MISSING_COLUMN',
            'data' => [],
            'pagination' => ['page' => 1, 'limit' => $limit, 'total' => 0, 'total_pages' => 0],
            'summary' => ['total_members_with_due' => 0, 'total_due_amount' => 0]
        ]);
        exit;
    }
    
    $allDueFees = [];
    
    // Get due fees from men
    if ($gender === 'all' || $gender === 'men') {
        // FILTER: Only Active Members
        $whereClause = "WHERE total_due_amount > 0 AND status = 'active'";
        if (!empty($search)) {
            $whereClause .= " AND (member_code LIKE :search OR name LIKE :search OR phone LIKE :search)";
        }
        
        $query = "SELECT *, 'men' as gender FROM members_men {$whereClause} ORDER BY total_due_amount DESC, next_fee_due_date ASC, created_at DESC LIMIT :limit OFFSET :offset";
        $stmt = $db->prepare($query);
        
        if (!empty($search)) {
            $searchParam = '%' . $search . '%';
            $stmt->bindValue(':search', $searchParam, PDO::PARAM_STR);
        }
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $menDueFees = $stmt->fetchAll();
        
        $allDueFees = array_merge($allDueFees, $menDueFees);
    }
    
    // Get due fees from women
    if ($gender === 'all' || $gender === 'women') {
        // FILTER: Only Active Members
        $whereClause = "WHERE total_due_amount > 0 AND status = 'active'";
        if (!empty($search)) {
            $whereClause .= " AND (member_code LIKE :search OR name LIKE :search OR phone LIKE :search)";
        }
        
        $query = "SELECT *, 'women' as gender FROM members_women {$whereClause} ORDER BY total_due_amount DESC, next_fee_due_date ASC, created_at DESC LIMIT :limit OFFSET :offset";
        $stmt = $db->prepare($query);
        
        if (!empty($search)) {
            $searchParam = '%' . $search . '%';
            $stmt->bindValue(':search', $searchParam, PDO::PARAM_STR);
        }
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $womenDueFees = $stmt->fetchAll();
        
        $allDueFees = array_merge($allDueFees, $womenDueFees);
    }
    
    // Sort by due amount descending
    usort($allDueFees, function($a, $b) {
        return floatval($b['total_due_amount']) <=> floatval($a['total_due_amount']);
    });
    
    // Get total count
    $countQueryMen = "SELECT COUNT(*) as total FROM members_men WHERE total_due_amount > 0 AND status = 'active'";
    $countQueryWomen = "SELECT COUNT(*) as total FROM members_women WHERE total_due_amount > 0 AND status = 'active'";
    
    $totalMen = 0;
    $totalWomen = 0;
    
    if ($gender === 'all' || $gender === 'men') {
        $countStmt = $db->prepare($countQueryMen);
        $countStmt->execute();
        $totalMen = $countStmt->fetch()['total'];
    }
    
    if ($gender === 'all' || $gender === 'women') {
        $countStmt = $db->prepare($countQueryWomen);
        $countStmt->execute();
        $totalWomen = $countStmt->fetch()['total'];
    }
    
    $total = $totalMen + $totalWomen;
    
    // Calculate total due amount
    $totalDueAmount = 0;
    foreach ($allDueFees as $member) {
        $totalDueAmount += floatval($member['total_due_amount']);
    }
    
    echo json_encode([
        'success' => true,
        'data' => $allDueFees,
        'pagination' => [
            'page' => $page,
            'limit' => $limit,
            'total' => $total,
            'total_pages' => ceil($total / $limit)
        ],
        'summary' => [
            'total_members_with_due' => $total,
            'total_due_amount' => $totalDueAmount
        ]
    ]);
    
} catch (Exception $e) {
    // Clear any output that might have been generated
    ob_clean();
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Server error: ' . $e->getMessage()
    ]);
} catch (Error $e) {
    // Handle fatal errors (PHP 7+)
    ob_clean();
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Fatal error: ' . $e->getMessage()
    ]);
}
