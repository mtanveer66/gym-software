<?php
/**
 * Update Member Fee API
 */

// Start output buffering to prevent any accidental output
ob_start();

require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../app/models/Member.php';
require_once __DIR__ . '/../app/models/Payment.php';
require_once __DIR__ . '/../app/helpers/SyncHelper.php';

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

if ($method !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

try {
    $input = file_get_contents('php://input');
    if (empty($input)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Request body is empty']);
        exit;
    }
    
    $data = json_decode($input, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid JSON in request body: ' . json_last_error_msg()]);
        exit;
    }
    
    $memberId = $data['member_id'] ?? null;
    $gender = $data['gender'] ?? 'men';
    $amount = $data['amount'] ?? null;
    $isDefaulterUpdate = $data['is_defaulter_update'] ?? false;
    $newDefaulterDate = $data['new_defaulter_date'] ?? null;
    $isPartialPayment = $data['is_partial_payment'] ?? false;
    $dueAmount = $data['due_amount'] ?? 0.00;
    
    if (!$memberId || !$amount) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Member ID and amount are required']);
        exit;
    }
    
    if ($isPartialPayment && $dueAmount <= 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Due amount must be greater than 0 for partial payment']);
        exit;
    }
    
    $database = new Database();
    $db = $database->getConnection();
    $member = new Member($db, $gender);
    
    // Get member details
    $memberData = $member->getById($memberId);
    if (!$memberData) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Member not found']);
        exit;
    }
    
    // Calculate next fee due date
    $nextFeeDueDate = null;
    
    if ($isDefaulterUpdate && $newDefaulterDate) {
        // Use the new defaulter date provided
        $nextFeeDueDate = $newDefaulterDate;
    } else {
        // Calculate based on join date (normal update)
        $joinDate = new DateTime($memberData['join_date']);
        $today = new DateTime();
        
        // Calculate months since join date
        $monthsSinceJoin = ($today->format('Y') - $joinDate->format('Y')) * 12 + 
                          ($today->format('m') - $joinDate->format('m'));
        
        // Next fee due date is based on join date + months
        $nextFeeDueDateObj = clone $joinDate;
        $nextFeeDueDateObj->modify('+' . ($monthsSinceJoin + 1) . ' months');
        $nextFeeDueDate = $nextFeeDueDateObj->format('Y-m-d');
    }
    
    // Get current due amount and monthly fee
    $currentDueQuery = "SELECT total_due_amount, monthly_fee FROM members_{$gender} WHERE id = :id";
    $currentDueStmt = $db->prepare($currentDueQuery);
    $currentDueStmt->bindValue(':id', $memberId, PDO::PARAM_INT);
    $currentDueStmt->execute();
    $currentMemberData = $currentDueStmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$currentMemberData) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Member data not found']);
        exit;
    }
    
    $currentDueAmount = floatval($currentMemberData['total_due_amount'] ?? 0.00);
    $monthlyFee = floatval($currentMemberData['monthly_fee'] ?? 0.00);
    
    // Calculate total owed: previous due + new monthly fee
    $totalOwed = $currentDueAmount + $monthlyFee;
    
    // Determine if this is a full payment (covers everything) or partial
    // Use a small tolerance (0.01) for floating point comparison
    $isFullPayment = ($amount >= ($totalOwed - 0.01));
    
    if ($isPartialPayment) {
        // For explicit partial payment: add the remaining due amount to existing dues
        // Payment amount + remaining due = what was owed
        $newTotalDue = $currentDueAmount + $dueAmount;
        $remainingAmount = $dueAmount;
        $paymentStatus = 'pending';
        $actualPaymentAmount = $amount; // Use the amount entered
    } else if ($isFullPayment) {
        // For full payment: payment covers previous due + monthly fee
        // The payment amount should include both previous due and monthly fee
        $actualPaymentAmount = $amount; // This should be >= totalOwed
        $newTotalDue = 0.00; // Everything is paid
        $remainingAmount = 0.00;
        $paymentStatus = 'completed';
    } else {
        // Partial payment (amount < totalOwed but not marked as partial)
        // This means they're paying part of what's owed
        // Calculate remaining: total owed - payment made
        $actualPaymentAmount = $amount;
        $newTotalDue = max(0, $totalOwed - $amount); // Remaining after payment
        $remainingAmount = $newTotalDue;
        $paymentStatus = 'pending';
    }
    
    // Record payment - the payment amount includes previous due + monthly fee if full payment
    $payment = new Payment($db, $gender);
    $totalDueAmount = $isPartialPayment ? ($amount + $dueAmount) : $totalOwed;
    
    // Generate unique invoice number
    $invoiceNumber = '';
    $maxAttempts = 10;
    $attempt = 0;
    do {
        $timestamp = date('YmdHis');
        $random = rand(1000, 9999);
        $invoiceNumber = 'INV-' . $timestamp . '-' . str_pad($memberId, 4, '0', STR_PAD_LEFT) . '-' . $random;
        
        // Check if invoice number already exists
        $checkInvoiceQuery = "SELECT COUNT(*) as count FROM payments_{$gender} WHERE invoice_number = :invoice";
        $checkInvoiceStmt = $db->prepare($checkInvoiceQuery);
        $checkInvoiceStmt->bindValue(':invoice', $invoiceNumber, PDO::PARAM_STR);
        $checkInvoiceStmt->execute();
        $exists = $checkInvoiceStmt->fetch(PDO::FETCH_ASSOC)['count'] > 0;
        
        $attempt++;
    } while ($exists && $attempt < $maxAttempts);
    
    // If still duplicate after max attempts, add microtime
    if ($exists) {
        $invoiceNumber = 'INV-' . date('YmdHis') . '-' . str_pad($memberId, 4, '0', STR_PAD_LEFT) . '-' . substr(str_replace('.', '', microtime(true)), -6);
    }
    
    $receivedBy = $data['received_by'] ?? null;
    $paymentMethod = $data['payment_method'] ?? 'Cash';
    
    $paymentData = [
        'member_id' => $memberId,
        'amount' => $actualPaymentAmount, // Full amount paid (includes previous due if full payment)
        'remaining_amount' => $remainingAmount,
        'total_due_amount' => $totalDueAmount, // Total that was due (previous + monthly fee)
        'payment_date' => date('Y-m-d'),
        'due_date' => $nextFeeDueDate,
        'invoice_number' => $invoiceNumber,
        'status' => $paymentStatus,
        'received_by' => $receivedBy,
        'payment_method' => $paymentMethod
    ];
    
    // Create payment record
    $paymentId = $payment->create($paymentData);
    
    if (!$paymentId) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'message' => 'Failed to create payment record. Please check database connection.',
            'payment_data' => $paymentData
        ]);
        exit;
    }
    
    if ($paymentId) {
        // Update member's next fee due date
        $member->updateFeeDueDate($memberId, $nextFeeDueDate);
        
        // Update member's total due amount - use transaction to ensure consistency
        $db->beginTransaction();
        try {
            $updateDueQuery = "UPDATE members_{$gender} SET total_due_amount = :total_due WHERE id = :id";
            $updateDueStmt = $db->prepare($updateDueQuery);
            $updateDueStmt->bindValue(':total_due', $newTotalDue, PDO::PARAM_STR);
            $updateDueStmt->bindValue(':id', $memberId, PDO::PARAM_INT);
            $updateResult = $updateDueStmt->execute();
            
            if (!$updateResult) {
                throw new Exception('Failed to update member due amount');
            }
            
            // Verify the update
            $verifyQuery = "SELECT total_due_amount FROM members_{$gender} WHERE id = :id";
            $verifyStmt = $db->prepare($verifyQuery);
            $verifyStmt->bindValue(':id', $memberId, PDO::PARAM_INT);
            $verifyStmt->execute();
            $verified = $verifyStmt->fetch(PDO::FETCH_ASSOC);
            $actualNewDue = floatval($verified['total_due_amount'] ?? 0.00);
            
            $db->commit();
            
            // Use the verified amount
            $newTotalDue = $actualNewDue;

            // Mark this member record for re-sync so cloud database gets the updated due amount
            SyncHelper::markRecordForSync($db, "members_{$gender}", (int)$memberId);
        
            // Return success with payment details
            $message = '';
            if ($isPartialPayment) {
                $message = 'Partial payment recorded. Amount due: ' . number_format($dueAmount, 2);
            } else if ($isFullPayment) {
                $message = 'Full payment recorded. Previous due (' . number_format($currentDueAmount, 2) . ') + Monthly fee (' . number_format($monthlyFee, 2) . ') = ' . number_format($totalOwed, 2) . ' paid in full.';
            } else {
                $message = 'Payment recorded. Remaining due: ' . number_format($newTotalDue, 2);
            }
            
            echo json_encode([
                'success' => true,
                'message' => $message,
                'payment_id' => $paymentId,
                'payment_date' => $paymentData['payment_date'],
                'next_fee_due_date' => $nextFeeDueDate,
                'remaining_amount' => $remainingAmount,
                'new_total_due' => $newTotalDue,
                'previous_due' => $currentDueAmount,
                'monthly_fee' => $monthlyFee,
                'payment_amount' => $actualPaymentAmount, // Full amount paid (includes previous due)
                'total_owed' => $totalOwed,
                'calculation' => [
                    'current_due' => $currentDueAmount,
                    'monthly_fee_added' => $monthlyFee,
                    'total_owed' => $totalOwed,
                    'payment_made' => $actualPaymentAmount,
                    'new_due' => $newTotalDue,
                    'is_full_payment' => $isFullPayment
                ],
                'refresh_required' => true // Flag to indicate UI should refresh
            ]);
        } catch (Exception $e) {
            $db->rollBack();
            throw $e;
        }
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to record payment']);
    }
    
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

