<?php
/**
 * Local Sync Script
 * Reads unsynced records from local database and sends to online server
 */

require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../app/models/Member.php';
require_once __DIR__ . '/../app/models/Payment.php';
require_once __DIR__ . '/../app/models/Expense.php';
require_once __DIR__ . '/../app/models/Attendance.php';

header('Content-Type: application/json');

// Increase execution time and memory limit for large syncs
set_time_limit(1800); // 30 minutes for large datasets
ini_set('memory_limit', '1024M'); // 1GB for large datasets
ini_set('max_execution_time', 1800);

// Check authentication
if (!isset($_SESSION['role']) || $_SESSION['role'] !== 'admin') {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Unauthorized']);
    exit;
}

// Online server URL - UPDATE THIS WITH YOUR ONLINE SERVER URL
$onlineServerUrl = 'https://chocolate-wasp-405221.hostingersite.com'; // Change to your online server URL
$apiKey = 'gym_sync_key_2024_secure'; // Must match the key in sync.php

try {
    $database = new Database();
    $db = $database->getConnection();
    
    // Create sync session (if table exists)
    $sessionId = null;
    $sessionType = $_GET['type'] ?? 'manual';
    try {
        $sessionQuery = "INSERT INTO sync_sessions (session_type, status) VALUES (:type, 'running')";
        $sessionStmt = $db->prepare($sessionQuery);
        $sessionStmt->bindValue(':type', $sessionType, PDO::PARAM_STR);
        $sessionStmt->execute();
        $sessionId = $db->lastInsertId();
    } catch (PDOException $e) {
        // Table doesn't exist, continue without session tracking
        error_log("sync_sessions table not found, continuing without session tracking: " . $e->getMessage());
    }
    
    // Check if force sync is requested (ignores sync_log and syncs all records)
    $forceSyncAll = isset($_GET['force']) && $_GET['force'] == '1';
    if ($forceSyncAll) {
        error_log("FORCE SYNC MODE: Will sync ALL records, ignoring sync_log");
    }
    
    $totalSynced = 0;
    $totalFailed = 0;
    $allErrors = [];
    
    // Sync profile images first (before syncing members)
    $imagesSynced = syncProfileImages($db, $onlineServerUrl, $apiKey);
    $totalSynced += $imagesSynced['synced'];
    $totalFailed += $imagesSynced['failed'];
    $allErrors = array_merge($allErrors, $imagesSynced['errors']);
    
    // Sync Members (Men) - MUST sync first so payments can reference them
    $menSynced = syncTable($db, 'members_men', 'members_men', $onlineServerUrl, $apiKey, $forceSyncAll);
    $totalSynced += $menSynced['synced'];
    $totalFailed += $menSynced['failed'];
    $allErrors = array_merge($allErrors, $menSynced['errors']);
    
    // Sync Members (Women) - MUST sync first so payments can reference them
    $womenSynced = syncTable($db, 'members_women', 'members_women', $onlineServerUrl, $apiKey, $forceSyncAll);
    $totalSynced += $womenSynced['synced'];
    $totalFailed += $womenSynced['failed'];
    $allErrors = array_merge($allErrors, $womenSynced['errors']);
    
    // Sync Payments (Men) - After members are synced
    $paymentsMenSynced = syncTable($db, 'payments_men', 'payments_men', $onlineServerUrl, $apiKey, $forceSyncAll);
    $totalSynced += $paymentsMenSynced['synced'];
    $totalFailed += $paymentsMenSynced['failed'];
    $allErrors = array_merge($allErrors, $paymentsMenSynced['errors']);
    
    // Sync Payments (Women) - After members are synced
    $paymentsWomenSynced = syncTable($db, 'payments_women', 'payments_women', $onlineServerUrl, $apiKey, $forceSyncAll);
    $totalSynced += $paymentsWomenSynced['synced'];
    $totalFailed += $paymentsWomenSynced['failed'];
    $allErrors = array_merge($allErrors, $paymentsWomenSynced['errors']);
    
    // Sync Expenses
    $expensesSynced = syncTable($db, 'expenses', 'expenses', $onlineServerUrl, $apiKey, $forceSyncAll);
    $totalSynced += $expensesSynced['synced'];
    $totalFailed += $expensesSynced['failed'];
    $allErrors = array_merge($allErrors, $expensesSynced['errors']);
    
    // Sync Attendance (Men)
    $attendanceMenSynced = syncTable($db, 'attendance_men', 'attendance_men', $onlineServerUrl, $apiKey, $forceSyncAll);
    $totalSynced += $attendanceMenSynced['synced'];
    $totalFailed += $attendanceMenSynced['failed'];
    $allErrors = array_merge($allErrors, $attendanceMenSynced['errors']);
    
    // Sync Attendance (Women)
    $attendanceWomenSynced = syncTable($db, 'attendance_women', 'attendance_women', $onlineServerUrl, $apiKey, $forceSyncAll);
    $totalSynced += $attendanceWomenSynced['synced'];
    $totalFailed += $attendanceWomenSynced['failed'];
    $allErrors = array_merge($allErrors, $attendanceWomenSynced['errors']);
    
    // Update sync session (if table exists and session was created)
    if ($sessionId) {
        try {
            $updateSessionQuery = "UPDATE sync_sessions SET 
                              status = :status,
                              completed_at = NOW(),
                              records_synced = :synced,
                              records_failed = :failed
                              WHERE id = :id";
            $updateSessionStmt = $db->prepare($updateSessionQuery);
            $status = $totalFailed > 0 ? 'failed' : 'completed';
            $updateSessionStmt->bindValue(':status', $status, PDO::PARAM_STR);
            $updateSessionStmt->bindValue(':synced', $totalSynced, PDO::PARAM_INT);
            $updateSessionStmt->bindValue(':failed', $totalFailed, PDO::PARAM_INT);
            $updateSessionStmt->bindValue(':id', $sessionId, PDO::PARAM_INT);
            $updateSessionStmt->execute();
        } catch (PDOException $e) {
            // Table doesn't exist, ignore
            error_log("sync_sessions table not found for update: " . $e->getMessage());
        }
    }
    
    // Build detailed summary
    $summary = [
        'members_men' => $menSynced['synced'] ?? 0,
        'members_women' => $womenSynced['synced'] ?? 0,
        'payments_men' => $paymentsMenSynced['synced'] ?? 0,
        'payments_women' => $paymentsWomenSynced['synced'] ?? 0,
        'expenses' => $expensesSynced['synced'] ?? 0,
        'attendance_men' => $attendanceMenSynced['synced'] ?? 0,
        'attendance_women' => $attendanceWomenSynced['synced'] ?? 0
    ];
    
    $message = "Sync completed: {$totalSynced} records synced, {$totalFailed} failed. " .
               "Members (Men: {$summary['members_men']}, Women: {$summary['members_women']}), " .
               "Payments (Men: {$summary['payments_men']}, Women: {$summary['payments_women']}), " .
               "Expenses: {$summary['expenses']}, " .
               "Attendance (Men: {$summary['attendance_men']}, Women: {$summary['attendance_women']})";
    
    echo json_encode([
        'success' => true,
        'session_id' => $sessionId,
        'total_synced' => $totalSynced,
        'total_failed' => $totalFailed,
        'errors' => $allErrors,
        'summary' => $summary,
        'message' => $message
    ]);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Sync error: ' . $e->getMessage()
    ]);
}

