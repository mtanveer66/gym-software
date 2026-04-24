<?php
/**
 * Member Model (Gender-Aware)
 */

class Member {
    private $conn;
    private $gender;
    private $table;

    public function __construct($db, $gender = 'men') {
        $this->conn = $db;
        $this->gender = in_array($gender, ['men', 'women']) ? $gender : 'men';
        $this->table = 'members_' . $this->gender;
    }

    public function getAll($page = 1, $limit = 20, $search = '', $status = null) {
        $offset = ($page - 1) * $limit;
        $where = [];
        $params = [];

        if (!empty($search)) {
            $where[] = "(member_code LIKE :search1 OR name LIKE :search2 OR phone LIKE :search3 OR email LIKE :search4)";
            $searchParam = '%' . $search . '%';
            $params[':search1'] = $searchParam;
            $params[':search2'] = $searchParam;
            $params[':search3'] = $searchParam;
            $params[':search4'] = $searchParam;
        }
        
        if ($status !== null) {
            $where[] = "status = :status";
            $params[':status'] = $status;
        }

        $whereClause = !empty($where) ? "WHERE " . implode(" AND ", $where) : "";

        $query = "SELECT * FROM " . $this->table . " " . $whereClause . " ORDER BY created_at DESC LIMIT :limit OFFSET :offset";
        $stmt = $this->conn->prepare($query);
        
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value, PDO::PARAM_STR);
        }
        $stmt->bindValue(':limit', (int)$limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', (int)$offset, PDO::PARAM_INT);
        $stmt->execute();

        $countQuery = "SELECT COUNT(*) as total FROM " . $this->table . " " . $whereClause;
        $countStmt = $this->conn->prepare($countQuery);
        foreach ($params as $key => $value) {
            $countStmt->bindValue($key, $value, PDO::PARAM_STR);
        }
        $countStmt->execute();
        $total = $countStmt->fetch()['total'];

        return [
            'data' => $stmt->fetchAll(),
            'total' => $total,
            'page' => $page,
            'limit' => $limit
        ];
    }

    public function getByCode($memberCode) {
        $query = "SELECT * FROM " . $this->table . " WHERE member_code = :member_code LIMIT 1";
        $stmt = $this->conn->prepare($query);
        $stmt->bindValue(':member_code', $memberCode, PDO::PARAM_STR);
        $stmt->execute();
        return $stmt->fetch();
    }

    public function getById($id) {
        $query = "SELECT * FROM " . $this->table . " WHERE id = :id LIMIT 1";
        $stmt = $this->conn->prepare($query);
        $stmt->bindValue(':id', $id, PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetch();
    }

    public function create($data) {
        $phone = trim((string)($data['phone'] ?? ''));
        if ($phone === '') {
            throw new InvalidArgumentException('Phone number is required.');
        }

        $query = "INSERT INTO " . $this->table . " 
            (member_code, name, email, phone, rfid_uid, address, profile_image, membership_type, join_date, admission_fee, monthly_fee, locker_fee, next_fee_due_date, total_due_amount, status, is_checked_in) 
            VALUES 
            (:member_code, :name, :email, :phone, :rfid_uid, :address, :profile_image, :membership_type, :join_date, :admission_fee, :monthly_fee, :locker_fee, :next_fee_due_date, :total_due_amount, :status, :is_checked_in)";
        
        $stmt = $this->conn->prepare($query);
        $stmt->bindValue(':member_code', trim((string)($data['member_code'] ?? '')), PDO::PARAM_STR);
        $stmt->bindValue(':name', trim((string)($data['name'] ?? '')), PDO::PARAM_STR);
        $stmt->bindValue(':email', $data['email'] ?? null, PDO::PARAM_STR);
        $stmt->bindValue(':phone', $phone, PDO::PARAM_STR);
        $stmt->bindValue(':rfid_uid', $data['rfid_uid'] ?? null, PDO::PARAM_STR);
        $stmt->bindValue(':address', $data['address'] ?? null, PDO::PARAM_STR);
        $stmt->bindValue(':profile_image', $data['profile_image'] ?? null, PDO::PARAM_STR);
        $stmt->bindValue(':membership_type', $data['membership_type'] ?? 'Basic', PDO::PARAM_STR);
        $stmt->bindValue(':join_date', $data['join_date'] ?? date('Y-m-d'), PDO::PARAM_STR);
        $stmt->bindValue(':admission_fee', $data['admission_fee'] ?? 0.00, PDO::PARAM_STR);
        $stmt->bindValue(':monthly_fee', $data['monthly_fee'] ?? 0.00, PDO::PARAM_STR);
        $stmt->bindValue(':locker_fee', $data['locker_fee'] ?? 0.00, PDO::PARAM_STR);
        $stmt->bindValue(':next_fee_due_date', $data['next_fee_due_date'] ?? null, PDO::PARAM_STR);
        $stmt->bindValue(':total_due_amount', $data['total_due_amount'] ?? 0.00, PDO::PARAM_STR);
        $stmt->bindValue(':status', $data['status'] ?? 'active', PDO::PARAM_STR);
        $stmt->bindValue(':is_checked_in', $data['is_checked_in'] ?? 0, PDO::PARAM_INT);

        if ($stmt->execute()) {
            return $this->conn->lastInsertId();
        }
        return false;
    }

    public function update($id, $data) {
        $phone = trim((string)($data['phone'] ?? ''));
        if ($phone === '') {
            throw new InvalidArgumentException('Phone number is required.');
        }

        $query = "UPDATE " . $this->table . " SET 
            member_code = :member_code,
            name = :name,
            email = :email,
            phone = :phone,
            rfid_uid = :rfid_uid,
            address = :address,
            profile_image = :profile_image,
            membership_type = :membership_type,
            join_date = :join_date,
            admission_fee = :admission_fee,
            monthly_fee = :monthly_fee,
            locker_fee = :locker_fee,
            next_fee_due_date = :next_fee_due_date,
            total_due_amount = :total_due_amount,
            status = :status
            WHERE id = :id";
        
        $stmt = $this->conn->prepare($query);
        $stmt->bindValue(':id', $id, PDO::PARAM_INT);
        $stmt->bindValue(':member_code', trim((string)($data['member_code'] ?? '')), PDO::PARAM_STR);
        $stmt->bindValue(':name', trim((string)($data['name'] ?? '')), PDO::PARAM_STR);
        $stmt->bindValue(':email', $data['email'] ?? null, PDO::PARAM_STR);
        $stmt->bindValue(':phone', $phone, PDO::PARAM_STR);
        $stmt->bindValue(':rfid_uid', $data['rfid_uid'] ?? null, PDO::PARAM_STR);
        $stmt->bindValue(':address', $data['address'] ?? null, PDO::PARAM_STR);
        $stmt->bindValue(':profile_image', $data['profile_image'] ?? null, PDO::PARAM_STR);
        $stmt->bindValue(':membership_type', $data['membership_type'] ?? 'Basic', PDO::PARAM_STR);
        $stmt->bindValue(':join_date', $data['join_date'] ?? date('Y-m-d'), PDO::PARAM_STR);
        $stmt->bindValue(':admission_fee', $data['admission_fee'] ?? 0.00, PDO::PARAM_STR);
        $stmt->bindValue(':monthly_fee', $data['monthly_fee'] ?? 0.00, PDO::PARAM_STR);
        $stmt->bindValue(':locker_fee', $data['locker_fee'] ?? 0.00, PDO::PARAM_STR);
        $stmt->bindValue(':next_fee_due_date', $data['next_fee_due_date'] ?? null, PDO::PARAM_STR);
        $stmt->bindValue(':total_due_amount', $data['total_due_amount'] ?? 0.00, PDO::PARAM_STR);
        $stmt->bindValue(':status', $data['status'] ?? 'active', PDO::PARAM_STR);

        return $stmt->execute();
    }
    
    public function getByRfidUid($rfidUid) {
        $query = "SELECT * FROM " . $this->table . " WHERE rfid_uid = :rfid_uid LIMIT 1";
        $stmt = $this->conn->prepare($query);
        $stmt->bindValue(':rfid_uid', $rfidUid, PDO::PARAM_STR);
        $stmt->execute();
        return $stmt->fetch();
    }

    public function delete($id) {
        $query = "DELETE FROM " . $this->table . " WHERE id = :id";
        $stmt = $this->conn->prepare($query);
        $stmt->bindValue(':id', $id, PDO::PARAM_INT);
        return $stmt->execute();
    }

    public function updateFeeDueDate($id, $date) {
        $query = "UPDATE " . $this->table . " SET next_fee_due_date = :date WHERE id = :id";
        $stmt = $this->conn->prepare($query);
        $stmt->bindValue(':id', $id, PDO::PARAM_INT);
        $stmt->bindValue(':date', $date, PDO::PARAM_STR);
        return $stmt->execute();
    }

    public function getRecent($limit = 10) {
        $query = "SELECT * FROM " . $this->table . " ORDER BY created_at DESC LIMIT :limit";
        $stmt = $this->conn->prepare($query);
        $stmt->bindValue(':limit', (int)$limit, PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll();
    }

    public function getStats() {
        $totalQuery = "SELECT COUNT(*) as total FROM " . $this->table;
        $activeQuery = "SELECT COUNT(*) as active FROM " . $this->table . " WHERE status = 'active'";
        
        $totalStmt = $this->conn->prepare($totalQuery);
        $activeStmt = $this->conn->prepare($activeQuery);
        
        $totalStmt->execute();
        $activeStmt->execute();
        
        $totalResult = $totalStmt->fetch(PDO::FETCH_ASSOC);
        $activeResult = $activeStmt->fetch(PDO::FETCH_ASSOC);
        
        return [
            'total' => intval($totalResult['total'] ?? 0),
            'active' => intval($activeResult['active'] ?? 0),
            'inactive' => intval($totalResult['total'] ?? 0) - intval($activeResult['active'] ?? 0)
        ];
    }
}

