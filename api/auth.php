<?php
/**
 * Authentication API
 */

require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../app/models/User.php';
require_once __DIR__ . '/../app/models/Member.php';
require_once __DIR__ . '/../app/helpers/LicenseHelper.php';

header('Content-Type: application/json');

// Check system activation for admin operations
function checkSystemActivation($db) {
    $licenseHelper = new LicenseHelper($db);
    if (!$licenseHelper->isSystemActivated()) {
        http_response_code(403);
        echo json_encode([
            'success' => false,
            'message' => 'System not activated. Please run setup.php to activate the system.',
            'error_code' => 'SYSTEM_NOT_ACTIVATED'
        ]);
        exit;
    }
}

// Simple rate limiting (prevent brute force)
function checkRateLimit() {
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $key = 'login_attempts_' . md5($ip);
    
    if (!isset($_SESSION[$key])) {
        $_SESSION[$key] = ['count' => 0, 'time' => time()];
    }
    
    $attempts = &$_SESSION[$key];
    
    // Reset counter after 15 minutes
    if (time() - $attempts['time'] > 900) {
        $attempts = ['count' => 0, 'time' => time()];
    }
    
    // Block if more than 5 attempts in 15 minutes
    if ($attempts['count'] >= 5) {
        http_response_code(429);
        echo json_encode([
            'success' => false,
            'message' => 'Too many login attempts. Please try again in 15 minutes.',
            'error_code' => 'RATE_LIMIT_EXCEEDED'
        ]);
        exit;
    }
    
    $attempts['count']++;
}

// Sanitize input
function sanitizeInput($input) {
    if (is_array($input)) {
        return array_map('sanitizeInput', $input);
    }
    return htmlspecialchars(strip_tags(trim($input)), ENT_QUOTES, 'UTF-8');
}

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

try {
    $database = new Database();
    $db = $database->getConnection();

    switch ($action) {
        case 'login':
            if ($method === 'POST') {
                // Check rate limiting
                checkRateLimit();
                
                $data = json_decode(file_get_contents('php://input'), true);
                
                // Sanitize inputs
                $username = sanitizeInput($data['username'] ?? '');
                $password = $data['password'] ?? ''; // Don't sanitize password
                $memberCode = sanitizeInput($data['member_code'] ?? '');

                if (!empty($username) && !empty($password)) {
                    // Check system activation before allowing admin login
                    checkSystemActivation($db);
                    
                    // Admin login
                    $user = new User($db);
                    $result = $user->authenticate($username, $password);
                    
                    if ($result) {
                        $_SESSION['user_id'] = $result['id'];
                        $_SESSION['username'] = $result['username'];
                        $_SESSION['role'] = $result['role'];
                        $_SESSION['name'] = $result['name'];
                        
                        echo json_encode([
                            'success' => true,
                            'role' => 'admin',
                            'message' => 'Login successful'
                        ]);
                    } else {
                        http_response_code(401);
                        echo json_encode([
                            'success' => false,
                            'message' => 'Invalid credentials' // Don't reveal which field is wrong
                        ]);
                    }
                } elseif (!empty($memberCode)) {
                    // Member login
                    $memberMen = new Member($db, 'men');
                    $memberWomen = new Member($db, 'women');
                    
                    $member = $memberMen->getByCode($memberCode);
                    $gender = 'men';
                    
                    if (!$member) {
                        $member = $memberWomen->getByCode($memberCode);
                        $gender = 'women';
                    }
                    
                    if ($member) {
                        $_SESSION['member_id'] = $member['id'];
                        $_SESSION['member_code'] = $member['member_code'];
                        $_SESSION['member_gender'] = $gender;
                        $_SESSION['role'] = 'member';
                        
                        // Automatically record attendance on login
                        require_once __DIR__ . '/../app/models/Attendance.php';
                        $attendance = new Attendance($db, $gender);
                        $checkInTime = date('Y-m-d H:i:s');
                        $today = date('Y-m-d');
                        
                        // Check if already checked in today
                        $checkQuery = "SELECT id FROM attendance_{$gender} 
                                     WHERE member_id = :member_id 
                                     AND DATE(check_in) = :date 
                                     AND check_out IS NULL 
                                     LIMIT 1";
                        $checkStmt = $db->prepare($checkQuery);
                        $checkStmt->bindValue(':member_id', $member['id'], PDO::PARAM_INT);
                        $checkStmt->bindValue(':date', $today, PDO::PARAM_STR);
                        $checkStmt->execute();
                        
                        if ($checkStmt->rowCount() == 0) {
                            // Record attendance
                            $insertQuery = "INSERT INTO attendance_{$gender} (member_id, check_in) VALUES (:member_id, :check_in)";
                            $insertStmt = $db->prepare($insertQuery);
                            $insertStmt->bindValue(':member_id', $member['id'], PDO::PARAM_INT);
                            $insertStmt->bindValue(':check_in', $checkInTime, PDO::PARAM_STR);
                            $insertStmt->execute();
                        }
                        
                        echo json_encode([
                            'success' => true,
                            'role' => 'member',
                            'gender' => $gender,
                            'message' => 'Login successful'
                        ]);
                    } else {
                        http_response_code(401);
                        echo json_encode([
                            'success' => false,
                            'message' => 'Invalid member code'
                        ]);
                    }
                } else {
                    http_response_code(400);
                    echo json_encode([
                        'success' => false,
                        'message' => 'Missing credentials'
                    ]);
                }
            }
            break;

        case 'logout':
            session_destroy();
            echo json_encode([
                'success' => true,
                'message' => 'Logged out successfully'
            ]);
            break;

        case 'check':
            if (isset($_SESSION['role'])) {
                // For admin, verify system is activated
                if ($_SESSION['role'] === 'admin') {
                    checkSystemActivation($db);
                }
                
                $response = [
                    'authenticated' => true,
                    'role' => $_SESSION['role']
                ];
                
                if ($_SESSION['role'] === 'admin') {
                    $response['user_id'] = $_SESSION['user_id'];
                    $response['username'] = $_SESSION['username'];
                } elseif ($_SESSION['role'] === 'member') {
                    $response['member_id'] = $_SESSION['member_id'];
                    $response['member_code'] = $_SESSION['member_code'];
                    $response['gender'] = $_SESSION['member_gender'];
                }
                
                echo json_encode($response);
            } else {
                echo json_encode([
                    'authenticated' => false
                ]);
            }
            break;

        default:
            http_response_code(404);
            echo json_encode([
                'success' => false,
                'message' => 'Invalid action'
            ]);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Server error: ' . $e->getMessage()
    ]);
}