function syncTable($db, $tableName, $tableType, $onlineServerUrl, $apiKey, $forceSyncAll = false) {
    $totalSynced = 0;
    $totalFailed = 0;
    $allErrors = [];
    
    // Log sync start
    error_log("Starting sync for table: {$tableName} (type: {$tableType}), forceSyncAll=" . ($forceSyncAll ? 'true' : 'false'));
    
    // Get ALL unsynced records - fetch everything
    // Try to use sync_log if table exists, otherwise get all records
    // If forceSyncAll is true, ignore sync_log and sync everything
    $useSyncLog = false;
    if (!$forceSyncAll) {
        try {
            $testQuery = "SELECT 1 FROM sync_log LIMIT 1";
            $db->query($testQuery);
            $useSyncLog = true;
        } catch (PDOException $e) {
            // sync_log table doesn't exist, will sync all records
            $useSyncLog = false;
        }
    }
    
    if ($useSyncLog && !$forceSyncAll) {
        // Get records that are NOT synced (either no sync_log entry, or status is pending/failed)
        // Use NOT EXISTS to exclude records that have a 'synced' status
        $query = "SELECT t.* FROM {$tableName} t
                  WHERE NOT EXISTS (
                      SELECT 1 FROM sync_log sl 
                      WHERE sl.table_name = :table_name 
                      AND sl.record_id = t.id 
                      AND sl.sync_status = 'synced'
                  )
                  ORDER BY t.id ASC";
    } else {
        // If sync_log doesn't exist, get ALL records (for first sync)
        // For payments, ensure we only get records with valid member_id
        if (strpos($tableName, 'payments_') === 0) {
            $query = "SELECT t.* FROM {$tableName} t
                      WHERE t.member_id IS NOT NULL AND t.member_id > 0
                      ORDER BY t.id ASC";
        } else {
            $query = "SELECT t.* FROM {$tableName} t
                      ORDER BY t.id ASC";
        }
    }
    
    $stmt = $db->prepare($query);
    if ($useSyncLog) {
        $stmt->bindValue(':table_name', $tableName, PDO::PARAM_STR);
    }
    $stmt->execute();
    $allRecords = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    $totalRecordCount = count($allRecords);
    
    // Always log total count in database for comparison
    $countQuery = "SELECT COUNT(*) as total FROM {$tableName}";
    $countStmt = $db->prepare($countQuery);
    $countStmt->execute();
    $totalInDb = $countStmt->fetch()['total'] ?? 0;
    
    if ($useSyncLog) {
        // Count how many are already marked as synced
        $syncedQuery = "SELECT COUNT(DISTINCT record_id) as synced_count FROM sync_log 
                       WHERE table_name = :table_name AND sync_status = 'synced'";
        $syncedStmt = $db->prepare($syncedQuery);
        $syncedStmt->bindValue(':table_name', $tableName, PDO::PARAM_STR);
        $syncedStmt->execute();
        $syncedCount = $syncedStmt->fetch()['synced_count'] ?? 0;
        
        error_log("Table {$tableName}: Total in DB={$totalInDb}, Already synced={$syncedCount}, Records to sync now={$totalRecordCount}");
    } else {
        error_log("Table {$tableName}: Total in DB={$totalInDb}, Records to sync={$totalRecordCount} (first sync, no sync_log)");
    }
    
    // Warn if there's a significant discrepancy
    if ($useSyncLog && $totalInDb > 0 && $totalRecordCount == 0) {
        error_log("WARNING: {$totalInDb} records in database but 0 records to sync. All may be marked as synced already.");
    } elseif ($totalInDb > $totalRecordCount + 100) {
        error_log("WARNING: {$totalInDb} records in database but only {$totalRecordCount} to sync. Difference: " . ($totalInDb - $totalRecordCount));
    }
    
    if (empty($allRecords)) {
        error_log("No records to sync for table: {$tableName}");
        return [
            'synced' => 0,
            'failed' => 0,
            'errors' => []
        ];
    }
    
    // Process records in chunks to avoid server limits (1000 records per chunk)
    // This ensures ALL records are sent, but in manageable chunks
    $chunkSize = 1000;
    $totalChunks = ceil($totalRecordCount / $chunkSize);
    error_log("Processing {$totalRecordCount} records in {$totalChunks} chunks of {$chunkSize} for table: {$tableName}");
    
    for ($chunkIndex = 0; $chunkIndex < $totalChunks; $chunkIndex++) {
        $offset = $chunkIndex * $chunkSize;
        $records = array_slice($allRecords, $offset, $chunkSize);
        $chunkNumber = $chunkIndex + 1;
        $chunkRecordCount = count($records);
        
        error_log("Processing chunk {$chunkNumber}/{$totalChunks} for {$tableName} (records " . ($offset + 1) . " - " . ($offset + $chunkRecordCount) . ")");
        
        // For payments, add member_code to each record for better matching
        if (strpos($tableName, 'payments_') === 0) {
            $gender = str_replace('payments_', '', $tableName);
            $memberTable = 'members_' . $gender;
            $paymentsWithCode = 0;
            $paymentsWithoutCode = 0;
            
            foreach ($records as &$record) {
                if (isset($record['member_id']) && $record['member_id'] > 0) {
                    try {
                        $memberQuery = "SELECT member_code FROM {$memberTable} WHERE id = :member_id LIMIT 1";
                        $memberStmt = $db->prepare($memberQuery);
                        $memberStmt->bindValue(':member_id', $record['member_id'], PDO::PARAM_INT);
                        $memberStmt->execute();
                        $member = $memberStmt->fetch();
                        if ($member && isset($member['member_code']) && !empty($member['member_code'])) {
                            $record['member_code'] = $member['member_code'];
                            $paymentsWithCode++;
                        } else {
                            // Log warning but continue - member_code will be missing
                            error_log("Warning: Could not find member_code for payment ID " . ($record['id'] ?? 'N/A') . " with member_id: {$record['member_id']}");
                            $paymentsWithoutCode++;
                        }
                    } catch (Exception $e) {
                        error_log("Error fetching member_code for payment ID " . ($record['id'] ?? 'N/A') . ": " . $e->getMessage());
                        $paymentsWithoutCode++;
                    }
                } else {
                    error_log("Warning: Payment record ID " . ($record['id'] ?? 'N/A') . " has invalid member_id: " . ($record['member_id'] ?? 'NULL'));
                    $paymentsWithoutCode++;
                }
            }
            unset($record); // Unset reference
            error_log("Chunk {$chunkNumber}: Payment member_code lookup - {$paymentsWithCode} with code, {$paymentsWithoutCode} without code");
        }
        
        // Prepare data for sync
        $data = [
            'action' => 'sync',
            'table_type' => $tableType,
            'records' => $records
        ];
        
        // Send chunk to online server
        $ch = curl_init($onlineServerUrl . '/api/sync.php?api_key=' . urlencode($apiKey));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
        curl_setopt($ch, CURLOPT_TIMEOUT, 600); // 10 minutes per chunk
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 30);
        
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);
        
        if ($curlError) {
            // Log error but continue with next chunk
            error_log("Chunk {$chunkNumber} cURL error: {$curlError}");
            try {
                $testQuery = "SELECT 1 FROM sync_log LIMIT 1";
                $db->query($testQuery);
                foreach ($records as $record) {
                    updateSyncLog($db, $tableName, $record['id'], 'failed', "cURL error: {$curlError}");
                }
            } catch (PDOException $e) {
                // sync_log table doesn't exist, skip logging
            }
            $totalFailed += $chunkRecordCount;
            $allErrors[] = "Chunk {$chunkNumber} sync error: {$curlError}";
            // Continue to next chunk instead of returning
            continue;
        }
        
        $result = json_decode($response, true);
        
        if ($httpCode !== 200 || !$result || !$result['success']) {
            $errorMsg = $result['message'] ?? 'Unknown error';
            error_log("Chunk {$chunkNumber} sync failed (HTTP {$httpCode}): {$errorMsg}");
            // Log error but continue with next chunk
            try {
                $testQuery = "SELECT 1 FROM sync_log LIMIT 1";
                $db->query($testQuery);
                foreach ($records as $record) {
                    updateSyncLog($db, $tableName, $record['id'], 'failed', $errorMsg);
                }
            } catch (PDOException $e) {
                // sync_log table doesn't exist, skip logging
            }
            $totalFailed += $chunkRecordCount;
            $allErrors[] = "Chunk {$chunkNumber} sync failed: {$errorMsg}";
            // Continue to next chunk instead of returning
            continue;
        }
        
        // Process successful response
        $synced = $result['synced'] ?? 0;
        $failed = $result['failed'] ?? 0;
        $errors = $result['errors'] ?? [];
        
        error_log("Chunk {$chunkNumber}/{$totalChunks} result: {$synced} synced, {$failed} failed");
        if (!empty($errors) && count($errors) > 0) {
            $errorSample = array_slice($errors, 0, 3);
            error_log("Chunk {$chunkNumber} sample errors: " . implode('; ', $errorSample));
        }
        
        $totalSynced += $synced;
        $totalFailed += $failed;
        $allErrors = array_merge($allErrors, $errors);
        
        // Mark all sent records as synced (server will handle duplicates/updates)
        // Only if sync_log table exists
        try {
            $testQuery = "SELECT 1 FROM sync_log LIMIT 1";
            $db->query($testQuery);
            foreach ($records as $record) {
                updateSyncLog($db, $tableName, $record['id'], 'synced', null);
            }
        } catch (PDOException $e) {
            // sync_log table doesn't exist, skip logging
        }
    }
    
    // Log final summary
    error_log("Completed sync for {$tableName}: {$totalSynced} total synced, {$totalFailed} total failed out of {$totalRecordCount} records");
    
    return [
        'synced' => $totalSynced,
        'failed' => $totalFailed,
        'errors' => $allErrors
    ];
}

