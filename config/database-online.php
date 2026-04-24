<?php
/**
 * Online Database Configuration
 * Uses dedicated online DB env vars with safe fallbacks.
 */

class DatabaseOnline {
    private $host;
    private $db_name;
    private $username;
    private $password;
    private $conn;

    public function __construct() {
        $this->host = env('ONLINE_DB_HOST', env('DB_HOST', 'localhost'));
        $this->db_name = env('ONLINE_DB_NAME', env('DB_NAME', 'gym_management'));
        $this->username = env('ONLINE_DB_USERNAME', env('DB_USERNAME', 'root'));
        $this->password = env('ONLINE_DB_PASSWORD', env('DB_PASSWORD', ''));
    }

    public function getConnection() {
        $this->conn = null;

        try {
            $this->conn = new PDO(
                "mysql:host=" . $this->host . ";dbname=" . $this->db_name . ";charset=utf8mb4",
                $this->username,
                $this->password,
                [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES => false
                ]
            );
        } catch(PDOException $exception) {
            error_log("Online DB connection error: " . $exception->getMessage());
            throw new Exception("Database connection failed: " . $exception->getMessage());
        }

        return $this->conn;
    }
}

