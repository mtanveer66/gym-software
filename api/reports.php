<?php
/**
 * Reports API
 */

require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../app/models/Member.php';
require_once __DIR__ . '/../app/models/Payment.php';

header('Content-Type: application/json');

// Check authentication
if (!isset($_SESSION['role']) || $_SESSION['role'] !== 'admin') {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Unauthorized']);
    exit;
}

$action = $_GET['action'] ?? '';

try {
    $database = new Database();
    $db = $database->getConnection();

    switch ($action) {
        case 'members':
            $memberMen = new Member($db, 'men');
            $memberWomen = new Member($db, 'women');
            
            $statsMen = $memberMen->getStats();
            $statsWomen = $memberWomen->getStats();
            
            echo json_encode([
                'success' => true,
                'data' => [
                    'men' => $statsMen,
                    'women' => $statsWomen
                ]
            ]);
            break;
            
        case 'defaulters':
            // Get defaulters from both genders
            // Defaulters are: members with overdue due date OR members with outstanding dues
            $today = date('Y-m-d');
            
            // Men defaulters - include those with overdue date OR outstanding dues
            $queryMen = "SELECT * FROM members_men 
                        WHERE status = 'active'
                        AND (
                            (next_fee_due_date IS NOT NULL AND next_fee_due_date < :today1)
                            OR (total_due_amount IS NOT NULL AND total_due_amount > 0)
                        )
                        ORDER BY 
                            CASE 
                                WHEN next_fee_due_date < :today2 THEN 0 
                                ELSE 1 
                            END,
                            next_fee_due_date ASC,
                            total_due_amount DESC";
            $stmtMen = $db->prepare($queryMen);
            $stmtMen->bindValue(':today1', $today, PDO::PARAM_STR);
            $stmtMen->bindValue(':today2', $today, PDO::PARAM_STR);
            $stmtMen->execute();
            $defaultersMen = $stmtMen->fetchAll();
            
            // Women defaulters - include those with overdue date OR outstanding dues
            $queryWomen = "SELECT * FROM members_women 
                          WHERE status = 'active'
                          AND (
                              (next_fee_due_date IS NOT NULL AND next_fee_due_date < :today1)
                              OR (total_due_amount IS NOT NULL AND total_due_amount > 0)
                          )
                          ORDER BY 
                              CASE 
                                  WHEN next_fee_due_date < :today2 THEN 0 
                                  ELSE 1 
                              END,
                              next_fee_due_date ASC,
                              total_due_amount DESC";
            $stmtWomen = $db->prepare($queryWomen);
            $stmtWomen->bindValue(':today1', $today, PDO::PARAM_STR);
            $stmtWomen->bindValue(':today2', $today, PDO::PARAM_STR);
            $stmtWomen->execute();
            $defaultersWomen = $stmtWomen->fetchAll();
            
            // Combine and sort
            $allDefaulters = array_merge($defaultersMen, $defaultersWomen);
            usort($allDefaulters, function($a, $b) {
                // First sort by overdue status
                $aOverdue = ($a['next_fee_due_date'] && strtotime($a['next_fee_due_date']) < time()) ? 0 : 1;
                $bOverdue = ($b['next_fee_due_date'] && strtotime($b['next_fee_due_date']) < time()) ? 0 : 1;
                if ($aOverdue !== $bOverdue) {
                    return $aOverdue - $bOverdue;
                }
                // Then by due date
                if ($a['next_fee_due_date'] && $b['next_fee_due_date']) {
                    $dateDiff = strtotime($a['next_fee_due_date']) - strtotime($b['next_fee_due_date']);
                    if ($dateDiff !== 0) return $dateDiff;
                }
                // Finally by due amount (highest first)
                $aDue = floatval($a['total_due_amount'] ?? 0);
                $bDue = floatval($b['total_due_amount'] ?? 0);
                return $bDue <=> $aDue;
            });
            
            echo json_encode([
                'success' => true,
                'data' => [
                    'defaulters' => $allDefaulters,
                    'total_count' => count($allDefaulters),
                    'overdue_count' => count(array_filter($allDefaulters, function($m) use ($today) {
                        return $m['next_fee_due_date'] && strtotime($m['next_fee_due_date']) < strtotime($today);
                    })),
                    'outstanding_dues_count' => count(array_filter($allDefaulters, function($m) {
                        return floatval($m['total_due_amount'] ?? 0) > 0;
                    }))
                ]
            ]);
            break;
            
        case 'payments':
            // Get payment statistics from both genders
            $query = "SELECT 
                        COUNT(*) as total_payments,
                        SUM(amount) as total_revenue,
                        AVG(amount) as avg_payment
                     FROM (
                         SELECT amount FROM payments_men WHERE status = 'completed'
                         UNION ALL
                         SELECT amount FROM payments_women WHERE status = 'completed'
                     ) as all_payments";
            $stmt = $db->prepare($query);
            $stmt->execute();
            $stats = $stmt->fetch();
            
            echo json_encode([
                'success' => true,
                'data' => $stats
            ]);
            break;
            
        case 'attendance':
            // Get attendance statistics
            $today = date('Y-m-d');
            
            // Today's attendance
            $queryToday = "SELECT COUNT(*) as today_count FROM (
                SELECT id FROM attendance_men WHERE DATE(check_in) = :today
                UNION ALL
                SELECT id FROM attendance_women WHERE DATE(check_in) = :today
            ) as today_attendance";
            $stmtToday = $db->prepare($queryToday);
            $stmtToday->bindValue(':today', $today, PDO::PARAM_STR);
            $stmtToday->execute();
            $todayStats = $stmtToday->fetch();
            
            // This month's attendance
            $monthStart = date('Y-m-01');
            $queryMonth = "SELECT COUNT(*) as month_count FROM (
                SELECT id FROM attendance_men WHERE DATE(check_in) >= :month_start
                UNION ALL
                SELECT id FROM attendance_women WHERE DATE(check_in) >= :month_start
            ) as month_attendance";
            $stmtMonth = $db->prepare($queryMonth);
            $stmtMonth->bindValue(':month_start', $monthStart, PDO::PARAM_STR);
            $stmtMonth->execute();
            $monthStats = $stmtMonth->fetch();
            
            echo json_encode([
                'success' => true,
                'data' => [
                    'today' => $todayStats['today_count'],
                    'this_month' => $monthStats['month_count']
                ]
            ]);
            break;
            
        default:
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'Invalid report type']);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Server error: ' . $e->getMessage()
    ]);
}

