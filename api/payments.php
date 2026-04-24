<?php
/**
 * Payments API (Gender-Aware)
 */

require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../app/models/Payment.php';
require_once __DIR__ . '/../app/models/MessageTemplate.php';
require_once __DIR__ . '/../app/models/MessageQueue.php';
require_once __DIR__ . '/../app/models/MemberConsent.php';

header('Content-Type: application/json');

// Check authentication
if (!isset($_SESSION['role']) || $_SESSION['role'] !== 'admin') {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Unauthorized']);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$gender = $_GET['gender'] ?? 'men';
$gender = in_array($gender, ['men', 'women'], true) ? $gender : 'men';

try {
    $database = new Database();
    $db = $database->getConnection();

    switch ($action) {
        case 'list':
            $page = $_GET['page'] ?? 1;
            $limit = $_GET['limit'] ?? 20;
            $month = $_GET['month'] ?? date('m');
            $year = $_GET['year'] ?? date('Y');
            $search = $_GET['search'] ?? '';
            $defaulters = $_GET['defaulters'] ?? false;  // Show defaulters
            $status = $_GET['status'] ?? null; // 'active', 'inactive', or null for default behavior

            // Get payments for current month
            $memberTable = 'members_' . $gender;
            $offset = ($page - 1) * $limit;
            
            if ($defaulters) {
                // Show defaulters: members who haven't paid in the last month
                $oneMonthAgo = date('Y-m-d', strtotime('-1 month'));
                $searchParam = '%' . $search . '%';
                
                // Build WHERE clause for base filtering
                $whereClause = "WHERE m.join_date <= :one_month_ago";
                
                // STATUS FILTERING
                if ($status) {
                    $whereClause .= " AND m.status = :status";
                } else {
                    // Default to active if not specified
                    $whereClause .= " AND m.status = 'active'"; 
                }
                
                if (!empty($search)) {
                    $whereClause .= " AND (m.member_code LIKE :search OR m.name LIKE :search)";
                }
                
                $query = "SELECT m.id as member_id, m.member_code, m.name, m.join_date, 
                                 m.monthly_fee, m.total_due_amount, m.status,
                                 MAX(p.payment_date) as last_payment_date,
                                 DATEDIFF(CURDATE(), COALESCE(MAX(p.payment_date), m.join_date)) as days_since_payment
                          FROM {$memberTable} m
                          LEFT JOIN payments_{$gender} p ON p.member_id = m.id
                          {$whereClause}
                          GROUP BY m.id, m.member_code, m.name, m.join_date, m.monthly_fee, m.total_due_amount, m.status
                          HAVING DATEDIFF(CURDATE(), COALESCE(MAX(p.payment_date), m.join_date)) >= 30
                          ORDER BY days_since_payment DESC, m.created_at DESC
                          LIMIT :limit OFFSET :offset";
            } else {
                $whereClause = "WHERE MONTH(p.payment_date) = :month AND YEAR(p.payment_date) = :year";
                $searchParam = '%' . $search . '%';
                
                if (!empty($search)) {
                    $whereClause .= " AND (m.member_code LIKE :search OR m.name LIKE :search OR p.invoice_number LIKE :search)";
                }
                
                if ($status) {
                     $whereClause .= " AND m.status = :status";
                }
                
                $query = "SELECT p.*, m.member_code, m.name 
                          FROM payments_{$gender} p
                          JOIN {$memberTable} m ON p.member_id = m.id
                          {$whereClause}
                          ORDER BY p.payment_date DESC, p.created_at DESC
                          LIMIT :limit OFFSET :offset";
            }
            
            $stmt = $db->prepare($query);
            
            if ($defaulters) {
                $stmt->bindValue(':one_month_ago', $oneMonthAgo, PDO::PARAM_STR);
                if (!empty($search)) {
                    $stmt->bindValue(':search', $searchParam, PDO::PARAM_STR);
                }
                if ($status) {
                    $stmt->bindValue(':status', $status, PDO::PARAM_STR);
                }
            } else {
                $stmt->bindValue(':month', (int)$month, PDO::PARAM_INT);
                $stmt->bindValue(':year', (int)$year, PDO::PARAM_INT);
                if (!empty($search)) {
                    $stmt->bindValue(':search', $searchParam, PDO::PARAM_STR);
                }
                if ($status) {
                    $stmt->bindValue(':status', $status, PDO::PARAM_STR);
                }
            }
            $stmt->bindValue(':limit', (int)$limit, PDO::PARAM_INT);
            $stmt->bindValue(':offset', (int)$offset, PDO::PARAM_INT);
            $stmt->execute();
            
            // Count query
            if ($defaulters) {
                // Use subquery to count defaulters properly
                $countQuery = "SELECT COUNT(*) as total FROM (
                                  SELECT m.id, m.join_date
                                  FROM {$memberTable} m
                                  LEFT JOIN payments_{$gender} p ON p.member_id = m.id
                                  {$whereClause}
                                  GROUP BY m.id, m.join_date
                                  HAVING DATEDIFF(CURDATE(), COALESCE(MAX(p.payment_date), m.join_date)) >= 30
                              ) as defaulter_count";
            } else {
                $countQuery = "SELECT COUNT(*) as total 
                              FROM payments_{$gender} p
                              JOIN {$memberTable} m ON p.member_id = m.id
                              {$whereClause}";
            }
            $countStmt = $db->prepare($countQuery);
            
            if ($defaulters) {
                $countStmt->bindValue(':one_month_ago', $oneMonthAgo, PDO::PARAM_STR);
                if (!empty($search)) {
                    $countStmt->bindValue(':search', $searchParam, PDO::PARAM_STR);
                }
                if ($status) {
                    $countStmt->bindValue(':status', $status, PDO::PARAM_STR);
                }
            } else {
                $countStmt->bindValue(':month', (int)$month, PDO::PARAM_INT);
                $countStmt->bindValue(':year', (int)$year, PDO::PARAM_INT);
                if (!empty($search)) {
                    $countStmt->bindValue(':search', $searchParam, PDO::PARAM_STR);
                }
                if ($status) {
                    $countStmt->bindValue(':status', $status, PDO::PARAM_STR);
                }
            }
            $countStmt->execute();
            $totalResult = $countStmt->fetch(PDO::FETCH_ASSOC);
            $total = intval($totalResult['total'] ?? 0);
            
            $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            echo json_encode([
                'success' => true,
                'data' => $data,
                'pagination' => [
                    'total' => $total,
                    'page' => $page,
                    'limit' => $limit,
                    'pages' => ceil($total / $limit)
                ],
                'month' => $defaulters ? null : $month,
                'year' => $defaulters ? null : $year,
                'defaulters' => $defaulters
            ]);
            break;

        case 'create':
            if ($method === 'POST') {
                $data = json_decode(file_get_contents('php://input'), true);
                if (!is_array($data)) {
                    http_response_code(400);
                    echo json_encode(['success' => false, 'message' => 'Invalid request payload']);
                    exit;
                }

                if (empty($data['member_id']) || empty($data['amount']) || empty($data['payment_date'])) {
                    http_response_code(400);
                    echo json_encode(['success' => false, 'message' => 'member_id, amount, and payment_date are required']);
                    exit;
                }

                if (!is_numeric($data['amount']) || (float)$data['amount'] <= 0) {
                    http_response_code(400);
                    echo json_encode(['success' => false, 'message' => 'Amount must be greater than zero']);
                    exit;
                }
                
                $payment = new Payment($db, $gender);
                
                $paymentData = [
                    'member_id' => $data['member_id'],
                    'amount' => $data['amount'],
                    'remaining_amount' => $data['remaining_amount'] ?? 0.00,
                    'total_due_amount' => $data['total_due_amount'] ?? null,
                    'payment_date' => $data['payment_date'],
                    'due_date' => $data['due_date'] ?? null,
                    'invoice_number' => $data['invoice_number'] ?? null,
                    'received_by' => $data['received_by'] ?? null,
                    'payment_method' => $data['payment_method'] ?? 'Cash',
                    'status' => $data['status'] ?? 'completed'
                ];

                $id = $payment->create($paymentData);
                if ($id) {
                    $memberTable = 'members_' . $gender;
                    $memberStmt = $db->prepare("SELECT id, name, phone FROM {$memberTable} WHERE id = :id LIMIT 1");
                    $memberStmt->bindValue(':id', (int)$data['member_id'], PDO::PARAM_INT);
                    $memberStmt->execute();
                    $memberRow = $memberStmt->fetch(PDO::FETCH_ASSOC);

                    if ($memberRow) {
                        $consentModel = new MemberConsent($db);
                        $templateModel = new MessageTemplate($db);
                        $queueModel = new MessageQueue($db);
                        $template = $templateModel->getByKey('payment_confirmation_basic', 'whatsapp');

                        if ($template && $consentModel->hasGrantedConsent($memberTable, (int)$memberRow['id']) && !empty($memberRow['phone'])) {
                            $queueModel->create([
                                'member_table' => $memberTable,
                                'member_id' => (int)$memberRow['id'],
                                'template_id' => $template['id'],
                                'channel' => 'whatsapp',
                                'recipient' => $memberRow['phone'],
                                'message_purpose' => 'payment_confirmation',
                                'payload_json' => json_encode([
                                    'member_name' => $memberRow['name'],
                                    'amount' => $data['amount'],
                                    'payment_date' => $data['payment_date'],
                                    'gym_name' => $data['gym_name'] ?? 'Your Gym'
                                ], JSON_UNESCAPED_UNICODE),
                                'scheduled_for' => date('Y-m-d H:i:s'),
                                'status' => 'pending'
                            ]);
                        }
                    }

                    echo json_encode(['success' => true, 'id' => $id, 'message' => 'Payment recorded successfully']);
                } else {
                    http_response_code(500);
                    echo json_encode(['success' => false, 'message' => 'Failed to record payment']);
                }
            }
            break;

        default:
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'Invalid action']);
    }
} catch (Throwable $e) {
    error_log('Payments API error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'An unexpected server error occurred.'
    ]);
}
