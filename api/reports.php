<?php
/**
 * Reports API
 */

require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../app/models/Member.php';
require_once __DIR__ . '/../app/models/Attendance.php';

header('Content-Type: application/json');

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
            $opsMen = $memberMen->getOperationalSnapshot();
            $opsWomen = $memberWomen->getOperationalSnapshot();

            echo json_encode([
                'success' => true,
                'data' => [
                    'men' => $statsMen,
                    'women' => $statsWomen,
                    'operations' => [
                        'checked_in_now' => ($opsMen['checked_in_now'] ?? 0) + ($opsWomen['checked_in_now'] ?? 0),
                        'due_today' => ($opsMen['due_today'] ?? 0) + ($opsWomen['due_today'] ?? 0),
                        'overdue' => ($opsMen['overdue'] ?? 0) + ($opsWomen['overdue'] ?? 0),
                        'new_this_month' => ($opsMen['new_this_month'] ?? 0) + ($opsWomen['new_this_month'] ?? 0),
                        'active_due_amount' => ($opsMen['total_active_due'] ?? 0) + ($opsWomen['total_active_due'] ?? 0)
                    ]
                ]
            ]);
            break;

        case 'defaulters':
            $memberSources = [
                ['table' => 'members_men', 'gender' => 'men'],
                ['table' => 'members_women', 'gender' => 'women']
            ];

            $unionParts = [];
            foreach ($memberSources as $source) {
                $dateColumn = resolve_member_date_column($db, $source['table']);
                $unionParts[] = "SELECT id, member_code, name, phone, status, total_due_amount, next_fee_due_date, {$dateColumn} AS join_date, '{$source['gender']}' AS gender
                                 FROM {$source['table']}
                                 WHERE status = 'active'
                                   AND ((next_fee_due_date IS NOT NULL AND next_fee_due_date < CURDATE())
                                        OR COALESCE(total_due_amount, 0) > 0)";
            }

            $query = "SELECT * FROM (" . implode(' UNION ALL ', $unionParts) . ") d
                      ORDER BY (next_fee_due_date IS NULL) ASC, next_fee_due_date ASC, total_due_amount DESC, name ASC";
            $stmt = $db->prepare($query);
            $stmt->execute();
            $defaulters = $stmt->fetchAll(PDO::FETCH_ASSOC);

            $todayTs = strtotime(date('Y-m-d'));
            $overdueCount = 0;
            $outstandingDuesCount = 0;
            $totalOutstanding = 0.0;

            foreach ($defaulters as &$defaulter) {
                $dueAmount = (float)($defaulter['total_due_amount'] ?? 0);
                $defaulter['total_due_amount'] = $dueAmount;
                $totalOutstanding += $dueAmount;
                if ($dueAmount > 0) {
                    $outstandingDuesCount++;
                }

                $daysOverdue = 0;
                if (!empty($defaulter['next_fee_due_date'])) {
                    $dueTs = strtotime($defaulter['next_fee_due_date']);
                    if ($dueTs !== false && $dueTs < $todayTs) {
                        $daysOverdue = (int)floor(($todayTs - $dueTs) / 86400);
                        $overdueCount++;
                    }
                }
                $defaulter['days_overdue'] = $daysOverdue;
            }
            unset($defaulter);

            echo json_encode([
                'success' => true,
                'data' => [
                    'defaulters' => $defaulters,
                    'total_count' => count($defaulters),
                    'overdue_count' => $overdueCount,
                    'outstanding_dues_count' => $outstandingDuesCount,
                    'total_outstanding_amount' => $totalOutstanding
                ]
            ]);
            break;

        case 'payments':
            $monthStart = date('Y-m-01');
            $monthEnd = date('Y-m-t');

            $query = "SELECT
                        COUNT(*) as total_payments,
                        COALESCE(SUM(amount), 0) as total_revenue,
                        COALESCE(AVG(amount), 0) as avg_payment,
                        SUM(CASE WHEN payment_date = CURDATE() THEN amount ELSE 0 END) as revenue_today,
                        SUM(CASE WHEN payment_date BETWEEN :month_start_amount AND :month_end_amount THEN amount ELSE 0 END) as revenue_this_month,
                        SUM(CASE WHEN payment_date = CURDATE() THEN 1 ELSE 0 END) as payments_today,
                        SUM(CASE WHEN payment_date BETWEEN :month_start_count AND :month_end_count THEN 1 ELSE 0 END) as payments_this_month,
                        SUM(CASE WHEN status = 'pending' THEN COALESCE(remaining_amount, 0) ELSE 0 END) as pending_remaining_amount
                     FROM (
                         SELECT amount, payment_date, status, remaining_amount FROM payments_men
                         UNION ALL
                         SELECT amount, payment_date, status, remaining_amount FROM payments_women
                     ) all_payments";
            $stmt = $db->prepare($query);
            $stmt->bindValue(':month_start_amount', $monthStart, PDO::PARAM_STR);
            $stmt->bindValue(':month_end_amount', $monthEnd, PDO::PARAM_STR);
            $stmt->bindValue(':month_start_count', $monthStart, PDO::PARAM_STR);
            $stmt->bindValue(':month_end_count', $monthEnd, PDO::PARAM_STR);
            $stmt->execute();
            $stats = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];

            echo json_encode([
                'success' => true,
                'data' => [
                    'total_payments' => (int)($stats['total_payments'] ?? 0),
                    'total_revenue' => (float)($stats['total_revenue'] ?? 0),
                    'avg_payment' => (float)($stats['avg_payment'] ?? 0),
                    'revenue_today' => (float)($stats['revenue_today'] ?? 0),
                    'revenue_this_month' => (float)($stats['revenue_this_month'] ?? 0),
                    'payments_today' => (int)($stats['payments_today'] ?? 0),
                    'payments_this_month' => (int)($stats['payments_this_month'] ?? 0),
                    'pending_remaining_amount' => (float)($stats['pending_remaining_amount'] ?? 0)
                ]
            ]);
            break;

        case 'attendance':
            $attendanceMen = new Attendance($db, 'men');
            $attendanceWomen = new Attendance($db, 'women');
            $todayMen = $attendanceMen->getTodaySummary();
            $todayWomen = $attendanceWomen->getTodaySummary();

            $monthStart = date('Y-m-01');
            $monthQuery = "SELECT
                                COUNT(*) as month_count,
                                COUNT(DISTINCT member_key) as unique_members_this_month
                           FROM (
                                SELECT CONCAT('men-', member_id) as member_key, check_in FROM attendance_men WHERE DATE(check_in) >= :month_start_1
                                UNION ALL
                                SELECT CONCAT('women-', member_id) as member_key, check_in FROM attendance_women WHERE DATE(check_in) >= :month_start_2
                           ) attendance_union";
            $monthStmt = $db->prepare($monthQuery);
            $monthStmt->bindValue(':month_start_1', $monthStart, PDO::PARAM_STR);
            $monthStmt->bindValue(':month_start_2', $monthStart, PDO::PARAM_STR);
            $monthStmt->execute();
            $monthStats = $monthStmt->fetch(PDO::FETCH_ASSOC) ?: [];

            echo json_encode([
                'success' => true,
                'data' => [
                    'today' => ($todayMen['total_visits'] ?? 0) + ($todayWomen['total_visits'] ?? 0),
                    'today_unique_members' => ($todayMen['unique_members'] ?? 0) + ($todayWomen['unique_members'] ?? 0),
                    'active_sessions' => ($todayMen['active_sessions'] ?? 0) + ($todayWomen['active_sessions'] ?? 0),
                    'this_month' => (int)($monthStats['month_count'] ?? 0),
                    'unique_members_this_month' => (int)($monthStats['unique_members_this_month'] ?? 0)
                ]
            ]);
            break;

        default:
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'Invalid report type']);
    }
} catch (Throwable $e) {
    error_log('Reports API error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'An unexpected server error occurred.'
    ]);
}
