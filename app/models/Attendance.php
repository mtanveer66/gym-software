<?php
/**
 * Attendance Model (Gender-Aware)
 */

class Attendance {
    private $conn;
    private $gender;
    private $table;

    public function __construct($db, $gender = 'men') {
        $this->conn = $db;
        $this->gender = in_array($gender, ['men', 'women']) ? $gender : 'men';
        $this->table = 'attendance_' . $this->gender;
    }

    public function getByMemberId($memberId, $startDate = null, $endDate = null) {
        $where = "WHERE member_id = :member_id";
        $params = [':member_id' => $memberId];

        if ($startDate) {
            $where .= " AND DATE(check_in) >= :start_date";
            $params[':start_date'] = $startDate;
        }
        if ($endDate) {
            $where .= " AND DATE(check_in) <= :end_date";
            $params[':end_date'] = $endDate;
        }

        $query = "SELECT * FROM " . $this->table . " " . $where . " ORDER BY check_in DESC";
        $stmt = $this->conn->prepare($query);
        
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value);
        }
        
        $stmt->execute();
        return $stmt->fetchAll();
    }

    public function getCalendarData($memberId, $year, $month) {
        $startDate = sprintf("%04d-%02d-01", $year, $month);
        $endDate = date('Y-m-t', strtotime($startDate));
        
        $query = "SELECT DATE(check_in) as date, COUNT(*) as count 
                  FROM " . $this->table . " 
                  WHERE member_id = :member_id 
                  AND DATE(check_in) >= :start_date 
                  AND DATE(check_in) <= :end_date
                  GROUP BY DATE(check_in)";
        
        $stmt = $this->conn->prepare($query);
        $stmt->bindValue(':member_id', $memberId, PDO::PARAM_INT);
        $stmt->bindValue(':start_date', $startDate, PDO::PARAM_STR);
        $stmt->bindValue(':end_date', $endDate, PDO::PARAM_STR);
        $stmt->execute();
        
        $attendance = [];
        foreach ($stmt->fetchAll() as $row) {
            $attendance[$row['date']] = $row['count'];
        }
        
        return $attendance;
    }

    public function getAll($page = 1, $limit = 20, $genderFilter = null) {
        $offset = ($page - 1) * $limit;
        $memberTable = 'members_' . $this->gender;
        
        $query = "SELECT a.*, m.member_code, m.name 
                  FROM " . $this->table . " a
                  JOIN " . $memberTable . " m ON a.member_id = m.id
                  ORDER BY a.check_in DESC
                  LIMIT :limit OFFSET :offset";
        
        $stmt = $this->conn->prepare($query);
        $stmt->bindValue(':limit', (int)$limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', (int)$offset, PDO::PARAM_INT);
        $stmt->execute();

        $countQuery = "SELECT COUNT(*) as total FROM " . $this->table;
        $countStmt = $this->conn->prepare($countQuery);
        $countStmt->execute();
        $total = $countStmt->fetch()['total'];

        return [
            'data' => $stmt->fetchAll(),
            'total' => $total,
            'page' => $page,
            'limit' => $limit
        ];
    }
}