function syncProfileImages($db, $onlineServerUrl, $apiKey) {
    $synced = 0;
    $failed = 0;
    $errors = [];
    
    // Get all members with profile images that haven't been synced
    $query = "SELECT DISTINCT profile_image FROM members_men WHERE profile_image IS NOT NULL AND profile_image != ''
              UNION
              SELECT DISTINCT profile_image FROM members_women WHERE profile_image IS NOT NULL AND profile_image != ''";
    $stmt = $db->prepare($query);
    $stmt->execute();
    $imagePaths = $stmt->fetchAll(PDO::FETCH_COLUMN);
    
    if (empty($imagePaths)) {
        return ['synced' => 0, 'failed' => 0, 'errors' => []];
    }
    
    foreach ($imagePaths as $imagePath) {
        try {
            // Check if image file exists locally
            $localPath = __DIR__ . '/../' . $imagePath;
            
            if (!file_exists($localPath)) {
                $errors[] = "Image file not found: {$imagePath}";
                $failed++;
                continue;
            }
            
            // Upload image to online server
            $ch = curl_init($onlineServerUrl . '/api/sync-image.php?api_key=' . urlencode($apiKey));
            
            $postData = [
                'image' => new CURLFile($localPath, mime_content_type($localPath), basename($imagePath)),
                'image_path' => $imagePath
            ];
            
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
            curl_setopt($ch, CURLOPT_TIMEOUT, 30);
            
            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $curlError = curl_error($ch);
            curl_close($ch);
            
            if ($curlError) {
                $errors[] = "Image upload error for {$imagePath}: {$curlError}";
                $failed++;
            } elseif ($httpCode !== 200) {
                $result = json_decode($response, true);
                $errorMsg = $result['message'] ?? 'Unknown error';
                $errors[] = "Image upload failed for {$imagePath}: {$errorMsg}";
                $failed++;
            } else {
                $synced++;
            }
        } catch (Exception $e) {
            $errors[] = "Error syncing image {$imagePath}: " . $e->getMessage();
            $failed++;
        }
    }
    
    return [
        'synced' => $synced,
        'failed' => $failed,
        'errors' => $errors
    ];
}

