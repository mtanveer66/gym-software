<?php
/**
 * Dashboard API
 */

require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../app/models/Member.php';
require_once __DIR__ . '/../app/models/Expense.php';

// Release session lock immediately to prevent blocking parallel requests
if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}

header('Content-Type: application/json');

// Check authentication (allow GET requests by default)
if (!isset($_SESSION['role']) || $_SESSION['role'] !== 'admin') {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Unauthorized']);
    exit;
}

// AUTO-RUN DAILY JOBS
require_once __DIR__ . '/CronHelper.php';
try {
    $cron = new CronHelper();
    $cron->runDailyAutoArchive();
} catch (Exception $e) {
    // Silent fail to not break dashboard load
    error_log("Cron Error: " . $e->getMessage());
}

try {
    $database = new Database();
    $db = $database->getConnection();

    $memberMen = new Member($db, 'men');
    $memberWomen = new Member($db, 'women');
    $expense = new Expense($db);

    // Get stats with error handling
    try {
        $statsMen = $memberMen->getStats();
        if (!is_array($statsMen) || !isset($statsMen['total'])) {
            $statsMen = ['total' => 0, 'active' => 0];
        }
    } catch (Exception $e) {
        $statsMen = ['total' => 0, 'active' => 0];
    }
    
    try {
        $statsWomen = $memberWomen->getStats();
        if (!is_array($statsWomen) || !isset($statsWomen['total'])) {
            $statsWomen = ['total' => 0, 'active' => 0];
        }
    } catch (Exception $e) {
        $statsWomen = ['total' => 0, 'active' => 0];
    }
    
    try {
        $recentMen = $memberMen->getRecent(5);
        if (!is_array($recentMen)) {
            $recentMen = [];
        }
    } catch (Exception $e) {
        $recentMen = [];
    }
    
    try {
        $recentWomen = $memberWomen->getRecent(5);
        if (!is_array($recentWomen)) {
            $recentWomen = [];
        }
    } catch (Exception $e) {
        $recentWomen = [];
    }

    // Get revenue (all payments - income/intake) for current month
    // Include both completed and pending payments since money was received
    $currentMonth = date('m');
    $currentYear = date('Y');
    try {
        // Use separate parameter names for each part of UNION to avoid parameter number error
        $revenueQuery = "SELECT SUM(amount) as total FROM (
            SELECT amount FROM payments_men WHERE MONTH(payment_date) = :month1 AND YEAR(payment_date) = :year1
            UNION ALL
            SELECT amount FROM payments_women WHERE MONTH(payment_date) = :month2 AND YEAR(payment_date) = :year2
        ) as all_payments";
        $revenueStmt = $db->prepare($revenueQuery);
        $revenueStmt->bindValue(':month1', (int)$currentMonth, PDO::PARAM_INT);
        $revenueStmt->bindValue(':year1', (int)$currentYear, PDO::PARAM_INT);
        $revenueStmt->bindValue(':month2', (int)$currentMonth, PDO::PARAM_INT);
        $revenueStmt->bindValue(':year2', (int)$currentYear, PDO::PARAM_INT);
        $revenueStmt->execute();
        $revenueResult = $revenueStmt->fetch(PDO::FETCH_ASSOC);
        $revenue = floatval($revenueResult['total'] ?? 0.00);
    } catch (Exception $e) {
        $revenue = 0.00;
    }

    // Get expenses for current month
    $startDate = date('Y-m-01');
    $endDate = date('Y-m-t');
    try {
        $expenses = $expense->getTotalByPeriod($startDate, $endDate);
        if (!is_numeric($expenses)) {
            $expenses = 0.00;
        }
    } catch (Exception $e) {
        $expenses = 0.00;
    }

    // Calculate profit
    $profit = $revenue - $expenses;

    // Get total revenue (all time - all payments received)
    try {
        $totalRevenueQuery = "SELECT SUM(amount) as total FROM (
            SELECT amount FROM payments_men
            UNION ALL
            SELECT amount FROM payments_women
        ) as all_payments";
        $totalRevenueStmt = $db->prepare($totalRevenueQuery);
        $totalRevenueStmt->execute();
        $totalRevenueResult = $totalRevenueStmt->fetch(PDO::FETCH_ASSOC);
        $totalRevenue = floatval($totalRevenueResult['total'] ?? 0.00);
    } catch (Exception $e) {
        $totalRevenue = 0.00;
    }

    // Get total expenses (all time)
    try {
        $totalExpenses = $expense->getTotalByPeriod();
        if (!is_numeric($totalExpenses)) {
            $totalExpenses = 0.00;
        }
    } catch (Exception $e) {
        $totalExpenses = 0.00;
    }

    // Calculate net profit (all time)
    $netProfit = $totalRevenue - $totalExpenses;

    echo json_encode([
        'success' => true,
        'data' => [
            'men' => [
                'stats' => $statsMen,
                'recent' => $recentMen
            ],
            'women' => [
                'stats' => $statsWomen,
                'recent' => $recentWomen
            ],
            'total' => [
                'members' => $statsMen['total'] + $statsWomen['total'],
                'active' => $statsMen['active'] + $statsWomen['active']
            ],
            'financial' => [
                'current_month' => [
                    'revenue' => $revenue,
                    'expenses' => $expenses,
                    'profit' => $profit
                ],
                'all_time' => [
                    'revenue' => $totalRevenue,
                    'expenses' => $totalExpenses,
                    'net_profit' => $netProfit
                ]
            ]
        ]
    ]);
} catch (Exception $e) {
    // Log error for debugging
    error_log('Dashboard API Error: ' . $e->getMessage() . ' in ' . $e->getFile() . ' on line ' . $e->getLine());
    
    http_response_code(500);
    
    // Only show detailed errors in debug mode
    $errorMessage = defined('DEBUG_MODE') && DEBUG_MODE 
        ? 'Server error: ' . $e->getMessage()
        : 'An error occurred while loading dashboard data. Please try again.';
    
    $response = ['success' => false, 'message' => $errorMessage];
    
    if (defined('DEBUG_MODE') && DEBUG_MODE) {
        $response['error_details'] = [
            'file' => $e->getFile(),
            'line' => $e->getLine(),
            'trace' => $e->getTraceAsString()
        ];
    }
    
    echo json_encode($response);
} catch (Error $e) {
    // Handle fatal errors (PHP 7+)
    error_log('Dashboard API Fatal Error: ' . $e->getMessage() . ' in ' . $e->getFile() . ' on line ' . $e->getLine());
    
    http_response_code(500);
    $errorMessage = defined('DEBUG_MODE') && DEBUG_MODE
        ? 'Fatal error: ' . $e->getMessage()
        : 'A fatal error occurred. Please contact support.';
    
    echo json_encode([
        'success' => false,
        'message' => $errorMessage
    ]);
}

