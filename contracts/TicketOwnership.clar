 (define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-TICKET-EXISTS u101)
(define-constant ERR-INVALID-EVENT u102)
(define-constant ERR-TICKET-NOT-FOUND u103)
(define-constant ERR-NOT-OWNER u104)
(define-constant ERR-NOT-TRANSFERABLE u105)
(define-constant ERR-PRICE-VIOLATION u106)
(define-constant ERR-INVALID-TIMESTAMP u107)
(define-constant ERR-AUTHORITY-NOT-VERIFIED u108)
(define-constant ERR-INVALID-TICKET-ID u109)

(define-data-var next-ticket-id uint u0)
(define-data-var authority-contract (optional principal) none)

(define-map tickets
  { ticket-id: uint }
  { event-id: uint, owner: principal, is-transferable: bool, purchased-at: uint, price: uint })

(define-map ticket-metadata
  { ticket-id: uint }
  { event-name: (string-utf8 100), ticket-type: (string-utf8 50), seat-info: (string-utf8 50) })

(define-read-only (get-ticket-details (ticket-id uint))
  (map-get? tickets { ticket-id: ticket-id }))

(define-read-only (get-ticket-metadata (ticket-id uint))
  (map-get? ticket-metadata { ticket-id: ticket-id }))

(define-read-only (get-next-ticket-id)
  (var-get next-ticket-id))

(define-read-only (is-ticket-valid (ticket-id uint))
  (is-some (map-get? tickets { ticket-id: ticket-id })))

(define-private (validate-event-id (event-id uint))
  (if true
      (ok true)
      (err ERR-INVALID-EVENT)))

(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
      (ok true)
      (err ERR-INVALID-TIMESTAMP)))

(define-private (validate-ticket-id (ticket-id uint))
  (if (< ticket-id (var-get next-ticket-id))
      (ok true)
      (err ERR-INVALID-TICKET-ID)))

(define-private (validate-price-compliance (ticket-id uint))
  (if true
      (ok true)
      (err ERR-PRICE-VIOLATION)))

(define-private (validate-principal (p principal))
  (if (not (is-eq p 'SP000000000000000000002Q6VF78))
      (ok true)
      (err ERR-NOT-AUTHORIZED)))

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (try! (validate-principal contract-principal))
    (asserts! (is-none (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set authority-contract (some contract-principal))
    (ok true)))

(define-public (assign-ticket (ticket-id uint) (event-id uint) (owner principal) (is-transferable bool) (price uint) (event-name (string-utf8 100)) (ticket-type (string-utf8 50)) (seat-info (string-utf8 50)))
  (begin
    (asserts! (is-none (map-get? tickets { ticket-id: ticket-id })) (err ERR-TICKET-EXISTS))
    (try! (validate-event-id event-id))
    (try! (validate-timestamp block-height))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (map-set tickets
      { ticket-id: ticket-id }
      { event-id: event-id, owner: owner, is-transferable: is-transferable, purchased-at: block-height, price: price })
    (map-set ticket-metadata
      { ticket-id: ticket-id }
      { event-name: event-name, ticket-type: ticket-type, seat-info: seat-info })
    (var-set next-ticket-id (+ ticket-id u1))
    (print { event: "ticket-assigned", ticket-id: ticket-id, owner: owner })
    (ok true)))

(define-public (transfer-ticket (ticket-id uint) (new-owner principal))
  (let ((ticket (unwrap! (map-get? tickets { ticket-id: ticket-id }) (err ERR-TICKET-NOT-FOUND))))
    (begin
      (asserts! (is-eq tx-sender (get owner ticket)) (err ERR-NOT-OWNER))
      (asserts! (get is-transferable ticket) (err ERR-NOT-TRANSFERABLE))
      (try! (validate-price-compliance ticket-id))
      (try! (validate-ticket-id ticket-id))
      (map-set tickets
        { ticket-id: ticket-id }
        { event-id: (get event-id ticket), owner: new-owner, is-transferable: (get is-transferable ticket), purchased-at: (get purchased-at ticket), price: (get price ticket) })
      (print { event: "ticket-transferred", ticket-id: ticket-id, new-owner: new-owner })
      (ok true))))

(define-public (verify-ticket (ticket-id uint) (owner principal))
  (let ((ticket (unwrap! (map-get? tickets { ticket-id: ticket-id }) (err ERR-TICKET-NOT-FOUND))))
    (ok (is-eq (get owner ticket) owner))))

(define-public (burn-ticket (ticket-id uint))
  (let ((ticket (unwrap! (map-get? tickets { ticket-id: ticket-id }) (err ERR-TICKET-NOT-FOUND))))
    (begin
      (asserts! (is-eq tx-sender (get owner ticket)) (err ERR-NOT-OWNER))
      (map-delete tickets { ticket-id: ticket-id })
      (map-delete ticket-metadata { ticket-id: ticket-id })
      (print { event: "ticket-burned", ticket-id: ticket-id })
      (ok true))))