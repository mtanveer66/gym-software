<?php
/**
 * Payment Model (Gender-Aware)
 */

class Payment {
    private $conn;
    private $gender;
    private $table;

    public function __construct($db, $gender = 'men') {
        $this->conn = $db;
        $this->gender = in_array($gender, ['men', 'women']) ? $gender : 'men';
        $this->table = 'payments_' . $this->gender;
    }

    public function getByMemberId($memberId, $limit = null, $offset = 0) {
        $query = "SELECT * FROM " . $this->table . " WHERE member_id = :member_id ORDER BY payment_date DESC";
        
        if ($limit !== null) {
            $query .= " LIMIT :limit OFFSET :offset";
        }
        
        $stmt = $this->conn->prepare($query);
        $stmt->bindValue(':member_id', $memberId, PDO::PARAM_INT);
        
        if ($limit !== null) {
            $stmt->bindValue(':limit', (int)$limit, PDO::PARAM_INT);
            $stmt->bindValue(':offset', (int)$offset, PDO::PARAM_INT);
        }
        
        $stmt->execute();
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function getAll($page = 1, $limit = 20) {
        $offset = ($page - 1) * $limit;
        $memberTable = 'members_' . $this->gender;
        
        $query = "SELECT p.*, m.member_code, m.name 
                  FROM " . $this->table . " p
                  JOIN " . $memberTable . " m ON p.member_id = m.id
                  ORDER BY p.payment_date DESC
                  LIMIT :limit OFFSET :offset";
        
        $stmt = $this->conn->prepare($query);
        $stmt->bindValue(':limit', (int)$limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', (int)$offset, PDO::PARAM_INT);
        $stmt->execute();

        $countQuery = "SELECT COUNT(*) as total FROM " . $this->table;
        $countStmt = $this->conn->prepare($countQuery);
        $countStmt->execute();
        $totalResult = $countStmt->fetch(PDO::FETCH_ASSOC);
        $total = intval($totalResult['total'] ?? 0);

        return [
            'data' => $stmt->fetchAll(PDO::FETCH_ASSOC),
            'total' => $total,
            'page' => $page,
            'limit' => $limit
        ];
    }

    public function create($data) {
        $query = "INSERT INTO " . $this->table . " 
            (member_id, amount, remaining_amount, total_due_amount, payment_date, due_date, invoice_number, status, received_by, payment_method) 
            VALUES 
            (:member_id, :amount, :remaining_amount, :total_due_amount, :payment_date, :due_date, :invoice_number, :status, :received_by, :payment_method)";
        
        $stmt = $this->conn->prepare($query);
        $stmt->bindValue(':member_id', $data['member_id'], PDO::PARAM_INT);
        $stmt->bindValue(':amount', $data['amount'], PDO::PARAM_STR);
        $stmt->bindValue(':remaining_amount', $data['remaining_amount'] ?? 0.00, PDO::PARAM_STR);
        $stmt->bindValue(':total_due_amount', $data['total_due_amount'] ?? null, PDO::PARAM_STR);
        $stmt->bindValue(':payment_date', $data['payment_date'], PDO::PARAM_STR);
        $stmt->bindValue(':due_date', $data['due_date'] ?? null, PDO::PARAM_STR);
        $stmt->bindValue(':invoice_number', $data['invoice_number'] ?? null, PDO::PARAM_STR);
        $stmt->bindValue(':status', $data['status'] ?? 'completed', PDO::PARAM_STR);
        $stmt->bindValue(':received_by', $data['received_by'] ?? null, PDO::PARAM_STR);
        $stmt->bindValue(':payment_method', $data['payment_method'] ?? 'Cash', PDO::PARAM_STR);

        if ($stmt->execute()) {
            return $this->conn->lastInsertId();
        }
        return false;
    }

    public function update($id, $data) {
        $query = "UPDATE " . $this->table . " SET 
            member_id = :member_id,
            amount = :amount,
            remaining_amount = :remaining_amount,
            total_due_amount = :total_due_amount,
            payment_date = :payment_date,
            due_date = :due_date,
            invoice_number = :invoice_number,
            status = :status,
            received_by = :received_by,
            payment_method = :payment_method
            WHERE id = :id";
        
        $stmt = $this->conn->prepare($query);
        $stmt->bindValue(':id', $id, PDO::PARAM_INT);
        $stmt->bindValue(':member_id', $data['member_id'], PDO::PARAM_INT);
        $stmt->bindValue(':amount', $data['amount'], PDO::PARAM_STR);
        $stmt->bindValue(':remaining_amount', $data['remaining_amount'] ?? 0.00, PDO::PARAM_STR);
        $stmt->bindValue(':total_due_amount', $data['total_due_amount'] ?? null, PDO::PARAM_STR);
        $stmt->bindValue(':payment_date', $data['payment_date'], PDO::PARAM_STR);
        $stmt->bindValue(':due_date', $data['due_date'] ?? null, PDO::PARAM_STR);
        $stmt->bindValue(':invoice_number', $data['invoice_number'] ?? null, PDO::PARAM_STR);
        $stmt->bindValue(':status', $data['status'] ?? 'completed', PDO::PARAM_STR);
        $stmt->bindValue(':received_by', $data['received_by'] ?? null, PDO::PARAM_STR);
        $stmt->bindValue(':payment_method', $data['payment_method'] ?? 'Cash', PDO::PARAM_STR);

        return $stmt->execute();
    }
}