function updateSyncLog($db, $tableName, $recordId, $status, $error = null) {
    try {
        // Check if log exists
        $checkQuery = "SELECT id FROM sync_log WHERE table_name = :table_name AND record_id = :record_id";
        $checkStmt = $db->prepare($checkQuery);
        $checkStmt->bindValue(':table_name', $tableName, PDO::PARAM_STR);
        $checkStmt->bindValue(':record_id', $recordId, PDO::PARAM_INT);
        $checkStmt->execute();
        $existing = $checkStmt->fetch();
    } catch (PDOException $e) {
        // Table doesn't exist, return early
        return;
    }
    
    if ($existing) {
        // Update existing
        $updateQuery = "UPDATE sync_log SET 
                       sync_status = :status,
                       synced_at = " . ($status === 'synced' ? 'NOW()' : 'NULL') . ",
                       sync_attempts = sync_attempts + 1,
                       last_error = :error,
                       updated_at = NOW()
                       WHERE id = :id";
        $updateStmt = $db->prepare($updateQuery);
        $updateStmt->bindValue(':status', $status, PDO::PARAM_STR);
        $updateStmt->bindValue(':error', $error, PDO::PARAM_STR);
        $updateStmt->bindValue(':id', $existing['id'], PDO::PARAM_INT);
        $updateStmt->execute();
    } else {
        // Insert new
        $insertQuery = "INSERT INTO sync_log (table_name, record_id, record_type, action, sync_status, last_error) 
                       VALUES (:table_name, :record_id, :record_type, 'create', :status, :error)";
        $insertStmt = $db->prepare($insertQuery);
        $insertStmt->bindValue(':table_name', $tableName, PDO::PARAM_STR);
        $insertStmt->bindValue(':record_id', $recordId, PDO::PARAM_INT);
        $insertStmt->bindValue(':record_type', $tableName, PDO::PARAM_STR);
        $insertStmt->bindValue(':status', $status, PDO::PARAM_STR);
        $insertStmt->bindValue(':error', $error, PDO::PARAM_STR);
        $insertStmt->execute();
    }
}

