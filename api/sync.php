<?php
/**
 * Sync API Endpoint (for online server)
 * Receives data from local server and inserts into online database
 */

// Increase execution time and memory limit for large syncs
set_time_limit(1800); // 30 minutes for large datasets
ini_set('memory_limit', '1024M'); // 1GB for large datasets
ini_set('max_execution_time', 1800);

require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../config/database-online.php';
require_once __DIR__ . '/../app/models/Member.php';
require_once __DIR__ . '/../app/models/Payment.php';
require_once __DIR__ . '/../app/models/Expense.php';
require_once __DIR__ . '/../app/models/Attendance.php';

header('Content-Type: application/json');

// Simple API key authentication (change this to a secure key)
$apiKey = $_GET['api_key'] ?? $_POST['api_key'] ?? '';
$expectedApiKey = 'gym_sync_key_2024_secure'; // Change this to a secure key

if ($apiKey !== $expectedApiKey) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Unauthorized - Invalid API key']);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

try {
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);
    
    if (!$data) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid JSON data']);
        exit;
    }
    
    $database = new DatabaseOnline();
    $db = $database->getConnection();
    
    $action = $data['action'] ?? '';
    $tableType = $data['table_type'] ?? '';
    $records = $data['records'] ?? [];
    
    $recordCount = is_array($records) ? count($records) : 0;
    error_log("Online server received sync request: table_type={$tableType}, record_count={$recordCount}");
    
    if (empty($records) || !is_array($records)) {
        error_log("Warning: No records or invalid records array received");
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'No records provided or invalid format']);
        exit;
    }
    
    $synced = 0;
    $failed = 0;
    $errors = [];
    
    switch ($tableType) {
        case 'members_men':
        case 'members_women':
            $gender = str_replace('members_', '', $tableType);
            $member = new Member($db, $gender);
            
            foreach ($records as $record) {
                try {
                    // Ensure all required fields are present
                    if (empty($record['member_code'])) {
                        $failed++;
                        $errors[] = "Member record missing member_code";
                        continue;
                    }
                    
                    // Check if member exists
                    $existing = $member->getByCode($record['member_code']);
                    
                    if ($existing) {
                        // Update existing - ensure total_due_amount is included from incoming record
                        $updateData = $record;
                        // Always use the incoming total_due_amount if provided, otherwise keep existing
                        if (!isset($updateData['total_due_amount']) || $updateData['total_due_amount'] === null) {
                            $updateData['total_due_amount'] = $existing['total_due_amount'] ?? 0.00;
                        }
                        $member->update($existing['id'], $updateData);
                    } else {
                        // Create new - ensure default values
                        if (!isset($record['total_due_amount']) || $record['total_due_amount'] === null) {
                            $record['total_due_amount'] = 0.00;
                        }
                        $member->create($record);
                    }
                    $synced++;
                } catch (Exception $e) {
                    $failed++;
                    $errors[] = "Member {$record['member_code']}: " . $e->getMessage();
                }
            }
            break;
            
        case 'payments_men':
        case 'payments_women':
            $gender = str_replace('payments_', '', $tableType);
            $payment = new Payment($db, $gender);
            $member = new Member($db, $gender);
            
            foreach ($records as $record) {
                try {
                    // First, resolve member_id by member_code if needed (for cross-database sync)
                    $memberId = $record['member_id'] ?? null;
                    $memberCode = $record['member_code'] ?? null;
                    
                    // If member_code is provided, use it to find the correct member_id (preferred method)
                    if (!empty($memberCode)) {
                        $memberByCode = $member->getByCode($memberCode);
                        if ($memberByCode) {
                            $memberId = $memberByCode['id'];
                        } else {
                            // Try to find by member_id if member_code doesn't work
                            if ($memberId) {
                                $memberCheck = $member->getById($memberId);
                                if ($memberCheck) {
                                    // Member exists by ID, use it
                                    error_log("Payment sync: Member code '{$memberCode}' not found, but member_id {$memberId} exists. Using member_id.");
                                } else {
                                    $failed++;
                                    $errors[] = "Payment sync failed: Member with code '{$memberCode}' and ID '{$memberId}' not found in online database";
                                    continue;
                                }
                            } else {
                                $failed++;
                                $errors[] = "Payment sync failed: Member with code '{$memberCode}' not found in online database and no member_id provided";
                                continue;
                            }
                        }
                    } elseif ($memberId) {
                        // Only member_id provided, verify it exists
                        $memberCheck = $member->getById($memberId);
                        if (!$memberCheck) {
                            $failed++;
                            $errors[] = "Payment sync failed: Member with ID '{$memberId}' not found in online database. Please sync members first.";
                            continue;
                        }
                    } else {
                        $failed++;
                        $errors[] = "Payment sync failed: Missing both member_id and member_code";
                        continue;
                    }
                    
                    // Final verification - member should exist at this point
                    if (!$memberId) {
                        $failed++;
                        $errors[] = "Payment sync failed: Could not resolve member_id";
                        continue;
                    }
                    
                    // Update record with correct member_id
                    $record['member_id'] = $memberId;
                    
                    // Check if payment exists - prioritize invoice_number if available
                    $existing = null;
                    
                    if (!empty($record['invoice_number'])) {
                        // Match by invoice_number (most reliable)
                        $checkQuery = "SELECT id FROM payments_{$gender} 
                                     WHERE invoice_number = :invoice_number 
                                     LIMIT 1";
                        $checkStmt = $db->prepare($checkQuery);
                        $checkStmt->bindValue(':invoice_number', $record['invoice_number'], PDO::PARAM_STR);
                        $checkStmt->execute();
                        $existing = $checkStmt->fetch();
                    }
                    
                    // If not found by invoice_number, try member_id + amount + payment_date
                    if (!$existing) {
                        $checkQuery = "SELECT id FROM payments_{$gender} 
                                     WHERE member_id = :member_id 
                                     AND amount = :amount 
                                     AND payment_date = :payment_date 
                                     LIMIT 1";
                        $checkStmt = $db->prepare($checkQuery);
                        $checkStmt->bindValue(':member_id', $memberId, PDO::PARAM_INT);
                        $checkStmt->bindValue(':amount', $record['amount'], PDO::PARAM_STR);
                        $checkStmt->bindValue(':payment_date', $record['payment_date'], PDO::PARAM_STR);
                        $checkStmt->execute();
                        $existing = $checkStmt->fetch();
                    }
                    
                    if ($existing) {
                        $payment->update($existing['id'], $record);
                    } else {
                        $payment->create($record);
                    }
                    $synced++;
                } catch (Exception $e) {
                    $failed++;
                    $memberCode = $record['member_code'] ?? 'N/A';
                    $errors[] = "Payment for member {$memberCode}: " . $e->getMessage();
                }
            }
            break;
            
        case 'expenses':
            $expense = new Expense($db);
            
            foreach ($records as $record) {
                try {
                    // Check if expense exists
                    if (isset($record['id'])) {
                        $existing = $expense->getById($record['id']);
                        if ($existing) {
                            $expense->update($record['id'], $record);
                        } else {
                            unset($record['id']);
                            $expense->create($record);
                        }
                    } else {
                        $expense->create($record);
                    }
                    $synced++;
                } catch (Exception $e) {
                    $failed++;
                    $errors[] = "Expense: " . $e->getMessage();
                }
            }
            break;
            
        case 'attendance_men':
        case 'attendance_women':
            $gender = str_replace('attendance_', '', $tableType);
            $attendance = new Attendance($db, $gender);
            
            foreach ($records as $record) {
                try {
                    // Check if attendance exists
                    $checkQuery = "SELECT id FROM attendance_{$gender} 
                                 WHERE member_id = :member_id 
                                 AND DATE(check_in) = DATE(:check_in)
                                 LIMIT 1";
                    $checkStmt = $db->prepare($checkQuery);
                    $checkStmt->bindValue(':member_id', $record['member_id'], PDO::PARAM_INT);
                    $checkStmt->bindValue(':check_in', $record['check_in'], PDO::PARAM_STR);
                    $checkStmt->execute();
                    $existing = $checkStmt->fetch();
                    
                    if ($existing) {
                        // Update existing attendance
                        $updateQuery = "UPDATE attendance_{$gender} SET 
                                      check_out = :check_out,
                                      duration_minutes = :duration_minutes
                                      WHERE id = :id";
                        $updateStmt = $db->prepare($updateQuery);
                        $updateStmt->bindValue(':id', $existing['id'], PDO::PARAM_INT);
                        $updateStmt->bindValue(':check_out', $record['check_out'] ?? null, PDO::PARAM_STR);
                        $updateStmt->bindValue(':duration_minutes', $record['duration_minutes'] ?? null, PDO::PARAM_INT);
                        $updateStmt->execute();
                    } else {
                        // Create new attendance
                        $attendance->create($record);
                    }
                    $synced++;
                } catch (Exception $e) {
                    $failed++;
                    $errors[] = "Attendance for member {$record['member_id']}: " . $e->getMessage();
                }
            }
            break;
            
        default:
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Invalid table type']);
            exit;
    }
    
    error_log("Online server sync completed for {$tableType}: {$synced} synced, {$failed} failed out of {$recordCount} received");
    
    echo json_encode([
        'success' => true,
        'synced' => $synced,
        'failed' => $failed,
        'errors' => $errors,
        'message' => "Synced {$synced} records, {$failed} failed"
    ]);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Server error: ' . $e->getMessage()
    ]);
}

